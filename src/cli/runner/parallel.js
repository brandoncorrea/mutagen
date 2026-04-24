/**
 * Parallel single-file mutation execution.
 * Uses an in-process worker pool with per-worker temp project copies.
 * Each worker writes mutations to its own copy — no file conflicts.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'

import { generateMutations } from '../../core/generate.js'
import { createPool } from '../../core/pool.js'
import { assignMutationIds } from '../../core/mutation-id.js'
import { toJsonMutants } from '../../core/report-data.js'
import { createTempCopy } from '../../core/temp-copy.js'
import { printRunReport } from '../report.js'
import { createOrderedBuffer } from '../progress.js'
import { runPreflightTests, reportMutation, printBanner } from './shared.js'
import { STATUS } from '../../core/mutation-status.js'
import { DEFAULT_WORKER_COUNT } from '../shared.js'

export function createBatchPool({
  workerCount = DEFAULT_WORKER_COUNT, sourceFile, createRunner
}) {
  return createPool({
    workerCount,
    createRunner: async () =>
      await createRunnerWithOptions({ sourceFile, createRunner })
  })
}

/**
 * @returns {{
 *   survived: number,
 *   killed: number,
 *   timedOut: number,
 *   jsonData: {
 *     path: string,
 *     mutants: Array
 *   },
 *   error?: boolean
 * }}
 */
export async function runParallel(options) {
  const {
    sourceFile,
    createRunner,
    targetLine,
    timeout,
    workerCount = DEFAULT_WORKER_COUNT,
    out
  } = options
  const original = readFileSync(sourceFile, 'utf-8')

  printBanner(
    out, `MUTAGEN (parallel — ${workerCount} workers)`,
    sourceFile, targetLine, timeout
  )

  const preflightRunner = await createRunner(sourceFile)

  try {
    return await runAfterPreflight(
      preflightRunner,
      { ...options, workerCount, original, out }
    )
  } finally {
    await preflightRunner.close()
  }
}

async function runAfterPreflight(preflightRunner, options) {
  const {
    sourceFile, mutationConfig, targetLine,
    retestMutations, original, out
  } = options

  const preflight = await runPreflightTests(out, preflightRunner)
  if (preflight.error) return preflight
  out.log(`Tests pass on original source. Beginning mutations.\n`)

  const mutations = retestMutations
    || generateMutations(original, mutationConfig, targetLine)
  const relPath = relative(process.cwd(), sourceFile)
  assignMutationIds(mutations, relPath)
  out.log(`Found ${mutations.length} mutation(s) to run.\n`)

  return await executeWithPool(mutations, options)
}

async function executeWithPool(mutations, options) {
  return options.pool
    ? await runWithExternalPool(options.pool, mutations, options)
    : await runWithNewPool(mutations, options)
}

async function runWithExternalPool(pool, mutations, options) {
  await pool.switchFile(options.sourceFile)
  return await runPool(pool, mutations, options)
}

async function runWithNewPool(mutations, options) {
  const { workerCount } = options
  const createRunner = async () => await createRunnerWithOptions(options)
  const pool = createPool({ workerCount, createRunner })

  try {
    return await runPool(pool, mutations, options)
  } finally {
    await pool.close()
  }
}

async function createRunnerWithOptions(options) {
  const { sourceFile, createRunner } = options
  const tempCopy = createTempCopy(process.cwd())
  const initialTemp = tempCopy.resolve(sourceFile)

  const state = {
    sourceFile,
    tempSource: initialTemp,
    runner: await createRunner(initialTemp, { root: tempCopy.root })
  }

  return {
    applyMutation(source) { writeFileSync(state.tempSource, source) },
    async run() {
      const result = await state.runner.run()
      return {
        ...result,
        killedBy: tempCopy.mapPaths(result.killedBy),
        coveredBy: tempCopy.mapPaths(result.coveredBy)
      }
    },
    async switchFile(newSourceFile) {
      await switchRunnerToFile(state, tempCopy, createRunner, newSourceFile)
    },
    async close() {
      await state.runner.close()
      tempCopy.cleanup()
    }
  }
}

async function switchRunnerToFile(state, tempCopy, createRunner, newSourceFile) {
  writeFileSync(state.tempSource, readFileSync(state.sourceFile, 'utf-8'))
  state.sourceFile = newSourceFile
  state.tempSource = tempCopy.resolve(newSourceFile)
  if (state.runner.switchFile)
    return await state.runner.switchFile(state.tempSource)
  await state.runner.close()
  state.runner = await createRunner(
    state.tempSource, { root: tempCopy.root }
  )
}

async function runPool(
  pool, mutations,
  { sourceFile, timeout, survivorsOnly, out, onProgress }
) {
  let completed = 0
  const total = mutations.length
  const orderedEmit = onProgress
    ? createOrderedBuffer(onProgress)
    : null
  const progressIndex = orderedEmit
    ? new Map(mutations.map((mutation, index) => [mutation, index]))
    : null

  function onResult({ mutation, status }) {
    completed++
    if (progressIndex)
      orderedEmit(progressIndex.get(mutation), status)
    if (!survivorsOnly || status === STATUS.SURVIVED)
      reportMutation(out, total, { number: completed, ...mutation }, status)
  }

  const outcomes = await pool.run(mutations, { timeout, onResult })

  printRunReport(mutations, outcomes, out)

  return {
    survived: outcomes.survived.length,
    killed: outcomes.killed.length + outcomes.timedOut.length,
    timedOut: outcomes.timedOut.length,
    jsonData: toJsonMutants(sourceFile, outcomes, { survivorsOnly })
  }
}

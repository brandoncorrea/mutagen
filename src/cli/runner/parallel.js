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

const DEFAULT_WORKER_COUNT = 2

export function createBatchPool({ workerCount = DEFAULT_WORKER_COUNT, sourceFile, createRunner }) {
  return createPool({
    workerCount,
    createRunner: async () =>
      await createRunnerWithOptions({ sourceFile, createRunner })
  })
}

/**
 * @returns {{ survived: number, killed: number, timedOut: number, jsonData: { path: string, mutants: Array }, error?: boolean }}
 */
export async function runParallel(options) {
  const {
    sourceFile,
    mutationConfig,
    createRunner,
    targetLine,
    timeout,
    survivorsOnly,
    retestMutations,
    workerCount = DEFAULT_WORKER_COUNT,
    pool: externalPool,
    out = console.log
  } = options
  const original = readFileSync(sourceFile, 'utf-8')

  printBanner(out, `MUTAGEN (parallel — ${workerCount} workers)`, sourceFile, targetLine, timeout)

  const preflightRunner = await createRunner(sourceFile)
  const runOptions = {
    sourceFile,
    mutationConfig,
    createRunner,
    targetLine,
    timeout,
    survivorsOnly,
    retestMutations,
    workerCount,
    pool: externalPool,
    original,
    out
  }

  try {
    return await runAfterPreflight(preflightRunner, runOptions)
  } finally {
    await preflightRunner.close()
  }
}

async function runAfterPreflight(preflightRunner, options) {
  const { sourceFile, mutationConfig, createRunner, targetLine, timeout, survivorsOnly, retestMutations, workerCount, original, out } = options

  const preflight = await runPreflightTests(out, preflightRunner)
  if (preflight.error) return preflight
  out(`Tests pass on original source. Beginning mutations.\n`)

  const mutations = retestMutations || generateMutations(original, mutationConfig, targetLine)
  assignMutationIds(mutations, relative(process.cwd(), sourceFile))
  out(`Found ${mutations.length} mutation(s) to run.\n`)

  return await executeWithPool(mutations, { sourceFile, createRunner, workerCount, pool: options.pool, timeout, survivorsOnly, out, onProgress: options.onProgress })
}

async function executeWithPool(mutations, options) {
  const { pool: externalPool } = options
  if (externalPool)
    return await runWithExternalPool(externalPool, mutations, options)
  return await runWithNewPool(mutations, options)
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
  const worktree = createTempCopy(process.cwd())
  const initialTemp = worktree.resolve(sourceFile)

  const state = {
    sourceFile,
    tempSource: initialTemp,
    runner: await createRunner(initialTemp, { root: worktree.root })
  }

  return {
    applyMutation(source) { writeFileSync(state.tempSource, source) },
    async run() {
      const result = await state.runner.run()
      return {
        ...result,
        killedBy: worktree.mapPaths(result.killedBy),
        coveredBy: worktree.mapPaths(result.coveredBy)
      }
    },
    async switchFile(newSourceFile) {
      writeFileSync(state.tempSource, readFileSync(state.sourceFile, 'utf-8'))
      state.sourceFile = newSourceFile
      state.tempSource = worktree.resolve(newSourceFile)
      if (state.runner.switchFile) {
        await state.runner.switchFile(state.tempSource)
      } else {
        await state.runner.close()
        state.runner = await createRunner(state.tempSource, { root: worktree.root })
      }
    },
    async close() {
      await state.runner.close()
      worktree.cleanup()
    }
  }
}

async function runPool(pool, mutations, { sourceFile, timeout, survivorsOnly, out, onProgress }) {
  let completed = 0
  const total = mutations.length
  const orderedEmit = onProgress
    ? createOrderedBuffer(onProgress)
    : null
  const indexed = orderedEmit
    ? mutations.map((m, i) => ({ ...m, _progressIndex: i }))
    : mutations

  function onResult({ mutation, status }) {
    completed++
    orderedEmit?.(mutation._progressIndex, status)
    if (!survivorsOnly || status === 'SURVIVED')
      reportMutation(out, total, { number: completed, ...mutation }, status)
  }

  const outcomes = await pool.run(indexed, { timeout, onResult })

  printRunReport(mutations, outcomes, out)

  return {
    survived: outcomes.survived.length,
    killed: outcomes.killed.length + outcomes.timedOut.length,
    timedOut: outcomes.timedOut.length,
    jsonData: toJsonMutants(sourceFile, outcomes, { survivorsOnly })
  }
}

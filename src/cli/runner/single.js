/**
 * Sequential single-file mutation execution.
 * Creates a temp project copy and writes mutations there.
 * Original source files are never modified (crash-safe).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'

import { generateMutations } from '../../core/generate.js'
import { withTimeout } from '../../core/timeout.js'
import { assignMutationIds } from '../../core/mutation-id.js'
import { STATUS } from '../../core/mutation-status.js'
import { toJsonMutants } from '../../core/report-data.js'
import { createTempCopy } from '../../core/temp-copy.js'
import { printRunReport } from '../report.js'
import { runPreflightTests, reportMutation, printBanner } from './shared.js'

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
export async function runSingle(options) {
  const {
    sourceFile,
    createRunner,
    targetLine,
    timeout,
    out
  } = options
  const original = readFileSync(sourceFile, 'utf-8')
  const tempCopy = createTempCopy(process.cwd())

  printBanner(out, 'MUTAGEN', sourceFile, targetLine, timeout)

  const tempSourceFile = tempCopy.resolve(sourceFile)
  const runner = await createRunner(tempSourceFile, { root: tempCopy.root })

  const runOptions = {
    original,
    tempCopy,
    tempSourceFile,
    runner,
    ...options
  }

  try {
    return await runMutations(runOptions)
  } finally {
    await runner.close()
    tempCopy.cleanup()
  }
}

async function runMutations(runOptions) {
  const {
    out,
    runner,
    sourceFile,
    targetLine,
    original,
    mutationConfig,
    survivorsOnly,
    retestMutations
  } = runOptions
  const preflight = await runPreflightTests(out, runner)
  if (preflight.error) return preflight
  out.log(`Tests pass on original source. Beginning mutations.\n`)

  const mutations = retestMutations
    || generateMutations(original, mutationConfig, targetLine)
  const relPath = relative(process.cwd(), sourceFile)
  assignMutationIds(mutations, relPath)
  out.log(`Found ${mutations.length} mutation(s) to run.\n`)

  const outcomes = { killed: [], survived: [], timedOut: [] }

  for (let i = 0; i < mutations.length; i++)
    await runMutation(runOptions, mutations.length, outcomes, {
      number: i + 1,
      ...mutations[i]
    })

  printRunReport(mutations, outcomes, out)

  return {
    survived: outcomes.survived.length,
    killed: outcomes.killed.length + outcomes.timedOut.length,
    timedOut: outcomes.timedOut.length,
    jsonData: toJsonMutants(sourceFile, outcomes, { survivorsOnly })
  }
}

async function runMutation(runOptions, total, outcomes, mutation) {
  const { runner, timeout, tempSourceFile, tempCopy } = runOptions
  try {
    writeFileSync(tempSourceFile, mutation.source)

    const result = await withTimeout(runner.run, timeout)

    if (result.passed) {
      outcomes.survived.push({
        ...mutation,
        coveredBy: tempCopy.mapPaths(result.coveredBy)
      })
      maybeReportMutation(runOptions, total, mutation, STATUS.SURVIVED)
    } else {
      outcomes.killed.push({
        ...mutation,
        killedBy: tempCopy.mapPaths(result.killedBy)
      })
      maybeReportMutation(runOptions, total, mutation, STATUS.KILLED)
    }
  } catch (err) {
    if (err.message?.includes('timed out')) {
      outcomes.timedOut.push(mutation)
      maybeReportMutation(runOptions, total, mutation, STATUS.TIMEOUT)
    } else {
      outcomes.killed.push(mutation)
      maybeReportMutation(runOptions, total, mutation, STATUS.KILLED_ERROR)
    }
  }
}

function maybeReportMutation(runOptions, total, mutation, status) {
  const { out, survivorsOnly, onProgress } = runOptions
  onProgress?.(status)
  if (!survivorsOnly || status === STATUS.SURVIVED)
    reportMutation(out, total, mutation, status)
}

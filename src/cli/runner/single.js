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
import { toJsonMutants } from '../../core/report-data.js'
import { createTempCopy } from '../../core/temp-copy.js'
import { printRunReport } from '../report.js'
import { runPreflightTests, reportMutation, printBanner } from './shared.js'

/**
 * @returns {{ survived: number, killed: number, timedOut: number, jsonData: { path: string, mutants: Array }, error?: boolean }}
 */
export async function runSingle(options) {
  const { sourceFile, mutationConfig, createRunner, targetLine, timeout, survivorsOnly, retestMutations, out = console.log } = options
  const original = readFileSync(sourceFile, 'utf-8')
  const worktree = createTempCopy(process.cwd())

  printBanner(out, 'MUTAGEN', sourceFile, targetLine, timeout)

  const tempSourceFile = worktree.resolve(sourceFile)
  const runner = await createRunner(tempSourceFile, { root: worktree.root })

  const runOptions = { out, runner, timeout, sourceFile, tempSourceFile, targetLine, original, mutationConfig, survivorsOnly, retestMutations, worktree, onProgress: options.onProgress }

  try {
    return await runMutations(runOptions)
  } finally {
    await runner.close()
    worktree.cleanup()
  }
}

async function runMutations(runOptions) {
  const { out, runner, sourceFile, targetLine, original, mutationConfig, survivorsOnly, retestMutations } = runOptions
  const preflight = await runPreflightTests(out, runner)
  if (preflight.error) return preflight
  out(`Tests pass on original source. Beginning mutations.\n`)

  const mutations = retestMutations || generateMutations(original, mutationConfig, targetLine)
  assignMutationIds(mutations, relative(process.cwd(), sourceFile))
  out(`Found ${mutations.length} mutation(s) to run.\n`)

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
  const { out, runner, timeout, tempSourceFile, survivorsOnly, worktree, onProgress } = runOptions
  try {
    writeFileSync(tempSourceFile, mutation.source)

    const result = await withTimeout(runner.run, timeout)

    if (result.passed) {
      outcomes.survived.push({ ...mutation, coveredBy: worktree.mapPaths(result.coveredBy) })
      onProgress?.('SURVIVED')
      reportMutation(out, total, mutation, 'SURVIVED')
    } else {
      outcomes.killed.push({ ...mutation, killedBy: worktree.mapPaths(result.killedBy) })
      onProgress?.('killed')
      if (!survivorsOnly) reportMutation(out, total, mutation, 'killed')
    }
  } catch (err) {
    if (err.message?.includes('timed out')) {
      outcomes.timedOut.push(mutation)
      onProgress?.('TIMEOUT (killed)')
      if (!survivorsOnly) reportMutation(out, total, mutation, 'TIMEOUT (killed)')
    } else {
      outcomes.killed.push(mutation)
      onProgress?.('killed (error)')
      if (!survivorsOnly) reportMutation(out, total, mutation, 'killed (error)')
    }
  }
}

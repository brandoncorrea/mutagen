/**
 * Sequential single-file mutation execution.
 * Creates a temp project copy (worktree) and writes mutations there.
 * Original source files are never modified (crash-safe).
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { generateMutations } from '../../core/generate.js'
import { withTimeout } from '../../core/timeout.js'
import { toJsonMutants } from '../../core/report-data.js'
import { createWorktree } from '../../core/worktree.js'
import { printRunReport } from '../report.js'
import { runPreflightTests, reportMutation, printBanner } from './shared.js'

export async function runSingle(options) {
  const { sourceFile, mutationConfig, createRunner, targetLine, timeout, out = console.log } = options
  const original = readFileSync(sourceFile, 'utf-8')
  const worktree = createWorktree(process.cwd())

  printBanner(out, 'MUTAGEN', sourceFile, targetLine, timeout)

  const tempSourceFile = worktree.resolve(sourceFile)
  const runner = await createRunner(tempSourceFile, { root: worktree.root })

  const opts = { out, runner, timeout, sourceFile, tempSourceFile, targetLine, original, mutationConfig }

  try {
    return await runMutations(opts)
  } finally {
    await runner.close()
    worktree.cleanup()
  }
}

async function runMutations(opts) {
  const { out, runner, sourceFile, targetLine, original, mutationConfig } = opts
  const preflight = await runPreflightTests(out, runner)
  if (preflight.error) return preflight
  out(`Tests pass on original source. Beginning mutations.\n`)

  const mutations = generateMutations(original, mutationConfig, targetLine)
  out(`Found ${mutations.length} mutation(s) to run.\n`)

  const outcomes = { killed: [], survived: [], timedOut: [] }

  for (let i = 0; i < mutations.length; i++)
    await runMutation(opts, mutations.length, outcomes, {
      number: i + 1,
      ...mutations[i]
    })

  printRunReport(mutations, outcomes, out)

  return {
    survived: outcomes.survived.length,
    killed: outcomes.killed.length + outcomes.timedOut.length,
    timedOut: outcomes.timedOut.length,
    jsonData: toJsonMutants(sourceFile, outcomes)
  }
}

async function runMutation(opts, total, outcomes, mutation) {
  const { out, runner, timeout, tempSourceFile } = opts
  try {
    writeFileSync(tempSourceFile, mutation.source)

    const result = await withTimeout(runner.run, timeout)

    if (result.passed) {
      outcomes.survived.push(mutation)
      reportMutation(out, total, mutation, 'SURVIVED')
    } else {
      outcomes.killed.push({ ...mutation, killedBy: result.killedBy })
      reportMutation(out, total, mutation, 'killed')
    }
  } catch (err) {
    if (err.message?.includes('timed out')) {
      outcomes.timedOut.push(mutation)
      reportMutation(out, total, mutation, 'TIMEOUT (killed)')
    } else {
      outcomes.killed.push(mutation)
      reportMutation(out, total, mutation, 'killed (error)')
    }
  }
}

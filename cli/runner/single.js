/**
 * Sequential single-file mutation execution.
 *
 * Runner interface:
 *   { run, close }                       — file-I/O mode (writes mutated source to disk)
 *   { run, close, setMutant, clearMutant } — in-memory mode (no file I/O per mutation)
 *
 * The runner is duck-typed: if setMutant exists, in-memory mode is used.
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { generateMutations } from '../../core/engine.js'
import { withTimeout } from '../../core/timeout.js'
import { toJsonMutants } from '../../core/report-data.js'
import { printRunReport } from '../report.js'
import { runPreflightTests, reportMutation, printBanner } from './shared.js'

export async function runSingle(options) {
  const { sourceFile, prepared, createRunner, targetLine, timeout, out = console.log } = options
  const original = readFileSync(sourceFile, 'utf-8')

  printBanner(out, 'MUTAGEN', sourceFile, targetLine, timeout)

  const runner = await createRunner(sourceFile)
  const opts = { out, runner, timeout, sourceFile, targetLine, original, prepared }

  try {
    return await runMutations(opts)
  } finally {
    await runner.close()
  }
}

async function runMutations(opts) {
  const { out, runner, sourceFile, targetLine, original, prepared } = opts
  const preflight = await runPreflightTests(out, runner)
  if (preflight.error) return preflight
  out(`Tests pass on original source. Beginning mutations.\n`)

  const mutations = generateMutations(original, prepared, targetLine)
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
  const { out, runner, timeout, sourceFile, original } = opts
  const inMemory = typeof runner.setMutant === 'function'
  try {
    if (inMemory) runner.setMutant(mutation.source)
    else writeFileSync(sourceFile, mutation.source)

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
  } finally {
    if (inMemory) runner.clearMutant()
    else writeFileSync(sourceFile, original)
  }
}

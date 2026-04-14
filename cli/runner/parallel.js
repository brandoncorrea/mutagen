/**
 * Parallel single-file mutation execution.
 * Uses an in-process worker pool for concurrent mutation testing.
 */

import { readFileSync } from 'node:fs'

import { generateMutations } from '../../core/engine.js'
import { createPool } from '../../core/pool.js'
import { toJsonMutants } from '../../core/report-data.js'
import { printRunReport } from '../report.js'
import { runPreflightTests, reportMutation, printBanner } from './shared.js'

const DEFAULT_WORKER_COUNT = 2

export async function runParallel(options) {
  const {
    sourceFile, prepared, createRunner, targetLine,
    timeout, workerCount = DEFAULT_WORKER_COUNT, out = console.log
  } = options
  const original = readFileSync(sourceFile, 'utf-8')

  printBanner(out, `MUTAGEN (parallel — ${workerCount} workers)`, sourceFile, targetLine, timeout)

  const preflightRunner = await createRunner(sourceFile)

  try {
    const preflight = await runPreflightTests(out, preflightRunner)
    if (preflight.error) return preflight
    out(`Tests pass on original source. Beginning mutations.\n`)

    const mutations = generateMutations(original, prepared, targetLine)
    out(`Found ${mutations.length} mutation(s) to run.\n`)

    const pool = createPool({ workerCount, createRunner })

    try {
      let completed = 0
      const total = mutations.length

      const onResult = ({ mutation, status }) => {
        completed++
        reportMutation(out, total, { number: completed, ...mutation }, status)
      }

      const outcomes = await pool.run(mutations, { timeout, onResult })

      printRunReport(mutations, outcomes, out)

      return {
        survived: outcomes.survived.length,
        killed: outcomes.killed.length + outcomes.timedOut.length,
        timedOut: outcomes.timedOut.length,
        jsonData: toJsonMutants(sourceFile, outcomes)
      }
    } finally {
      await pool.close()
    }
  } finally {
    await preflightRunner.close()
  }
}

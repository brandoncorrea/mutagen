/**
 * Parallel single-file mutation execution.
 * Uses an in-process worker pool for concurrent mutation testing.
 */

import { readFileSync } from 'node:fs'

import { generateMutations } from '../../core/generate.js'
import { createPool } from '../../core/pool.js'
import { toJsonMutants } from '../../core/report-data.js'
import { printRunReport } from '../report.js'
import { runPreflightTests, reportMutation, printBanner } from './shared.js'

const DEFAULT_WORKER_COUNT = 2

export async function runParallel(options) {
  const {
    sourceFile,
    mutationConfig,
    prepared,
    createRunner,
    targetLine,
    timeout,
    workerCount = DEFAULT_WORKER_COUNT,
    out = console.log
  } = options
  const config = mutationConfig || prepared
  const original = readFileSync(sourceFile, 'utf-8')

  printBanner(out, `MUTAGEN (parallel — ${workerCount} workers)`, sourceFile, targetLine, timeout)

  const preflightRunner = await createRunner(sourceFile)
  const runOptions = {
    sourceFile,
    mutationConfig: config,
    createRunner,
    targetLine,
    timeout,
    workerCount,
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
  const { sourceFile, mutationConfig, createRunner, targetLine, timeout, workerCount, original, out } = options

  const preflight = await runPreflightTests(out, preflightRunner)
  if (preflight.error) return preflight
  out(`Tests pass on original source. Beginning mutations.\n`)

  const mutations = generateMutations(original, mutationConfig, targetLine)
  out(`Found ${mutations.length} mutation(s) to run.\n`)

  return await executeWithPool(mutations, { sourceFile, createRunner, workerCount, timeout, out })
}

async function executeWithPool(mutations, options) {
  const { createRunner, workerCount } = options
  const pool = createPool({ workerCount, createRunner })
  try {
    return await runPool(pool, mutations, options)
  } finally {
    await pool.close()
  }
}

async function runPool(pool, mutations, { sourceFile, timeout, out }) {
  let completed = 0
  const total = mutations.length

  function onResult({ mutation, status }) {
    reportMutation(out, total, { number: ++completed, ...mutation }, status)
  }

  const outcomes = await pool.run(mutations, { timeout, onResult })

  printRunReport(mutations, outcomes, out)

  return {
    survived: outcomes.survived.length,
    killed: outcomes.killed.length + outcomes.timedOut.length,
    timedOut: outcomes.timedOut.length,
    jsonData: toJsonMutants(sourceFile, outcomes)
  }
}

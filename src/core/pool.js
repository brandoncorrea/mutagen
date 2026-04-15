/**
 * Worker pool manager for parallel mutation testing.
 * Distributes mutations across in-process runner instances for concurrent execution.
 *
 * Runner interface:
 *   { applyMutation(source), run(), close() }
 *
 * Usage:
 *   const pool = createPool({ workerCount: 4, createRunner })
 *   const results = await pool.run(mutations, { timeout, onResult })
 *   await pool.close()
 */

import { withTimeout } from './timeout.js'

/**
 * Create a worker pool for parallel mutation testing.
 *
 * Uses in-process async concurrency (not worker_threads). Workers are
 * async functions that pull from a shared queue. The queue is safe to
 * share because JavaScript is single-threaded — workers only yield at
 * await boundaries, never during queue.pop().
 *
 * @param {Object} options
 * @param {number} options.workerCount - number of concurrent workers
 * @param {Function} options.createRunner - async () => runner
 * @returns {{ run: Function, close: Function }}
 */
export function createPool(poolOptions) {
  const pool = { runners: [] }

  return {
    async run(mutations, options) {
      return await runPool(pool, mutations, poolOptions, options)
    },
    async close() {
      await closePool(pool)
    }
  }
}

async function runPool(pool, mutations, poolOptions, runOptions) {
  const outcomes = {
    killed: [],
    survived: [],
    timedOut: []
  }

  if (mutations.length) {
    await ensureRunners(pool, poolOptions)
    await runMutationsParallel(pool.runners, mutations, outcomes, runOptions)
  }

  return outcomes
}

async function closePool(pool) {
  if (pool.closed) return
  pool.closed = true
  await Promise.all(pool.runners.map(r => r.close()))
}

async function ensureRunners(pool, { createRunner, workerCount }) {
  if (pool.runners.length) return
  const runners = Array.from({ length: workerCount }, createRunner)
  const created = await Promise.all(runners)
  pool.runners.push(...created)
}

async function runMutationsParallel(runners, mutations, outcomes, options) {
  const queue = mutations.slice().reverse()
  const workers = runners.map(runner =>
    processQueue(runner, queue, outcomes, options))
  await Promise.all(workers)
}

async function processQueue(runner, queue, outcomes, options) {
  while (queue.length)
    await runOne(runner, queue.pop(), outcomes, options)
}

async function runOne(runner, mutation, outcomes, options = {}) {
  const { timeout, onResult } = options
  try {
    runner.applyMutation(mutation.source)
    const { passed, killedBy, coveredBy } = await withTimeout(runner.run, timeout)

    if (passed) {
      outcomes.survived.push({ ...mutation, coveredBy })
      onResult?.({ mutation, status: 'SURVIVED' })
    } else {
      outcomes.killed.push({ ...mutation, killedBy })
      onResult?.({ mutation, status: 'killed' })
    }
  } catch (err) {
    if (err.message?.includes('timed out')) {
      outcomes.timedOut.push(mutation)
      onResult?.({ mutation, status: 'TIMEOUT (killed)' })
    } else {
      outcomes.killed.push(mutation)
      onResult?.({ mutation, status: 'killed' })
    }
  }
}

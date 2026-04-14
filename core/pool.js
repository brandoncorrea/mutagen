/**
 * Worker pool manager for parallel mutation testing.
 * Distributes mutations across in-process runner instances for concurrent execution.
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
 * @param {Function} options.createRunner - async (sourceFile) => runner
 * @returns {{ run: Function, close: Function }}
 */
export function createPool({ workerCount, createRunner }) {
  const runners = []
  let closed = false

  return { run, close }

  async function run(mutations, options = {}) {
    const { timeout, onResult } = options
    const outcomes = { killed: [], survived: [], timedOut: [] }

    if (!mutations.length) return outcomes

    await ensureRunners()

    const queue = mutations.slice().reverse()
    const workers = runners.map(runner => processQueue(runner, queue, timeout, outcomes, onResult))
    await Promise.all(workers)

    return outcomes
  }

  async function ensureRunners() {
    if (runners.length) return
    const pending = Array.from({ length: workerCount }, () => createRunner())
    const created = await Promise.all(pending)
    runners.push(...created)
  }

  async function close() {
    if (closed) return
    closed = true
    await Promise.all(runners.map(r => r.close()))
  }
}

async function processQueue(runner, queue, timeout, outcomes, onResult) {
  while (queue.length) {
    const mutation = queue.pop()
    await runOne(runner, mutation, timeout, outcomes, onResult)
  }
}

async function runOne(runner, mutation, timeout, outcomes, onResult) {
  try {
    runner.setMutant(mutation.source)
    const result = await withTimeout(runner.run, timeout)

    if (result.passed) {
      outcomes.survived.push(mutation)
      onResult?.({ mutation, status: 'survived' })
    } else {
      outcomes.killed.push({ ...mutation, killedBy: result.killedBy })
      onResult?.({ mutation, status: 'killed' })
    }
  } catch (err) {
    if (err.message?.includes('timed out')) {
      outcomes.timedOut.push(mutation)
      onResult?.({ mutation, status: 'timedOut' })
    } else {
      outcomes.killed.push(mutation)
      onResult?.({ mutation, status: 'killed' })
    }
  } finally {
    runner.clearMutant()
  }
}


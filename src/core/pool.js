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
import { STATUS } from './mutation-status.js'

// Module-level tracking of active pools for process signal cleanup
const activePools = new Set()
let handlersInstalled = false

async function onSignal(signal) {
  await cleanupAllPools()
  removeSignalHandlers()
  process.kill(process.pid, signal)
}

function onExit() {
  for (const pool of activePools) {
    pool.closed = true
    for (const r of pool.runners)
      try { r.close() } catch {}
  }
  activePools.clear()
}

function installSignalHandlers() {
  if (handlersInstalled) return
  handlersInstalled = true
  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onSignal)
  process.on('exit', onExit)
}

function removeSignalHandlers() {
  if (!handlersInstalled) return
  handlersInstalled = false
  process.removeListener('SIGTERM', onSignal)
  process.removeListener('SIGINT', onSignal)
  process.removeListener('exit', onExit)
}

function trackPool(pool) {
  activePools.add(pool)
  installSignalHandlers()
}

function untrackPool(pool) {
  activePools.delete(pool)
  if (activePools.size === 0) removeSignalHandlers()
}

async function cleanupAllPools() {
  const pools = [...activePools]
  await Promise.all(pools.map(p => closePool(p).catch(() => {})))
}

export { cleanupAllPools as _cleanupAllPools }

export function _resetCleanupState() {
  activePools.clear()
  removeSignalHandlers()
}

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
  trackPool(pool)

  return {
    async run(mutations, options) {
      return await runPool(pool, mutations, poolOptions, options)
    },
    async switchFile(sourceFile) {
      await Promise.all(pool.runners.map(r => r.switchFile(sourceFile)))
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

const CLOSE_TIMEOUT = 5000

async function closePool(pool) {
  if (pool.closed) return
  pool.closed = true
  untrackPool(pool)
  await Promise.all(pool.runners.map(r =>
    Promise.race([
      r.close(),
      new Promise(resolve => setTimeout(resolve, CLOSE_TIMEOUT))
    ])
  ))
}

async function ensureRunners(pool, { createRunner, workerCount }) {
  if (pool.runners.length) return
  raiseMaxListeners(workerCount)
  const runners = Array.from({ length: workerCount }, createRunner)
  const created = await Promise.all(runners)
  pool.runners.push(...created)
}

function raiseMaxListeners(workerCount) {
  const needed = workerCount + 5
  if (process.getMaxListeners() < needed)
    process.setMaxListeners(needed)
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
      onResult?.({ mutation, status: STATUS.SURVIVED })
    } else {
      outcomes.killed.push({ ...mutation, killedBy })
      onResult?.({ mutation, status: STATUS.KILLED })
    }
  } catch (err) {
    if (err.message?.includes('timed out')) {
      outcomes.timedOut.push(mutation)
      onResult?.({ mutation, status: STATUS.TIMEOUT })
    } else {
      outcomes.killed.push(mutation)
      onResult?.({ mutation, status: STATUS.KILLED })
    }
  }
}

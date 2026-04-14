/**
 * Worker pool manager for parallel mutation testing.
 * Distributes mutations across in-process runner instances for concurrent execution.
 *
 * Usage:
 *   const pool = createPool({ workerCount: 4, createRunner })
 *   const results = await pool.run(mutations, { timeout, onResult })
 *   await pool.close()
 */

/**
 * Create a worker pool for parallel mutation testing.
 *
 * Each worker holds its own runner instance (created via createRunner).
 * Mutations are distributed round-robin to idle workers. Results are
 * collected into killed/survived/timedOut arrays.
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

    const queue = mutations.slice()
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
    const mutation = queue.shift()
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
      mutation.killedBy = result.killedBy
      outcomes.killed.push(mutation)
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

function withTimeout(fn, ms) {
  if (!ms) return fn()
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Mutation timed out after ${ms}ms`)), ms))
  ])
}

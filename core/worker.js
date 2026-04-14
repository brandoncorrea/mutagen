/**
 * Worker thread entry point for parallel mutation testing.
 * Receives mutations via parentPort, applies them using the vitest
 * runner's in-memory mutant switching, runs tests, and reports results.
 *
 * Message protocol:
 *   Parent → Worker:
 *     { type: 'init', sourceFile, options }  — create vitest runner
 *     { type: 'mutation', id, source }        — run one mutation
 *     { type: 'close' }                       — shut down runner
 *
 *   Worker → Parent:
 *     { type: 'ready' }                       — runner created
 *     { type: 'result', id, passed, killedBy } — mutation result
 *     { type: 'error', id?, message }         — error
 */

import { parentPort } from 'node:worker_threads'
import { createVitestRunner } from '../runners/vitest.js'

export function createWorkerHandler(port, runnerFactory = createVitestRunner) {
  let runner = null

  port.on('message', async (msg) => {
    if (msg.type === 'init') {
      try {
        runner = await runnerFactory(msg.sourceFile, msg.options)
        port.postMessage({ type: 'ready' })
      } catch (err) {
        port.postMessage({ type: 'error', message: err.message })
      }
    } else if (msg.type === 'mutation') {
      try {
        runner.setMutant(msg.source)
        const result = await runner.run()
        port.postMessage({
          type: 'result',
          id: msg.id,
          passed: result.passed,
          killedBy: result.killedBy
        })
      } catch (err) {
        port.postMessage({ type: 'error', id: msg.id, message: err.message })
      } finally {
        runner.clearMutant()
      }
    } else if (msg.type === 'close') {
      if (runner) await runner.close()
    }
  })
}

// Auto-start when used as worker thread entry point
if (parentPort)
  createWorkerHandler(parentPort)

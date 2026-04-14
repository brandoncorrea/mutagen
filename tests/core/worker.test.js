import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

import { createWorkerHandler } from '../../core/worker.js'

function createMockPort() {
  const emitter = new EventEmitter()
  emitter.postMessage = vi.fn()
  return emitter
}

function createMockRunner() {
  return {
    run: vi.fn().mockResolvedValue({ passed: true, killedBy: [] }),
    close: vi.fn().mockResolvedValue(undefined),
    setMutant: vi.fn(),
    clearMutant: vi.fn()
  }
}

describe('createWorkerHandler', () => {
  let port, mockRunner, runnerFactory

  beforeEach(() => {
    port = createMockPort()
    mockRunner = createMockRunner()
    runnerFactory = vi.fn().mockResolvedValue(mockRunner)
  })

  describe('init', () => {
    it('creates a runner and posts ready', async () => {
      createWorkerHandler(port, runnerFactory)

      port.emit('message', { type: 'init', sourceFile: 'src/a.js', options: { warm: false } })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({ type: 'ready' })
      })

      expect(runnerFactory).toHaveBeenCalledWith('src/a.js', { warm: false })
    })

    it('posts error when runner creation fails', async () => {
      runnerFactory.mockRejectedValue(new Error('vitest crash'))
      createWorkerHandler(port, runnerFactory)

      port.emit('message', { type: 'init', sourceFile: 'src/a.js', options: {} })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({
          type: 'error',
          message: 'vitest crash'
        })
      })
    })
  })

  describe('mutation', () => {
    it('applies mutation, runs tests, and posts result', async () => {
      mockRunner.run.mockResolvedValue({ passed: false, killedBy: ['test/a.test.js'] })
      createWorkerHandler(port, runnerFactory)

      port.emit('message', { type: 'init', sourceFile: 'src/a.js', options: {} })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({ type: 'ready' })
      })

      port.emit('message', { type: 'mutation', id: 0, source: 'mutated code' })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({
          type: 'result',
          id: 0,
          passed: false,
          killedBy: ['test/a.test.js']
        })
      })

      expect(mockRunner.setMutant).toHaveBeenCalledWith('mutated code')
      expect(mockRunner.clearMutant).toHaveBeenCalled()
    })

    it('clears mutant even when run throws', async () => {
      mockRunner.run.mockRejectedValue(new Error('test exploded'))
      createWorkerHandler(port, runnerFactory)

      port.emit('message', { type: 'init', sourceFile: 'src/a.js', options: {} })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({ type: 'ready' })
      })

      port.emit('message', { type: 'mutation', id: 3, source: 'bad code' })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({
          type: 'error',
          id: 3,
          message: 'test exploded'
        })
      })

      expect(mockRunner.clearMutant).toHaveBeenCalled()
    })

    it('posts passed result when tests pass', async () => {
      mockRunner.run.mockResolvedValue({ passed: true, killedBy: [] })
      createWorkerHandler(port, runnerFactory)

      port.emit('message', { type: 'init', sourceFile: 'src/a.js', options: {} })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({ type: 'ready' })
      })

      port.emit('message', { type: 'mutation', id: 1, source: 'survived code' })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({
          type: 'result',
          id: 1,
          passed: true,
          killedBy: []
        })
      })
    })
  })

  describe('close', () => {
    it('closes the runner', async () => {
      createWorkerHandler(port, runnerFactory)

      port.emit('message', { type: 'init', sourceFile: 'src/a.js', options: {} })
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({ type: 'ready' })
      })

      port.emit('message', { type: 'close' })
      await vi.waitFor(() => {
        expect(mockRunner.close).toHaveBeenCalled()
      })
    })

    it('is safe to close without init', async () => {
      createWorkerHandler(port, runnerFactory)

      port.emit('message', { type: 'close' })
      // Should not throw — no runner to close
      await new Promise(r => setTimeout(r, 10))
      expect(mockRunner.close).not.toHaveBeenCalled()
    })
  })
})

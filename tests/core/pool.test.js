/**
 * Tests for core/pool.js — worker pool manager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPool, _cleanupAllPools, _resetCleanupState } from '../../src/core/pool.js'

function fakeRunner(results = { passed: false, killedBy: ['test.js'] }) {
  return {
    run: vi.fn().mockResolvedValue(results),
    close: vi.fn().mockResolvedValue(),
    applyMutation: vi.fn()
  }
}

function fakeMutation(overrides = {}) {
  return {
    line: 1,
    original: 'x + y',
    mutated: 'x - y',
    name: 'arithmetic',
    source: 'const z = x - y',
    ...overrides
  }
}

describe('createPool', () => {
  it('returns an object with run and close methods', () => {
    const pool = createPool({ workerCount: 1, createRunner: vi.fn() })
    expect(pool).toHaveProperty('run')
    expect(pool).toHaveProperty('close')
    expect(typeof pool.run).toBe('function')
    expect(typeof pool.close).toBe('function')
  })

  describe('run', () => {
    it('runs mutations through the runner and collects killed results', async () => {
      const runner = fakeRunner({ passed: false, killedBy: ['test.js'] })
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })
      const mutations = [fakeMutation()]

      const results = await pool.run(mutations)
      await pool.close()

      expect(results.killed).toEqual([expect.objectContaining({
        name: 'arithmetic',
        killedBy: ['test.js']
      })])
      expect(results.survived).toEqual([])
    })

    it('collects survived mutations when tests pass', async () => {
      const runner = fakeRunner({ passed: true, killedBy: [] })
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })
      const mutations = [fakeMutation()]

      const results = await pool.run(mutations)
      await pool.close()

      expect(results.survived).toEqual([expect.objectContaining({ name: 'arithmetic' })])
      expect(results.killed).toEqual([])
    })

    it('includes coveredBy on survived mutations from runner result', async () => {
      const runner = fakeRunner({ passed: true, killedBy: [], coveredBy: ['test/a.test.js'] })
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })
      const mutations = [fakeMutation()]

      const results = await pool.run(mutations)
      await pool.close()

      expect(results.survived[0].coveredBy).toEqual(['test/a.test.js'])
    })

    it('distributes mutations across multiple workers', async () => {
      const runners = []
      const createRunner = vi.fn().mockImplementation(async () => {
        const r = fakeRunner({ passed: false, killedBy: ['t.js'] })
        runners.push(r)
        return r
      })
      const pool = createPool({ workerCount: 2, createRunner })
      const mutations = [
        fakeMutation({ name: 'mut-1' }),
        fakeMutation({ name: 'mut-2' }),
        fakeMutation({ name: 'mut-3' }),
        fakeMutation({ name: 'mut-4' })
      ]

      const results = await pool.run(mutations)
      await pool.close()

      expect(results.killed).toHaveLength(4)
      expect(runners.length).toBeLessThanOrEqual(2)
    })

    it('returns empty results for empty mutations array', async () => {
      const createRunner = vi.fn()
      const pool = createPool({ workerCount: 2, createRunner })

      const results = await pool.run([])
      await pool.close()

      expect(results.killed).toEqual([])
      expect(results.survived).toEqual([])
      expect(results.timedOut).toEqual([])
    })

    it('calls applyMutation with mutated source before each run', async () => {
      const runner = fakeRunner({ passed: false, killedBy: ['t.js'] })
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })
      const mutation = fakeMutation({ source: 'mutated code' })

      await pool.run([mutation])
      await pool.close()

      expect(runner.applyMutation).toHaveBeenCalledWith('mutated code')
    })

    it('handles timeout errors as timedOut results', async () => {
      const runner = fakeRunner()
      runner.run.mockRejectedValue(new Error('Mutation timed out after 5000ms'))
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })

      const results = await pool.run([fakeMutation()], { timeout: 5000 })
      await pool.close()

      expect(results.timedOut).toHaveLength(1)
      expect(results.killed).toEqual([])
    })

    it('treats non-timeout errors as killed', async () => {
      const runner = fakeRunner()
      runner.run.mockRejectedValue(new Error('Worker crashed'))
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })

      const results = await pool.run([fakeMutation()])
      await pool.close()

      expect(results.killed).toHaveLength(1)
    })

    it('reuses runners across multiple run calls', async () => {
      const runner = fakeRunner({ passed: false, killedBy: ['t.js'] })
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })

      await pool.run([fakeMutation()])
      await pool.run([fakeMutation({ name: 'second' })])
      await pool.close()

      expect(createRunner).toHaveBeenCalledTimes(1)
      expect(runner.run).toHaveBeenCalledTimes(2)
    })

    it('calls onResult callback for each mutation', async () => {
      const runner = fakeRunner({ passed: false, killedBy: ['t.js'] })
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })
      const onResult = vi.fn()

      await pool.run([fakeMutation(), fakeMutation({ name: 'mut-2' })], { onResult })
      await pool.close()

      expect(onResult).toHaveBeenCalledTimes(2)
      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({
        status: expect.stringMatching(/killed|SURVIVED|TIMEOUT/)
      }))
    })
  })

  describe('close', () => {
    it('closes all runners', async () => {
      const runner = fakeRunner()
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })

      await pool.run([fakeMutation()])
      await pool.close()

      expect(runner.close).toHaveBeenCalled()
    })

    it('is safe to call multiple times', async () => {
      const runner = fakeRunner()
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })

      await pool.run([fakeMutation()])
      await pool.close()
      await pool.close()

      expect(runner.close).toHaveBeenCalledTimes(1)
    })
  })

  describe('process cleanup', () => {
    beforeEach(() => {
      _resetCleanupState()
    })
    afterEach(() => {
      _resetCleanupState()
    })

    it('registers SIGTERM and SIGINT handlers when pool is created', () => {
      const termBefore = process.listenerCount('SIGTERM')
      const intBefore = process.listenerCount('SIGINT')
      const pool = createPool({ workerCount: 1, createRunner: vi.fn() })

      expect(process.listenerCount('SIGTERM')).toBe(termBefore + 1)
      expect(process.listenerCount('SIGINT')).toBe(intBefore + 1)
    })

    it('removes signal handlers when last pool is closed', async () => {
      const termBefore = process.listenerCount('SIGTERM')
      const pool = createPool({ workerCount: 1, createRunner: vi.fn() })

      await pool.close()

      expect(process.listenerCount('SIGTERM')).toBe(termBefore)
    })

    it('keeps signal handlers while any pool is active', async () => {
      const termBefore = process.listenerCount('SIGTERM')
      const pool1 = createPool({ workerCount: 1, createRunner: vi.fn() })
      const pool2 = createPool({ workerCount: 1, createRunner: vi.fn() })

      await pool1.close()
      expect(process.listenerCount('SIGTERM')).toBe(termBefore + 1)

      await pool2.close()
      expect(process.listenerCount('SIGTERM')).toBe(termBefore)
    })

    it('cleanupAllPools closes all active pools with runners', async () => {
      const runner1 = fakeRunner()
      const runner2 = fakeRunner()
      const pool1 = createPool({ workerCount: 1, createRunner: vi.fn().mockResolvedValue(runner1) })
      const pool2 = createPool({ workerCount: 1, createRunner: vi.fn().mockResolvedValue(runner2) })

      await pool1.run([fakeMutation()])
      await pool2.run([fakeMutation()])

      await _cleanupAllPools()

      expect(runner1.close).toHaveBeenCalled()
      expect(runner2.close).toHaveBeenCalled()
    })

    it('cleanupAllPools swallows runner.close() errors', async () => {
      const runner = fakeRunner()
      runner.close.mockRejectedValue(new Error('close failed'))
      const pool = createPool({ workerCount: 1, createRunner: vi.fn().mockResolvedValue(runner) })
      await pool.run([fakeMutation()])

      await expect(_cleanupAllPools()).resolves.not.toThrow()
    })

    it('cleanupAllPools is idempotent', async () => {
      const runner = fakeRunner()
      const pool = createPool({ workerCount: 1, createRunner: vi.fn().mockResolvedValue(runner) })
      await pool.run([fakeMutation()])

      await _cleanupAllPools()
      await _cleanupAllPools()

      expect(runner.close).toHaveBeenCalledTimes(1)
    })

    it('cleanupAllPools removes signal handlers', async () => {
      const termBefore = process.listenerCount('SIGTERM')
      createPool({ workerCount: 1, createRunner: vi.fn() })

      await _cleanupAllPools()

      expect(process.listenerCount('SIGTERM')).toBe(termBefore)
    })

    it('onExit handler synchronously closes runners', async () => {
      const runner = fakeRunner()
      const pool = createPool({ workerCount: 1, createRunner: vi.fn().mockResolvedValue(runner) })
      await pool.run([fakeMutation()])

      process.emit('exit', 0)

      expect(runner.close).toHaveBeenCalled()
    })

    it('onExit swallows runner.close() errors', async () => {
      const runner = fakeRunner()
      runner.close.mockImplementation(() => { throw new Error('close failed') })
      const pool = createPool({ workerCount: 1, createRunner: vi.fn().mockResolvedValue(runner) })
      await pool.run([fakeMutation()])

      expect(() => process.emit('exit', 0)).not.toThrow()
    })

    it('onSignal handler cleans up pools and re-raises signal', async () => {
      const runner = fakeRunner()
      const pool = createPool({ workerCount: 1, createRunner: vi.fn().mockResolvedValue(runner) })
      await pool.run([fakeMutation()])

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {})

      // Get the registered handler and call it directly (V8 doesn't
      // instrument async functions invoked via process.emit)
      const handler = process.listeners('SIGTERM').pop()
      await handler('SIGTERM')

      expect(runner.close).toHaveBeenCalled()
      expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM')
      killSpy.mockRestore()
    })
  })

  describe('switchFile', () => {
    it('calls switchFile on all runners', async () => {
      const runners = []
      const createRunner = vi.fn().mockImplementation(async () => {
        const r = fakeRunner({ passed: false, killedBy: ['t.js'] })
        r.switchFile = vi.fn()
        runners.push(r)
        return r
      })
      const pool = createPool({ workerCount: 2, createRunner })

      await pool.run([fakeMutation()])
      await pool.switchFile('/src/b.js')
      await pool.close()

      expect(runners).toHaveLength(2)
      for (const r of runners)
        expect(r.switchFile).toHaveBeenCalledWith('/src/b.js')
    })

    it('allows running mutations after switchFile', async () => {
      const runner = fakeRunner({ passed: false, killedBy: ['t.js'] })
      runner.switchFile = vi.fn()
      const createRunner = vi.fn().mockResolvedValue(runner)
      const pool = createPool({ workerCount: 1, createRunner })

      await pool.run([fakeMutation({ name: 'first' })])
      await pool.switchFile('/src/b.js')
      const results = await pool.run([fakeMutation({ name: 'second' })])
      await pool.close()

      expect(runner.switchFile).toHaveBeenCalledWith('/src/b.js')
      expect(results.killed).toHaveLength(1)
      expect(results.killed[0].name).toBe('second')
    })

    it('is a no-op before runners are created', async () => {
      const pool = createPool({ workerCount: 1, createRunner: vi.fn() })
      await pool.switchFile('/src/b.js')
      await pool.close()
    })
  })
})

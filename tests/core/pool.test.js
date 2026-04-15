/**
 * Tests for core/pool.js — worker pool manager.
 */

import { describe, it, expect, vi } from 'vitest'
import { createPool } from '../../core/pool.js'

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
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vitest/node', () => ({
  startVitest: vi.fn()
}))

import { createVitestRunner } from '../../src/runners/vitest.js'
import { startVitest } from 'vitest/node'
import { createMockVitest } from './vitest-helpers.js'

beforeEach(() => vi.clearAllMocks())

describe('createVitestRunner', () => {
  describe('cold mode', () => {
    it('returns passed when all tests pass', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      const result = await runner.run()

      expect(result).toEqual({ passed: true, killedBy: [], coveredBy: ['a.test.js'] })
    })

    it('returns failed with file paths that killed the mutant', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'fail' }, filepath: 'test/x.test.js' },
        { result: { state: 'pass' }, filepath: 'test/y.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      const result = await runner.run()

      expect(result).toEqual({ passed: false, killedBy: ['test/x.test.js'], coveredBy: ['test/x.test.js', 'test/y.test.js'] })
    })

    it('creates a fresh vitest per run and closes it after', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      await runner.run()

      expect(startVitest).toHaveBeenCalledWith(
        'test', [], expect.objectContaining({ watch: false }), {}, expect.objectContaining({ stdin: expect.anything() })
      )
      expect(mock.close).toHaveBeenCalled()
    })

    it('passes a no-op onFinished reporter that vitest can call safely', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      await runner.run()

      const opts = startVitest.mock.calls[0][2]
      const onFinished = opts.reporters[0].onFinished
      expect(onFinished).toBeTypeOf('function')
      expect(() => onFinished()).not.toThrow()
    })

    it('close is a safe no-op (runner contract)', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      await runner.close()

      expect(mock.close).not.toHaveBeenCalled()
    })

    it('closes vitest even when getFiles throws', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockImplementation(() => { throw new Error('boom') })
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      await expect(runner.run()).rejects.toThrow('boom')

      expect(mock.close).toHaveBeenCalled()
    })
  })

  describe('no in-memory mutant switching (forces file-I/O fallback)', () => {
    it('cold runner does not expose setMutant or clearMutant', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })

      expect(runner.setMutant).toBeUndefined()
      expect(runner.clearMutant).toBeUndefined()
    })
  })

  describe('result optional chaining', () => {
    it('treats files with undefined result as not passing', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockReturnValue([
        { filepath: 'a.test.js' },
        { result: { state: 'pass' }, filepath: 'b.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      const result = await runner.run()

      expect(result.passed).toBe(false)
      expect(result.killedBy).toEqual([])
    })
  })
})

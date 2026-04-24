import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn()
  }
})

vi.mock('../../../src/core/pool.js')
vi.mock('../../../src/core/temp-copy.js')

import { createPool } from '../../../src/core/pool.js'
import { createTempCopy } from '../../../src/core/temp-copy.js'
import { readFileSync, existsSync } from 'node:fs'
import { testMutators, sourceCode, fakeRunner, killedMutation, setupPool as _setupPool, mockFs as _mockFs, noop, fakeWorktree, createTestRunner } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function setupPool(results) { return _setupPool(createPool, results) }


beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  existsSync.mockReturnValue(false)
  createTempCopy.mockReturnValue(fakeWorktree())
})

describe('--parallel flag wiring through manual.js', () => {
  describe('single-file mode', () => {
    it('dispatches to runParallel when --parallel is passed', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      setupPool({ killed: [killedMutation], survived: [], timedOut: [] })
      const runner = fakeRunner([{ passed: true }])

      const manual = createTestRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const exitCode = await manual.run(['src/a.js', '--parallel'])

      expect(createPool).toHaveBeenCalled()
      expect(typeof exitCode).toBe('number')
    })

    it('passes workerCount from --parallel N', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      setupPool({ killed: [killedMutation], survived: [], timedOut: [] })
      const runner = fakeRunner([{ passed: true }])

      const manual = createTestRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['src/a.js', '--parallel', '4'])

      expect(createPool).toHaveBeenCalledWith(
        expect.objectContaining({ workerCount: 4 })
      )
    })

    it('does NOT use parallel without --parallel flag', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const manual = createTestRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['src/a.js'])

      expect(createPool).not.toHaveBeenCalled()
    })
  })

  describe('batch mode (--all)', () => {
    it('creates pool once and reuses across files when --parallel is passed', async () => {
      mockFs({
        [resolve('src/a.js')]: sourceCode,
        [resolve('src/b.js')]: sourceCode
      })
      setupPool({ killed: [killedMutation], survived: [], timedOut: [] })
      const runner = fakeRunner([{ passed: true }])

      const manual = createTestRunner({
        mutators: testMutators, sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['--all', '--parallel'])

      expect(createPool).toHaveBeenCalledTimes(1)
    })

    it('passes workerCount from --parallel N in batch mode', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      setupPool({ killed: [killedMutation], survived: [], timedOut: [] })
      const runner = fakeRunner([{ passed: true }])

      const manual = createTestRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['--all', '--parallel', '8'])

      expect(createPool).toHaveBeenCalledWith(
        expect.objectContaining({ workerCount: 8 })
      )
    })

    it('does NOT use parallel in batch mode without --parallel', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const manual = createTestRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['--all'])

      expect(createPool).not.toHaveBeenCalled()
    })
  })

  describe('incremental mode', () => {
    it('dispatches to runParallel when --incremental --parallel is passed', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      existsSync.mockReturnValue(false)
      setupPool({ killed: [killedMutation], survived: [], timedOut: [] })
      const runner = fakeRunner([{ passed: true }])

      const manual = createTestRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['--incremental', '--parallel'])

      expect(createPool).toHaveBeenCalled()
    })

    it('does NOT use parallel in incremental mode without --parallel', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      existsSync.mockReturnValue(false)
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const manual = createTestRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['--incremental'])

      expect(createPool).not.toHaveBeenCalled()
    })
  })
})

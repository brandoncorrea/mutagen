import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vitest/node', () => ({
  startVitest: vi.fn()
}))

import { createVitestRunner } from '../../src/runners/vitest.js'
import { startVitest } from 'vitest/node'

function createMockVitest() {
  return {
    waitForTestRunEnd: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    invalidateFile: vi.fn(),
    globTestSpecifications: vi.fn().mockResolvedValue([]),
    runTestSpecifications: vi.fn().mockResolvedValue(undefined),
    state: { getFiles: vi.fn().mockReturnValue([]) },
    projects: []
  }
}

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
        'test', [], expect.objectContaining({ watch: false })
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

      // Cold runner manages vitest lifecycle per-run, so close() is a no-op
      // but must exist — runSingle calls runner.close() unconditionally
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

  describe('warm mode', () => {
    it('starts vitest in watch mode', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      await createVitestRunner('src/a.js')

      expect(startVitest).toHaveBeenCalledWith(
        'test', [], expect.objectContaining({ watch: true })
      )
    })

    it('invalidates the source file before each run', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      expect(mock.invalidateFile).toHaveBeenCalledWith('src/a.js')
    })

    it('returns failed with killedBy paths', async () => {
      const mock = createMockVitest()
      // First getFiles call: testWarmRerun ([] → vacuously passes)
      // Second getFiles call: actual run
      mock.state.getFiles = vi.fn()
        .mockReturnValueOnce([]) // testWarmRerun
        .mockReturnValue([
          { result: { state: 'fail' }, filepath: 'test/b.test.js' }
        ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      const result = await runner.run()

      expect(result).toEqual({ passed: false, killedBy: ['test/b.test.js'], coveredBy: ['test/b.test.js'] })
    })

    it('falls back to cold when warm rerun produces failures', async () => {
      const warmMock = createMockVitest()
      warmMock.state.getFiles.mockReturnValue([
        { result: { state: 'fail' }, filepath: 'a.test.js' }
      ])

      const coldMock = createMockVitest()
      coldMock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'a.test.js' }
      ])

      startVitest
        .mockResolvedValueOnce(warmMock)
        .mockResolvedValue(coldMock)

      const runner = await createVitestRunner('src/a.js')

      expect(warmMock.close).toHaveBeenCalled()

      const result = await runner.run()
      expect(result.passed).toBe(true)
      expect(startVitest).toHaveBeenLastCalledWith(
        'test', [], expect.objectContaining({ watch: false })
      )
    })

    it('falls back to cold when warm rerun throws', async () => {
      const warmMock = createMockVitest()
      warmMock.globTestSpecifications.mockRejectedValue(new Error('crash'))

      const coldMock = createMockVitest()
      coldMock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'a.test.js' }
      ])

      startVitest
        .mockResolvedValueOnce(warmMock)
        .mockResolvedValue(coldMock)

      const runner = await createVitestRunner('src/a.js')
      expect(warmMock.close).toHaveBeenCalled()

      const result = await runner.run()
      expect(result.passed).toBe(true)
    })

    it('close shuts down vitest', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.close()

      expect(mock.close).toHaveBeenCalled()
    })
  })

  describe('options', () => {
    it('passes config and root through to vitest', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', {
        warm: false, config: 'vitest.config.ts', root: '/app'
      })
      await runner.run()

      expect(startVitest).toHaveBeenCalledWith(
        'test', [],
        expect.objectContaining({ config: 'vitest.config.ts', root: '/app' })
      )
    })

    it('restricts run to a specific test file', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', {
        warm: false,
        testFile: 'test/a.test.js'
      })
      await runner.run()

      expect(startVitest).toHaveBeenCalledWith(
        'test', ['test/a.test.js'], expect.any(Object)
      )
    })

    it('sets bail to 1 to stop on first failure', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      await runner.run()

      expect(startVitest).toHaveBeenCalledWith(
        'test', [], expect.objectContaining({ bail: 1 })
      )
    })
  })

  describe('related specs via module graph', () => {
    it('narrows tests to those that transitively import the source', async () => {
      const specs = [
        { moduleId: 'test/related.test.js' },
        { moduleId: 'test/unrelated.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn((id) => {
              if (id === 'src/a.js')
                return { importers: new Set([{ id: 'test/related.test.js' }]) }
              return null
            })
          }
        }
      }]
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith([
        { moduleId: 'test/related.test.js' }
      ])
    })

    it('walks transitive importers to find test files', async () => {
      const specs = [
        { moduleId: 'test/indirect.test.js' },
        { moduleId: 'test/other.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn((id) => {
              if (id === 'src/a.js')
                return { importers: new Set([{ id: 'src/b.js' }]) }
              if (id === 'src/b.js')
                return { importers: new Set([{ id: 'test/indirect.test.js' }]) }
              return null
            })
          }
        }
      }]
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith([
        { moduleId: 'test/indirect.test.js' }
      ])
    })

    it('skips findRelatedSpecs when no sourceFile provided', async () => {
      const specs = [
        { moduleId: 'test/a.test.js' },
        { moduleId: 'test/b.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn()
          }
        }
      }]
      startVitest.mockResolvedValue(mock)

      // null sourceFile — findRelatedSpecs should return early
      const runner = await createVitestRunner(null)
      await runner.run()

      // Should run all specs, not narrow via graph
      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith(specs)
      // Module graph should never be consulted
      expect(mock.projects[0]._vite.moduleGraph.getModuleById).not.toHaveBeenCalled()
    })

    it('skips importers with null id', async () => {
      const specs = [
        { moduleId: 'test/a.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn((id) => {
              if (id === 'src/a.js')
                return {
                  importers: new Set([
                    { id: null },                    // null id — should be skipped
                    { id: 'test/a.test.js' }         // valid importer
                  ])
                }
              return null
            })
          }
        }
      }]
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      // Should still find the valid importer despite the null one
      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith([
        { moduleId: 'test/a.test.js' }
      ])
    })

    it('runs all specs when no module graph is available', async () => {
      const specs = [
        { moduleId: 'test/a.test.js' },
        { moduleId: 'test/b.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith(specs)
    })

    it('terminates on circular imports without infinite loop', async () => {
      const specs = [
        { moduleId: 'test/circular.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn((id) => {
              if (id === 'src/a.js')
                return { importers: new Set([{ id: 'src/b.js' }]) }
              if (id === 'src/b.js')
                return { importers: new Set([{ id: 'src/a.js' }, { id: 'test/circular.test.js' }]) }
              return null
            })
          }
        }
      }]
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith([
        { moduleId: 'test/circular.test.js' }
      ])
    })

    it('runs all specs when no test files found in graph', async () => {
      const specs = [
        { moduleId: 'test/a.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn(() => null), // source not in graph
          }
        }
      }]
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith(specs)
    })

    it('handles project with undefined _vite gracefully', async () => {
      const specs = [
        { moduleId: 'test/a.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{}]
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith(specs)
    })
  })

  describe('no in-memory mutant switching (forces file-I/O fallback)', () => {
    it('warm runner does not expose setMutant or clearMutant', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')

      expect(runner.setMutant).toBeUndefined()
      expect(runner.clearMutant).toBeUndefined()
    })

    it('cold runner does not expose setMutant or clearMutant', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })

      expect(runner.setMutant).toBeUndefined()
      expect(runner.clearMutant).toBeUndefined()
    })

    it('does not inject mutagen plugin into vitest options', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      await createVitestRunner('src/a.js')

      const opts = startVitest.mock.calls[0][2]
      const plugin = opts.plugins?.find(p => p.name === 'mutagen-mutant')
      expect(plugin).toBeUndefined()
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

  describe('async correctness (await mutation guards)', () => {
    function deferred() {
      let resolve
      const promise = new Promise(r => { resolve = r })
      return { promise, resolve }
    }

    async function flushMicrotasks() {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }

    it('warm startup awaits waitForTestRunEnd before checking warm rerun', async () => {
      const mock = createMockVitest()
      const d = deferred()
      mock.waitForTestRunEnd.mockReturnValue(d.promise)

      let warmRerunStarted = false
      mock.globTestSpecifications.mockImplementation(async () => {
        warmRerunStarted = true
        return []
      })
      startVitest.mockResolvedValue(mock)

      const promise = createVitestRunner('src/a.js')
      await flushMicrotasks()
      expect(warmRerunStarted).toBe(false)

      d.resolve()
      await promise
      expect(warmRerunStarted).toBe(true)
    })

    it('warm-to-cold fallback awaits close before returning cold runner', async () => {
      const warmMock = createMockVitest()
      warmMock.globTestSpecifications.mockRejectedValue(new Error('crash'))

      const d = deferred()
      warmMock.close.mockReturnValue(d.promise)

      const coldMock = createMockVitest()
      startVitest
        .mockResolvedValueOnce(warmMock)
        .mockResolvedValue(coldMock)

      let runnerCreated = false
      const promise = createVitestRunner('src/a.js').then(r => {
        runnerCreated = true
        return r
      })

      await flushMicrotasks()
      expect(runnerCreated).toBe(false)

      d.resolve()
      await promise
      expect(runnerCreated).toBe(true)
    })

    it('warm run awaits runTestSpecifications before compiling results', async () => {
      const mock = createMockVitest()
      const d = deferred()
      const specs = [{ moduleId: 'test/a.test.js' }]
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.runTestSpecifications
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(d.promise)
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')

      let runDone = false
      const runPromise = runner.run().then(r => { runDone = true; return r })

      await flushMicrotasks()
      expect(runDone).toBe(false)

      d.resolve()
      await runPromise
      expect(runDone).toBe(true)
    })

    it('warm close awaits vitest.close before resolving', async () => {
      const mock = createMockVitest()
      const d = deferred()
      mock.close.mockReturnValue(d.promise)
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')

      let closeDone = false
      const closePromise = runner.close().then(() => { closeDone = true })

      await flushMicrotasks()
      expect(closeDone).toBe(false)

      d.resolve()
      await closePromise
      expect(closeDone).toBe(true)
    })

    it('warmRerunFailed awaits runTestSpecifications before reading state', async () => {
      const mock = createMockVitest()
      const d = deferred()
      mock.runTestSpecifications.mockReturnValue(d.promise)
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      let factoryDone = false
      const promise = createVitestRunner('src/a.js').then(r => {
        factoryDone = true
        return r
      })

      await flushMicrotasks()
      expect(factoryDone).toBe(false)

      d.resolve()
      await promise
      expect(factoryDone).toBe(true)
    })

    it('cold run awaits vitest.close in finally block', async () => {
      const mock = createMockVitest()
      const d = deferred()
      mock.close.mockReturnValue(d.promise)
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })

      let runDone = false
      const runPromise = runner.run().then(r => { runDone = true; return r })

      await flushMicrotasks()
      expect(runDone).toBe(false)

      d.resolve()
      const result = await runPromise
      expect(runDone).toBe(true)
      expect(result.passed).toBe(true)
    })

    // Never-resolving promise guards: detect await removal mutations that
    // flushMicrotasks misses due to dynamic import indirection.

    it('createVitestRunner blocks until waitForTestRunEnd resolves', async () => {
      const mock = createMockVitest()
      mock.waitForTestRunEnd.mockReturnValue(new Promise(() => {}))
      startVitest.mockResolvedValue(mock)

      const result = await Promise.race([
        createVitestRunner('src/a.js'),
        new Promise(resolve => setTimeout(() => resolve('BLOCKED'), 50))
      ])

      expect(result).toBe('BLOCKED')
    })

    it('warm-to-cold fallback blocks until close resolves', async () => {
      const warmMock = createMockVitest()
      warmMock.state.getFiles.mockReturnValue([
        { result: { state: 'fail' }, filepath: 'a.test.js' }
      ])
      warmMock.close.mockReturnValue(new Promise(() => {}))

      const coldMock = createMockVitest()
      startVitest
        .mockResolvedValueOnce(warmMock)
        .mockResolvedValue(coldMock)

      const result = await Promise.race([
        createVitestRunner('src/a.js'),
        new Promise(resolve => setTimeout(() => resolve('BLOCKED'), 50))
      ])

      expect(result).toBe('BLOCKED')
    })

    it('warmRerunFailed blocks until runTestSpecifications resolves', async () => {
      const mock = createMockVitest()
      mock.runTestSpecifications.mockReturnValue(new Promise(() => {}))
      startVitest.mockResolvedValue(mock)

      const result = await Promise.race([
        createVitestRunner('src/a.js'),
        new Promise(resolve => setTimeout(() => resolve('BLOCKED'), 50))
      ])

      expect(result).toBe('BLOCKED')
    })
  })
})

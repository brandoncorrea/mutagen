import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vitest/node', () => ({
  startVitest: vi.fn()
}))

import { createVitestRunner } from '../../src/runners/vitest.js'
import { startVitest } from 'vitest/node'
import { createMockVitest, createMockModuleGraph } from './vitest-helpers.js'

beforeEach(() => vi.clearAllMocks())

describe('createVitestRunner', () => {
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

      const runner = await createVitestRunner(null)
      await runner.run()

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith(specs)
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
                    { id: null },
                    { id: 'test/a.test.js' }
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

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith([
        { moduleId: 'test/a.test.js' }
      ])
    })

    it('handles extensionless source files in tier splitting', async () => {
      const specs = [
        { moduleId: 'test/utils.test.js' },
        { moduleId: 'test/other.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/utils')
      await runner.run()

      const runCalls = mock.runTestSpecifications.mock.calls
      expect(runCalls[runCalls.length - 2][0]).toEqual([{ moduleId: 'test/utils.test.js' }])
      expect(runCalls[runCalls.length - 1][0]).toEqual([{ moduleId: 'test/other.test.js' }])
    })

    it('runs all specs in tiers when no module graph is available', async () => {
      const specs = [
        { moduleId: 'test/a.test.js' },
        { moduleId: 'test/b.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.run()

      const runCalls = mock.runTestSpecifications.mock.calls
      expect(runCalls[runCalls.length - 2][0]).toEqual([{ moduleId: 'test/a.test.js' }])
      expect(runCalls[runCalls.length - 1][0]).toEqual([{ moduleId: 'test/b.test.js' }])
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
            getModuleById: vi.fn(() => null),
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

  describe('tiered test execution', () => {
    it('skips indirect tests when direct test kills the mutation', async () => {
      const specs = [
        { moduleId: 'test/engine.test.js' },
        { moduleId: 'test/integration.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn((id) => {
              if (id === 'src/engine.js')
                return { importers: new Set([
                  { id: 'test/engine.test.js' },
                  { id: 'test/integration.test.js' }
                ]) }
              return null
            })
          }
        }
      }]

      mock.state.getFiles = vi.fn()
        .mockReturnValue([
          { result: { state: 'fail' }, filepath: 'test/engine.test.js' }
        ])

      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/engine.js')
      const result = await runner.run()

      expect(result).toEqual({
        passed: false,
        killedBy: ['test/engine.test.js'],
        coveredBy: ['test/engine.test.js']
      })

      const runCalls = mock.runTestSpecifications.mock.calls
      expect(runCalls[runCalls.length - 1][0]).toEqual([
        { moduleId: 'test/engine.test.js' }
      ])
    })

    it('runs indirect tests when direct test passes', async () => {
      const specs = [
        { moduleId: 'test/engine.test.js' },
        { moduleId: 'test/integration.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn((id) => {
              if (id === 'src/engine.js')
                return { importers: new Set([
                  { id: 'test/engine.test.js' },
                  { id: 'test/integration.test.js' }
                ]) }
              return null
            })
          }
        }
      }]

      mock.state.getFiles = vi.fn()
        .mockReturnValueOnce([
          { result: { state: 'pass' }, filepath: 'test/engine.test.js' },
          { result: { state: 'pass' }, filepath: 'test/integration.test.js' }
        ])
        .mockReturnValueOnce([
          { result: { state: 'pass' }, filepath: 'test/engine.test.js' }
        ])
        .mockReturnValue([
          { result: { state: 'fail' }, filepath: 'test/integration.test.js' }
        ])

      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/engine.js')
      const result = await runner.run()

      expect(result).toEqual({
        passed: false,
        killedBy: ['test/integration.test.js'],
        coveredBy: ['test/engine.test.js', 'test/integration.test.js']
      })

      const runCalls = mock.runTestSpecifications.mock.calls
      expect(runCalls[runCalls.length - 2][0]).toEqual([{ moduleId: 'test/engine.test.js' }])
      expect(runCalls[runCalls.length - 1][0]).toEqual([{ moduleId: 'test/integration.test.js' }])
    })

    it('returns survived when both tiers pass', async () => {
      const specs = [
        { moduleId: 'test/engine.test.js' },
        { moduleId: 'test/integration.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn((id) => {
              if (id === 'src/engine.js')
                return { importers: new Set([
                  { id: 'test/engine.test.js' },
                  { id: 'test/integration.test.js' }
                ]) }
              return null
            })
          }
        }
      }]

      mock.state.getFiles = vi.fn()
        .mockReturnValueOnce([
          { result: { state: 'pass' }, filepath: 'test/engine.test.js' },
          { result: { state: 'pass' }, filepath: 'test/integration.test.js' }
        ])
        .mockReturnValueOnce([
          { result: { state: 'pass' }, filepath: 'test/engine.test.js' }
        ])
        .mockReturnValue([
          { result: { state: 'pass' }, filepath: 'test/integration.test.js' }
        ])

      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/engine.js')
      const result = await runner.run()

      expect(result).toEqual({
        passed: true,
        killedBy: [],
        coveredBy: ['test/engine.test.js', 'test/integration.test.js']
      })
    })

    it('runs all specs as one tier when no direct test matches', async () => {
      const specs = [
        { moduleId: 'test/integration.test.js' },
        { moduleId: 'test/e2e.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      mock.projects = [{
        _vite: {
          moduleGraph: {
            getModuleById: vi.fn((id) => {
              if (id === 'src/engine.js')
                return { importers: new Set([
                  { id: 'test/integration.test.js' },
                  { id: 'test/e2e.test.js' }
                ]) }
              return null
            })
          }
        }
      }]

      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/engine.js')
      await runner.run()

      const runCalls = mock.runTestSpecifications.mock.calls
      expect(runCalls[runCalls.length - 1][0]).toEqual(specs)
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

    it('warm startup awaits waitForTestRunEnd before building runner', async () => {
      const mock = createMockVitest()
      const d = deferred()
      mock.waitForTestRunEnd.mockReturnValue(d.promise)
      startVitest.mockResolvedValue(mock)

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
      mock.runTestSpecifications.mockReturnValue(d.promise)
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')

      let runDone = false
      const runPromise = runner.run().then(r => {
        runDone = true
        return r
      })

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
      const runPromise = runner.run().then(r => {
        runDone = true
        return r
      })

      await flushMicrotasks()
      expect(runDone).toBe(false)

      d.resolve()
      const result = await runPromise
      expect(runDone).toBe(true)
      expect(result.passed).toBe(true)
    })

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

  })
})

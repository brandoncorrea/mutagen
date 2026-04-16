import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vitest/node', () => ({
  startVitest: vi.fn()
}))

import { createVitestRunner } from '../../src/runners/vitest.js'
import { startVitest } from 'vitest/node'

function createMockModuleGraph() {
  return { invalidateAll: vi.fn(), getModuleById: vi.fn().mockReturnValue(null) }
}

function createMockVitest() {
  return {
    waitForTestRunEnd: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    invalidateFile: vi.fn(),
    globTestSpecifications: vi.fn().mockResolvedValue([]),
    runTestSpecifications: vi.fn().mockResolvedValue(undefined),
    state: { getFiles: vi.fn().mockReturnValue([]) },
    projects: [{
      _vite: {
        moduleGraph: createMockModuleGraph(),
        environments: { ssr: { moduleGraph: createMockModuleGraph() } }
      }
    }],
    _fsCache: { clearCache: vi.fn() }
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
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'fail' }, filepath: 'test/b.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      const result = await runner.run()

      expect(result).toEqual({ passed: false, killedBy: ['test/b.test.js'], coveredBy: ['test/b.test.js'] })
    })

    it('exposes preflight.passed = true when initial run passes', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'test/a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')

      expect(runner.preflight).toEqual({ passed: true })
    })

    it('exposes preflight.passed = false when initial run has failures', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'fail' }, filepath: 'test/a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')

      expect(runner.preflight).toEqual({ passed: false })
    })

    it('does not perform a second test run during creation', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      await createVitestRunner('src/a.js')

      // startVitest runs tests once during creation (watch mode).
      // No additional runTestSpecifications should be called during creation.
      expect(mock.runTestSpecifications).not.toHaveBeenCalled()
    })

    it('close shuts down vitest', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.close()

      expect(mock.close).toHaveBeenCalled()
    })
  })

  describe('switchFile', () => {
    it('updates the source file for invalidation on subsequent runs', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'test/a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.switchFile('src/b.js')
      await runner.run()

      expect(mock.invalidateFile).toHaveBeenCalledWith('src/b.js')
    })

    it('recomputes related specs for the new source file', async () => {
      const specs = [
        { moduleId: 'test/a.test.js' },
        { moduleId: 'test/b.test.js' }
      ]
      const mock = createMockVitest()
      mock.globTestSpecifications.mockResolvedValue(specs)
      const graphMock = {
        ...createMockModuleGraph(),
        getModuleById: vi.fn((id) => {
          if (id === 'src/a.js')
            return { importers: new Set([{ id: 'test/a.test.js' }]) }
          if (id === 'src/b.js')
            return { importers: new Set([{ id: 'test/b.test.js' }]) }
          return null
        })
      }
      mock.projects = [{
        _vite: {
          moduleGraph: graphMock,
          environments: { ssr: { moduleGraph: createMockModuleGraph() } }
        }
      }]
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'test/b.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.switchFile('src/b.js')
      await runner.run()

      expect(mock.runTestSpecifications).toHaveBeenLastCalledWith([
        { moduleId: 'test/b.test.js' }
      ])
    })

    it('is not available on cold runners', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      expect(runner.switchFile).toBeUndefined()
    })

    it('flushes module graph and fs cache on file switch to prevent OOM', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'test/a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.switchFile('src/b.js')

      const vite = mock.projects[0]._vite
      expect(vite.moduleGraph.invalidateAll).toHaveBeenCalled()
      expect(vite.environments.ssr.moduleGraph.invalidateAll).toHaveBeenCalled()
      expect(mock._fsCache.clearCache).toHaveBeenCalled()
    })

    it('skips projects with undefined _vite during flush', async () => {
      const mock = createMockVitest()
      mock.projects = [
        {},  // _vite undefined — flushModuleState should skip this
        {
          _vite: {
            moduleGraph: createMockModuleGraph(),
            environments: { ssr: { moduleGraph: createMockModuleGraph() } }
          }
        }
      ]
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'test/a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js')
      await runner.switchFile('src/b.js')

      // The project with _vite should still be flushed
      const vite = mock.projects[1]._vite
      expect(vite.moduleGraph.invalidateAll).toHaveBeenCalled()
      expect(vite.environments.ssr.moduleGraph.invalidateAll).toHaveBeenCalled()
    })

    it('flushes before recomputing related specs', async () => {
      const mock = createMockVitest()
      mock.state.getFiles.mockReturnValue([
        { result: { state: 'pass' }, filepath: 'test/a.test.js' }
      ])
      startVitest.mockResolvedValue(mock)

      const callOrder = []
      mock.projects[0]._vite.moduleGraph.invalidateAll.mockImplementation(() => callOrder.push('flush'))
      mock.globTestSpecifications.mockImplementation(() => { callOrder.push('glob'); return [] })

      const runner = await createVitestRunner('src/a.js')
      callOrder.length = 0
      await runner.switchFile('src/b.js')

      expect(callOrder[0]).toBe('flush')
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

      // Tiering splits by source basename: test/a.test.js is direct, test/b.test.js is indirect
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

      // Only direct spec should have been run
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
        .mockReturnValueOnce([    // initial run (preflight)
          { result: { state: 'pass' }, filepath: 'test/engine.test.js' },
          { result: { state: 'pass' }, filepath: 'test/integration.test.js' }
        ])
        .mockReturnValueOnce([    // tier 1: direct passes
          { result: { state: 'pass' }, filepath: 'test/engine.test.js' }
        ])
        .mockReturnValue([        // tier 2: indirect fails
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

      // Both tiers were run
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
        .mockReturnValueOnce([    // initial run (preflight)
          { result: { state: 'pass' }, filepath: 'test/engine.test.js' },
          { result: { state: 'pass' }, filepath: 'test/integration.test.js' }
        ])
        .mockReturnValueOnce([    // tier 1: direct passes
          { result: { state: 'pass' }, filepath: 'test/engine.test.js' }
        ])
        .mockReturnValue([        // tier 2: indirect also passes
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

      // No direct match for "engine" → all specs run together
      const runCalls = mock.runTestSpecifications.mock.calls
      expect(runCalls[runCalls.length - 1][0]).toEqual(specs)
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

  })
})

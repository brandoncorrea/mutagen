import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vitest/node', () => ({
  startVitest: vi.fn()
}))

import { createVitestRunner } from '../../runners/vitest.js'
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

      expect(result).toEqual({ passed: true, killedBy: [] })
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

      expect(result).toEqual({ passed: false, killedBy: ['test/x.test.js'] })
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

      expect(result).toEqual({ passed: false, killedBy: ['test/b.test.js'] })
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
  })
})

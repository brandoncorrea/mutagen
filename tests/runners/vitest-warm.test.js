import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vitest/node', () => ({
  startVitest: vi.fn()
}))

import { createVitestRunner } from '../../src/runners/vitest.js'
import { startVitest } from 'vitest/node'
import { createMockVitest, createMockModuleGraph } from './vitest-helpers.js'

beforeEach(() => vi.clearAllMocks())

describe('createVitestRunner', () => {
  describe('warm mode', () => {
    it('starts vitest in watch mode', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      await createVitestRunner('src/a.js')

      expect(startVitest).toHaveBeenCalledWith(
        'test', [], expect.objectContaining({ watch: true }), {}, expect.objectContaining({ stdin: expect.anything() })
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
      expect(mock._fsCache.clearCache).toHaveBeenCalledWith(false)
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
      mock.globTestSpecifications.mockImplementation(() => {
        callOrder.push('glob')
        return []
      })

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
        expect.objectContaining({ config: 'vitest.config.ts', root: '/app' }),
        {}, expect.objectContaining({ stdin: expect.anything() })
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
        'test', ['test/a.test.js'], expect.any(Object), {}, expect.objectContaining({ stdin: expect.anything() })
      )
    })

    it('sets bail to 1 to stop on first failure', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      const runner = await createVitestRunner('src/a.js', { warm: false })
      await runner.run()

      expect(startVitest).toHaveBeenCalledWith(
        'test', [], expect.objectContaining({ bail: 1 }), {}, expect.objectContaining({ stdin: expect.anything() })
      )
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

    it('does not inject mutagen plugin into vitest options', async () => {
      const mock = createMockVitest()
      startVitest.mockResolvedValue(mock)

      await createVitestRunner('src/a.js')

      const opts = startVitest.mock.calls[0][2]
      const plugin = opts.plugins?.find(p => p.name === 'mutagen-mutant')
      expect(plugin).toBeUndefined()
    })
  })

  describe('signal handler cleanup', () => {
    it('removes SIGINT and SIGTERM listeners added by startVitest', async () => {
      const mock = createMockVitest()
      const preExisting = () => {}
      process.on('SIGINT', preExisting)
      process.on('SIGTERM', preExisting)

      startVitest.mockImplementation(async () => {
        process.on('SIGINT', () => {})
        process.on('SIGTERM', () => {})
        return mock
      })

      const before = {
        sigint: process.listenerCount('SIGINT'),
        sigterm: process.listenerCount('SIGTERM')
      }

      await createVitestRunner('src/a.js')

      expect(process.listenerCount('SIGINT')).toBe(before.sigint)
      expect(process.listenerCount('SIGTERM')).toBe(before.sigterm)

      process.removeListener('SIGINT', preExisting)
      process.removeListener('SIGTERM', preExisting)
    })
  })
})

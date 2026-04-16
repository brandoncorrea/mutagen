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

vi.mock('../../../src/core/temp-copy.js')

import { createManualRunner as _createManualRunner } from '../../../src/cli/manual.js'
import { createTempCopy } from '../../../src/core/temp-copy.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { testMutators, sourceCode, fakeRunner, mockFs as _mockFs, noop } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-batch'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    mapPaths: vi.fn(paths => paths),
    cleanup: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  existsSync.mockReturnValue(false)
  createTempCopy.mockReturnValue(fakeWorktree())
})

describe('createManualRunner', () => {
  describe('runBatch', () => {
    it('counts killed mutations', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },                          // preflight
        { passed: false, killedBy: ['t.test.js'] } // killed
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, null)

      expect(result.totalKilled).toBe(1)
      expect(result.totalSurvived).toBe(0)
      expect(result.totalTimedOut).toBe(0)
      expect(result.failures).toBe(0)
    })

    it('counts surviving mutations', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true }, // preflight
        { passed: true }  // survived
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, null)

      expect(result.totalSurvived).toBe(1)
      expect(result.totalKilled).toBe(0)
    })

    it('counts preflight failure as error', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: false }])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, null)

      expect(result.failures).toBe(1)
      expect(result.totalKilled).toBe(0)
      expect(result.totalSurvived).toBe(0)
    })

    it('writes JSON report when requested', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runBatch(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p.includes('manual-report.json')
      )
      expect(reportCalls).toHaveLength(1)

      const report = JSON.parse(reportCalls[0][1])
      expect(report.schemaVersion).toBe('1')
      expect(Object.keys(report.files)).toHaveLength(1)
    })

    it('writes mutations to temp copy, never to original source', async () => {
      const src = resolve('src/a.js')
      mockFs({ [src]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runBatch(false, null)

      // Mutation writes should go to temp path, not original
      const srcWrites = writeFileSync.mock.calls.filter(([p]) => p === src)
      expect(srcWrites).toHaveLength(0)
    })

    it('closes the runner after execution', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runBatch(false, null)

      expect(runner.close).toHaveBeenCalled()
    })

    it('counts runner errors as killed', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: true }])
      runner.run.mockResolvedValueOnce({ passed: true }) // preflight
        .mockRejectedValue(new Error('runner crashed'))

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, null)

      expect(result.totalKilled).toBe(1)
      expect(result.totalSurvived).toBe(0)
    })

    it('counts timeouts as killed', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: true }])
      runner.run.mockResolvedValueOnce({ passed: true }) // preflight
        .mockRejectedValue(new Error('Mutation timed out after 100ms'))

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, 100)

      expect(result.totalKilled).toBe(1)
      expect(result.totalTimedOut).toBe(1)
    })

    it('writes structured report to custom path when jsonOutput is a path', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runBatch('reports/custom.json', null)

      const reportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/custom.json')
      )
      expect(reportCalls).toHaveLength(1)

      const report = JSON.parse(reportCalls[0][1])
      expect(report).toHaveProperty('score')
      expect(report).toHaveProperty('total')
      expect(report).toHaveProperty('killed')
      expect(report).toHaveProperty('survived')
      expect(report).toHaveProperty('timedOut')
      expect(report).toHaveProperty('files')
      expect(report).toHaveProperty('survivors')
    })

    it('structured report has correct counts', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },  // preflight
        { passed: true }   // survived
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runBatch('reports/out.json', null)

      const reportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/out.json')
      )
      const report = JSON.parse(reportCalls[0][1])
      expect(report.total).toBe(1)
      expect(report.survived).toBe(1)
      expect(report.killed).toBe(0)
      expect(report.survivors).toHaveLength(1)
    })

    it('prints score summary to stderr when jsonOutput is a path', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runBatch('reports/out.json', null)

      const stderrOutput = process.stderr.write.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).toContain('Score:')
      expect(stderrOutput).toContain('reports/out.json')
    })

    it('does not write to default report path when jsonOutput is a custom path', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runBatch('reports/custom.json', null)

      const defaultReportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p.includes('manual-report.json')
      )
      expect(defaultReportCalls).toHaveLength(0)
    })

    it('prints correct file count in batch summary', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      await manual.runBatch(false, null)

      expect(lines.join('\n')).toContain('Files: 1  |')
    })
  })
})

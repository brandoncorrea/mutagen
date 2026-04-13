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

import { createManualRunner as _createManualRunner } from '../../../cli/manual.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { patterns, sourceCode, fakeRunner, mockFs as _mockFs, noop } from './helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  existsSync.mockReturnValue(false)
})

describe('createManualRunner', () => {
  describe('runSingle (via runBatch)', () => {
    it('numbers mutation progress starting at 1', async () => {
      const multiSource = 'if (a === b && c === d) {}'
      mockFs({ [resolve('src/a.js')]: multiSource })
      const runner = fakeRunner([
        { passed: true },  // preflight
        { passed: false },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      await manual.runBatch(false, null)

      const progressLines = lines.filter(l => /\[\d+\/\d+\]/.test(l))
      expect(progressLines[0]).toMatch(/\[1\//)
      expect(progressLines[1]).toMatch(/\[2\//)
    })

    it('reports total matching actual mutation count', async () => {
      const multiSource = 'if (a === b && c === d) {}'
      mockFs({ [resolve('src/a.js')]: multiSource })
      const runner = fakeRunner([
        { passed: true },  // preflight
        { passed: false },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      await manual.runBatch(false, null)

      const progressLines = lines.filter(l => /\[\d+\/\d+\]/.test(l))
      for (const line of progressLines)
        expect(line).toMatch(/\/2\]/)
    })

    it('propagates killedBy into JSON report', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['spec-a.js'] }
      ])

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p.includes('manual-report.json')
      )
      const report = JSON.parse(reportCalls[0][1])
      const killedMutant = Object.values(report.files)[0].mutants.find(m => m.status === 'Killed')
      expect(killedMutant.killedBy).toEqual(['spec-a.js'])
    })

    it('handles runner errors without message property', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: true }])
      runner.run.mockResolvedValueOnce({ passed: true }) // preflight
        .mockRejectedValue({ code: 'ERR_UNKNOWN' })

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, null)

      expect(result.totalKilled).toBe(1)
      expect(result.totalTimedOut).toBe(0)
    })

    it('propagates runner.close() rejection', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = {
        run: vi.fn().mockResolvedValue({ passed: true }),
        close: vi.fn().mockRejectedValue(new Error('close failed'))
      }

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })

      await expect(manual.runBatch(false, null)).rejects.toThrow('close failed')
    })

    it('returns correct counts for mixed killed/survived/timedOut', async () => {
      const multiSource = 'if (a === b && c === d) {}'
      mockFs({ [resolve('src/a.js')]: multiSource })
      const runner = {
        run: vi.fn()
          .mockResolvedValueOnce({ passed: true })  // preflight
          .mockResolvedValueOnce({ passed: false, killedBy: ['t.js'] })  // killed
          .mockRejectedValueOnce(new Error('Mutation timed out after 10ms')),  // timedOut
        close: vi.fn().mockResolvedValue(undefined)
      }

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, null)

      expect(result.totalKilled).toBe(2) // 1 killed + 1 timedOut
      expect(result.totalTimedOut).toBe(1)
      expect(result.totalSurvived).toBe(0)
    })

    it('applies real timeout to slow runner', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = {
        run: vi.fn()
          .mockResolvedValueOnce({ passed: true }) // preflight
          .mockImplementationOnce(() => new Promise(resolve =>
            setTimeout(() => resolve({ passed: true }), 500))),
        close: vi.fn().mockResolvedValue(undefined)
      }

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, 15)

      expect(result.totalTimedOut).toBe(1)
      expect(result.totalSurvived).toBe(0)
    }, 5000)

    it('does not time out when runner resolves before timeout', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = {
        // Resolve after one microtask tick — not already-settled.
        // Guards setTimeout: an immediate reject() would win this race.
        run: vi.fn()
          .mockImplementationOnce(async () => ({ passed: true }))  // preflight
          .mockImplementationOnce(async () => { await Promise.resolve(); return { passed: true } }),
        close: vi.fn().mockResolvedValue(undefined)
      }

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runBatch(false, 60000)

      expect(result.totalSurvived).toBe(1)
      expect(result.totalTimedOut).toBe(0)
    })
  })
})

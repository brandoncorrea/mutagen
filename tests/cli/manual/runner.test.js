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
import { dryRun, runSingle } from '../../../cli/runner.js'
import { preparePatterns } from '../../../core/engine.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { patterns, sourceCode, fakeRunner, mockFs as _mockFs, noop } from './helpers.js'

const prepared = preparePatterns(patterns)

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

describe('in-memory mutant switching', () => {
  it('uses setMutant instead of writeFileSync when runner supports it', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: false, killedBy: ['t.js'] }),
      close: vi.fn().mockResolvedValue(undefined),
      setMutant: vi.fn(),
      clearMutant: vi.fn()
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(runner.setMutant).toHaveBeenCalledOnce()
    expect(runner.setMutant.mock.calls[0][0]).toContain('!==') // mutated source
  })

  it('calls clearMutant after each mutation', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined),
      setMutant: vi.fn(),
      clearMutant: vi.fn()
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(runner.clearMutant).toHaveBeenCalledOnce()
  })

  it('does not write to disk when runner supports in-memory switching', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined),
      setMutant: vi.fn(),
      clearMutant: vi.fn()
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('falls back to writeFileSync when runner lacks setMutant', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(writeFileSync).toHaveBeenCalled()
  })

  it('calls clearMutant in finally block even when run throws', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockRejectedValueOnce(new Error('boom')),
      close: vi.fn().mockResolvedValue(undefined),
      setMutant: vi.fn(),
      clearMutant: vi.fn()
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(runner.clearMutant).toHaveBeenCalledOnce()
  })
})

describe('dryRun', () => {
  it('outputs mutation names for each line', () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const lines = []
    dryRun(resolve('src/a.js'), prepared, null, msg => lines.push(msg))

    const mutationLines = lines.filter(l => /^\s+L\d+:/.test(l))
    expect(mutationLines.length).toBeGreaterThan(0)
    for (const line of mutationLines)
      expect(line).toContain('=== → !==')
  })
})

describe('runSingle', () => {
  it('closes runner only after all mutations complete', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const events = []
    const runner = {
      run: vi.fn()
        .mockImplementationOnce(async () => {
          events.push('preflight')
          return { passed: true }
        })
        .mockImplementationOnce(() => new Promise(resolve => {
          setTimeout(() => {
            events.push('mutation-complete')
            resolve({ passed: false })
          }, 10)
        })),
      close: vi.fn().mockImplementation(async () => {
        events.push('close')
      })
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(events.indexOf('mutation-complete')).toBeLessThan(events.indexOf('close'))
  })

  it('classifies non-timeout errors as killed, not timed out', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockRejectedValueOnce(new Error('SIGTERM')),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const result = await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(result.killed).toBe(1)
    expect(result.timedOut).toBe(0)
  })
})

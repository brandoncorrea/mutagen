import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
  }
})

import { createManualRunner } from '../../cli/manual.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const patterns = [
  { pattern: / === /g, replacement: ' !== ', name: '=== → !==' },
]

// Exactly one mutation site
const sourceCode = 'if (a === b) {}'

function hashOf(content) {
  return createHash('sha256').update(Buffer.from(content)).digest('hex').slice(0, 16)
}

function mockFs(files) {
  readFileSync.mockImplementation((path, enc) => {
    const content = files[path]
    if (content === undefined) return enc === 'utf-8' ? '' : Buffer.from('')
    return enc === 'utf-8' ? content : Buffer.from(content)
  })
}

function fakeRunner(results) {
  const queue = [...results]
  return {
    run: vi.fn().mockImplementation(() =>
      Promise.resolve(queue.shift() || { passed: true })),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  existsSync.mockReturnValue(false)
})

describe('createManualRunner', () => {
  describe('runBatch', () => {
    it('counts killed mutations', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },                           // preflight
        { passed: false, killedBy: ['t.test.js'] }, // killed
      ])

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      const result = await manual.runBatch(false, null)

      expect(result.totalKilled).toBe(1)
      expect(result.totalSurvived).toBe(0)
      expect(result.failures).toBe(0)
    })

    it('counts surviving mutations', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },  // preflight
        { passed: true },  // survived
      ])

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      const result = await manual.runBatch(false, null)

      expect(result.totalSurvived).toBe(1)
      expect(result.totalKilled).toBe(0)
    })

    it('counts preflight failure as error', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: false }])

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
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
        { passed: false, killedBy: ['t.test.js'] },
      ])

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      await manual.runBatch(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p.includes('manual-report.json'),
      )
      expect(reportCalls).toHaveLength(1)

      const report = JSON.parse(reportCalls[0][1])
      expect(report.schemaVersion).toBe('1')
      expect(Object.keys(report.files)).toHaveLength(1)
    })

    it('restores original source after each mutation', async () => {
      const src = resolve('src/a.js')
      mockFs({ [src]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false },
      ])

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      await manual.runBatch(false, null)

      const srcWrites = writeFileSync.mock.calls.filter(([p]) => p === src)
      // Last write restores original
      expect(srcWrites.at(-1)[1]).toBe(sourceCode)
    })

    it('closes the runner after execution', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false },
      ])

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      await manual.runBatch(false, null)

      expect(runner.close).toHaveBeenCalled()
    })

    it('counts runner errors as killed', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: true }])
      // After preflight, runner.run throws on mutation
      runner.run.mockResolvedValueOnce({ passed: true }) // preflight
        .mockRejectedValue(new Error('runner crashed'))

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
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
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      const result = await manual.runBatch(false, 100)

      expect(result.totalKilled).toBe(1)
      expect(result.totalTimedOut).toBe(1)
    })
  })

  describe('runIncremental', () => {
    const reportPath = 'reports/mutation/manual-report.json'

    it('uses cached results for unchanged files', async () => {
      const src = resolve('src/a.js')
      const hash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [{ status: 'Killed' }, { status: 'Survived' }],
            },
          },
          sourceHashes: { 'src/a.js': hash },
          testHashes: {},
        }),
      })

      const createRunner = vi.fn()
      const manual = createManualRunner({
        patterns, sources: ['src/a.js'], createRunner,
      })
      const result = await manual.runIncremental(false, null)

      expect(result.totalKilled).toBe(1)
      expect(result.totalSurvived).toBe(1)
      expect(createRunner).not.toHaveBeenCalled()
    })

    it('reruns changed files', async () => {
      const src = resolve('src/a.js')

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [reportPath]: JSON.stringify({
          files: {},
          sourceHashes: { 'src/a.js': 'stale-hash' },
          testHashes: {},
        }),
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] },
      ])
      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      const result = await manual.runIncremental(false, null)

      expect(result.totalKilled).toBe(1)
      expect(result.totalSurvived).toBe(0)
    })

    it('runs all files on first run with no previous report', async () => {
      const src = resolve('src/a.js')
      existsSync.mockReturnValue(false)
      mockFs({ [src]: sourceCode })

      const runner = fakeRunner([
        { passed: true },
        { passed: true }, // survived
      ])
      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      const result = await manual.runIncremental(false, null)

      expect(result.totalSurvived).toBe(1)
    })

    it('invalidates source files when test files change', async () => {
      const src = resolve('src/a.js')
      const testFile = resolve('test/a.test.js')
      const srcHash = hashOf(sourceCode)
      const testContent = 'test code'

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [testFile]: testContent,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [{
                status: 'Killed',
                killedBy: [resolve('test/a.test.js')],
              }],
            },
          },
          sourceHashes: { 'src/a.js': srcHash },
          testHashes: { 'test/a.test.js': 'old-test-hash' },
        }),
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['test/a.test.js'] },
      ])
      const manual = createManualRunner({
        patterns,
        sources: ['src/a.js'],
        testSources: ['test/a.test.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      const result = await manual.runIncremental(false, null)

      // Source hash matches, but test changed → source re-run
      expect(result.totalKilled).toBe(1)
      expect(runner.run).toHaveBeenCalled()
    })

    it('writes merged report with cached and new results', async () => {
      const srcA = resolve('src/a.js')
      const srcB = resolve('src/b.js')
      const codeA = 'if (a === b) {}'
      const codeB = 'if (c === d) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        [srcB]: codeB,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed' }] },
          },
          sourceHashes: {
            'src/a.js': hashOf(codeA),
            'src/b.js': 'stale-hash',
          },
          testHashes: {},
        }),
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] },
      ])
      const manual = createManualRunner({
        patterns,
        sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
      })
      await manual.runIncremental(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === reportPath,
      )
      expect(reportCalls).toHaveLength(1)

      const report = JSON.parse(reportCalls[0][1])
      // src/a.js cached, src/b.js rerun
      expect(report.files['src/a.js'].mutants).toHaveLength(1)
      expect(report.files['src/b.js']).toBeDefined()
      expect(report.sourceHashes).toBeDefined()
    })
  })
})

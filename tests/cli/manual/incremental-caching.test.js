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

vi.mock('../../../src/core/worktree.js')

import { createManualRunner as _createManualRunner } from '../../../src/cli/manual.js'
import { createWorktree } from '../../../src/core/worktree.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { testMutators, sourceCode, hashOf, fakeRunner, mockFs as _mockFs, noop } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-test'
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
  createWorktree.mockReturnValue(fakeWorktree())
})

describe('createManualRunner', () => {
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
              mutants: [
                { status: 'Killed' },
                { status: 'Survived' }
              ]
            }
          },
          sourceHashes: { 'src/a.js': hash },
          testHashes: {}
        })
      })

      const createRunner = vi.fn()
      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'], createRunner
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
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])
      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
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
        { passed: true } // survived
      ])
      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runIncremental(true, null)

      expect(result.totalSurvived).toBe(1)
      const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === reportPath)
      expect(reportCalls).toHaveLength(1)
      const report = JSON.parse(reportCalls[0][1])
      expect(report.files['src/a.js']).toBeDefined()
    })

    it('updates hashes in report when nothing changed and jsonOutput is true', async () => {
      const src = resolve('src/a.js')
      const hash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed' }] }
          },
          sourceHashes: { 'src/a.js': hash },
          testHashes: {}
        })
      })

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'], createRunner: vi.fn()
      })
      await manual.runIncremental(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === reportPath)
      expect(reportCalls).toHaveLength(1)

      const report = JSON.parse(reportCalls[0][1])
      expect(report.sourceHashes['src/a.js']).toBe(hash)
    })

    it('does not update report when nothing changed and jsonOutput is false', async () => {
      const src = resolve('src/a.js')
      const hash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed' }] }
          },
          sourceHashes: { 'src/a.js': hash },
          testHashes: {}
        })
      })

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'], createRunner: vi.fn()
      })
      await manual.runIncremental(false, null)

      const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === reportPath)
      expect(reportCalls).toHaveLength(0)
    })

    it('removes stale files from merged report', async () => {
      const src = resolve('src/a.js')

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed' }] },
            'src/removed.js': { mutants: [{ status: 'Survived' }] }
          },
          sourceHashes: { 'src/a.js': 'stale-hash', 'src/removed.js': 'x' },
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])
      const manual = createManualRunner({
        mutators: testMutators,
        sources: ['src/a.js'], // src/removed.js no longer in sources
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === reportPath)
      const report = JSON.parse(reportCalls[0][1])

      expect(report.files['src/a.js']).toBeDefined()
      expect(report.files['src/removed.js']).toBeUndefined()
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
            'src/a.js': { mutants: [{ status: 'Killed' }] }
          },
          sourceHashes: {
            'src/a.js': hashOf(codeA),
            'src/b.js': 'stale-hash'
          },
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])
      const manual = createManualRunner({
        mutators: testMutators,
        sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === reportPath
      )
      expect(reportCalls).toHaveLength(1)

      const report = JSON.parse(reportCalls[0][1])
      // src/a.js cached, src/b.js rerun
      expect(report.files['src/a.js'].mutants).toHaveLength(1)
      expect(report.files['src/b.js']).toBeDefined()
      expect(report.sourceHashes).toBeDefined()
    })

    it('skips carry-forward for unchanged files missing from previous report', async () => {
      const srcA = resolve('src/a.js')
      const srcB = resolve('src/b.js')
      const srcC = resolve('src/c.js')
      const codeA = 'const a = 1'
      const codeB = 'const b = 2'
      const codeC = 'if (a === b) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        [srcB]: codeB,
        [srcC]: codeC,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed' }] }
            // src/b.js has a matching hash but no entry in files
          },
          sourceHashes: {
            'src/a.js': hashOf(codeA),
            'src/b.js': hashOf(codeB),
            'src/c.js': 'stale'
          },
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])
      const manual = createManualRunner({
        mutators: testMutators,
        sources: ['src/a.js', 'src/b.js', 'src/c.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === reportPath)
      const report = JSON.parse(reportCalls[0][1])
      expect(report.files['src/a.js']).toBeDefined()
      expect(report.files['src/b.js']).toBeUndefined()
      expect(report.files['src/c.js']).toBeDefined()
    })

    it('counts NoCoverage mutants as neither killed nor survived in cache', async () => {
      const src = resolve('src/a.js')
      const hash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                { status: 'Killed' },
                { status: 'NoCoverage' }
              ]
            }
          },
          sourceHashes: { 'src/a.js': hash },
          testHashes: {}
        })
      })

      const createRunner = vi.fn()
      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'], createRunner
      })
      const result = await manual.runIncremental(false, null)

      expect(result.totalKilled).toBe(1)
      expect(result.totalSurvived).toBe(0)
    })

    it('counts Timeout mutants as killed in cache', async () => {
      const src = resolve('src/a.js')
      const hash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                { status: 'Timeout' },
                { status: 'Survived' }
              ]
            }
          },
          sourceHashes: { 'src/a.js': hash },
          testHashes: {}
        })
      })

      const createRunner = vi.fn()
      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'], createRunner
      })
      const result = await manual.runIncremental(false, null)

      expect(result.totalKilled).toBe(1)
      expect(result.totalSurvived).toBe(1)
    })

    it('prints incremental summary with cached + batch grand totals', async () => {
      const srcA = resolve('src/a.js')
      const srcB = resolve('src/b.js')
      const codeA = 'const a = 1'
      const codeB = 'if (a === b) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        [srcB]: codeB,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] }
          },
          sourceHashes: {
            'src/a.js': hashOf(codeA),
            'src/b.js': 'stale'
          },
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])
      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators,
        sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      const result = await manual.runIncremental(false, null)

      // Grand totals: 1 batch killed + 1 cached killed = 2, 0 batch survived + 1 cached survived = 1
      expect(result.totalKilled).toBe(2)
      expect(result.totalSurvived).toBe(1)
      const output = lines.join('\n')
      expect(output).toContain('Killed: 2')
      expect(output).toContain('Survived: 1')
    })

    it('omits changed test line in header when no tests changed', async () => {
      const src = resolve('src/a.js')

      existsSync.mockReturnValue(false)
      mockFs({ [src]: sourceCode })

      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])
      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators,
        sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      await manual.runIncremental(false, null)

      expect(lines.join('\n')).not.toContain('Changed tests')
    })

    it('writes structured report to custom path when jsonOutput is a path', async () => {
      const src = resolve('src/a.js')
      existsSync.mockReturnValue(false)
      mockFs({ [src]: sourceCode })

      const runner = fakeRunner([
        { passed: true },
        { passed: true } // survived
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental('reports/custom.json', null)

      const customCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/custom.json')
      )
      expect(customCalls).toHaveLength(1)

      const report = JSON.parse(customCalls[0][1])
      expect(report).toHaveProperty('score')
      expect(report).toHaveProperty('total')
      expect(report).toHaveProperty('killed')
      expect(report).toHaveProperty('survived')
      expect(report).toHaveProperty('files')
      expect(report).toHaveProperty('survivors')

      // Should not write to default report path
      const defaultCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === reportPath
      )
      expect(defaultCalls).toHaveLength(0)

      const stderrOutput = process.stderr.write.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).toContain('Score:')
    })

    it('writes structured report with cached + fresh results when jsonOutput is a path', async () => {
      const srcA = resolve('src/a.js')
      const srcB = resolve('src/b.js')
      const codeA = 'const a = 1'
      const codeB = 'if (a === b) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        [srcB]: codeB,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                { status: 'Killed', mutatorName: 'eq', location: { start: { line: 1 } }, description: '== → !=' },
                { status: 'Survived', mutatorName: 'eq2', location: { start: { line: 2 } }, description: '== → ===' }
              ]
            }
          },
          sourceHashes: {
            'src/a.js': hashOf(codeA),
            'src/b.js': 'stale'
          },
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const manual = createManualRunner({
        mutators: testMutators,
        sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental('reports/merged.json', null)

      const reportCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/merged.json')
      )
      expect(reportCalls).toHaveLength(1)

      const report = JSON.parse(reportCalls[0][1])
      // a.js cached: 1 killed + 1 survived; b.js fresh: 1 killed
      expect(report.killed).toBe(2)
      expect(report.survived).toBe(1)
      expect(report.total).toBe(3)
      expect(report.survivors).toHaveLength(1)
      expect(report.survivors[0].file).toBe('src/a.js')
    })

    it('prunes stale carried-forward files using normalized source paths', async () => {
      const srcA = resolve('./src/a.js')
      const srcB = resolve('./src/b.js')
      const codeA = 'const a = 1'
      const codeB = 'if (a === b) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        [srcB]: codeB,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed' }] },
            'deleted.js': { mutants: [{ status: 'Killed' }] }
          },
          sourceHashes: {
            'src/a.js': hashOf(codeA),
            'src/b.js': 'stale'
          },
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])
      // Use './' prefix sources to test path normalization
      const manual = _createManualRunner({
        mutators: testMutators,
        sources: ['./src/a.js', './src/b.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: noop
      })
      await manual.runIncremental(true, null)

      const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === reportPath)
      const report = JSON.parse(reportCalls[0][1])
      expect(report.files['src/a.js']).toBeDefined()
      expect(report.files['src/b.js']).toBeDefined()
      expect(report.files['deleted.js']).toBeUndefined()
    })

    it('skips cached files not in previous report when writing structured report', async () => {
      const srcA = resolve('src/a.js')
      const srcB = resolve('src/b.js')
      const hashA = hashOf(sourceCode)
      const hashB = hashOf('const y = 1')

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: sourceCode,
        [srcB]: 'const y = 1',
        [reportPath]: JSON.stringify({
          schemaVersion: '1',
          files: {
            'src/a.js': {
              mutants: [{ location: { start: { line: 1 } }, mutatorName: '=== → !==', replacement: ' !== ', status: 'Killed' }]
            }
            // src/b.js intentionally absent from previous report files
          },
          sourceHashes: { 'src/a.js': hashA, 'src/b.js': hashB },
          testHashes: {}
        })
      })


      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn()
      })
      await manual.runIncremental('reports/custom.json', null)

      const customCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/custom.json')
      )
      expect(customCalls).toHaveLength(1)
      const report = JSON.parse(customCalls[0][1])
      // Only src/a.js should be in files (src/b.js not in previous report)
      expect(report.files['src/a.js']).toBeDefined()
      expect(report.files['src/b.js']).toBeUndefined()
    })

    it('writes structured report to json path when no sources changed', async () => {
      const src = resolve('src/a.js')
      const hash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [reportPath]: JSON.stringify({
          schemaVersion: '1',
          files: {
            'src/a.js': {
              mutants: [{ location: { start: { line: 1 } }, mutatorName: '=== → !==', replacement: ' !== ', status: 'Killed' }]
            }
          },
          sourceHashes: { 'src/a.js': hash },
          testHashes: {}
        })
      })


      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn()
      })
      await manual.runIncremental('reports/custom.json', null)

      const customCalls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/custom.json')
      )
      expect(customCalls).toHaveLength(1)
    })
  })
})

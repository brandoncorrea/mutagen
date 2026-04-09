import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { loadPreviousReport, countCachedResults, runIncremental, HASH_PREFIX_LENGTH } from '../../cli/incremental.js'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

describe('loadPreviousReport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    console.warn.mockRestore()
    vi.restoreAllMocks()
  })

  it('returns defaults when report file does not exist', () => {
    existsSync.mockReturnValue(false)

    const result = loadPreviousReport('/tmp/report.json')

    expect(result.previousReport).toBeNull()
    expect(result.previousHashes).toEqual({})
    expect(result.previousTestHashes).toEqual({})
  })

  it('parses a valid report file', () => {
    const report = {
      files: {},
      sourceHashes: { 'a.js': 'abc123' },
      testHashes: { 'a.test.js': 'def456' }
    }
    existsSync.mockReturnValue(true)
    readFileSync.mockReturnValue(JSON.stringify(report))

    const result = loadPreviousReport('/tmp/report.json')

    expect(result.previousReport).toEqual(report)
    expect(result.previousHashes).toEqual({ 'a.js': 'abc123' })
    expect(result.previousTestHashes).toEqual({ 'a.test.js': 'def456' })
  })

  it('warns when report file contains corrupt JSON', () => {
    existsSync.mockReturnValue(true)
    readFileSync.mockReturnValue('not valid json {{{')

    const result = loadPreviousReport('/tmp/report.json')

    expect(result.previousReport).toBeNull()
    expect(result.previousHashes).toEqual({})
    expect(result.previousTestHashes).toEqual({})
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('report.json')
    )
  })
})

describe('countCachedResults', () => {
  it('returns zeros when report is null', () => {
    const result = countCachedResults(null, ['a.js'])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })

  it('returns zeros when no relPaths match report files', () => {
    const report = {
      files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
    }
    const result = countCachedResults(report, ['b.js'])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })

  it('counts Killed mutants', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Killed' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(2)
    expect(result.survived).toBe(0)
  })

  it('counts Survived mutants', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Survived' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.survived).toBe(1)
    expect(result.killed).toBe(0)
  })

  it('counts Timeout mutants as killed', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Timeout' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(1)
  })

  it('aggregates counts across multiple files', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }] },
        'b.js': { mutants: [{ status: 'Survived' }, { status: 'Killed' }] }
      }
    }
    const result = countCachedResults(report, ['a.js', 'b.js'])
    expect(result.killed).toBe(2)
    expect(result.survived).toBe(1)
  })

  it('ignores mutants with unrecognized status', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Unknown' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(1)
    expect(result.survived).toBe(0)
  })

  it('returns zeros when relPaths is empty', () => {
    const report = {
      files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
    }
    const result = countCachedResults(report, [])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })
})

describe('runIncremental', () => {
  const sourceCode = 'if (a === b) {}'

  function hashOf(content) {
    return createHash('sha256').update(Buffer.from(content)).digest('hex').slice(0, HASH_PREFIX_LENGTH)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    console.log.mockRestore()
  })

  it('carries forward unchanged file results and skips unchanged test hashes', async () => {
    const srcA = resolve('src/a.js')
    const srcB = resolve('src/b.js')
    const testFile = resolve('test/a.test.js')
    const codeA = 'const a = 1'
    const codeB = 'if (a === b) {}'
    const testCode = 'test code'
    const hashA = hashOf(codeA)
    const hashTest = hashOf(testCode)

    existsSync.mockReturnValue(true)
    readFileSync.mockImplementation((path, enc) => {
      if (path === 'reports/report.json')
        return JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed' }] },
          },
          sourceHashes: { 'src/a.js': hashA, 'src/b.js': 'stale' },
          testHashes: { 'test/a.test.js': hashTest },
        })
      const map = { [srcA]: codeA, [srcB]: codeB, [testFile]: testCode }
      const content = map[path] || ''
      return enc === 'utf-8' ? content : Buffer.from(content)
    })

    const fakeRunBatch = vi.fn().mockResolvedValue({
      totalSurvived: 0, totalKilled: 1, failures: 0,
      fileResults: {
        'src/b.js': { mutants: [{ status: 'Killed' }] },
      }
    })

    await runIncremental(
      {
        sources: ['src/a.js', 'src/b.js'],
        testSources: ['test/a.test.js'],
        reportDir: 'reports',
        reportPath: 'reports/report.json',
        runBatch: fakeRunBatch,
      },
      true,
      null
    )

    // Only src/b.js should be rerun (changed hash), src/a.js cached
    expect(fakeRunBatch).toHaveBeenCalledWith(false, null, ['src/b.js'])

    const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === 'reports/report.json')
    const report = JSON.parse(reportCalls[0][1])
    // src/a.js carried forward from previous report
    expect(report.files['src/a.js']).toBeDefined()
    expect(report.files['src/b.js']).toBeDefined()
  })

  it('continues loop past non-matching mutants in test invalidation', async () => {
    const src = resolve('src/a.js')
    const testFile = resolve('test/a.test.js')
    const srcCode = 'if (a === b) {}'
    const testCode = 'new test'

    existsSync.mockReturnValue(true)
    readFileSync.mockImplementation((path, enc) => {
      if (path === 'reports/report.json')
        return JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                { status: 'Killed', killedBy: ['/other/test.js'] },
                { status: 'Killed' },
              ],
            },
          },
          sourceHashes: { 'src/a.js': hashOf(srcCode) },
          testHashes: { 'test/a.test.js': 'old-hash' },
        })
      const map = { [src]: srcCode, [testFile]: testCode }
      const content = map[path] || ''
      return enc === 'utf-8' ? content : Buffer.from(content)
    })

    const fakeRunBatch = vi.fn().mockResolvedValue({
      totalSurvived: 0, totalKilled: 0, failures: 0, fileResults: {}
    })

    const result = await runIncremental(
      {
        sources: ['src/a.js'],
        testSources: ['test/a.test.js'],
        reportDir: 'reports',
        reportPath: 'reports/report.json',
        runBatch: fakeRunBatch,
      },
      false,
      null
    )

    // Source hash matches but test changed. However, killedBy doesn't match
    // the changed test, and status is not Survived. So source is NOT invalidated.
    // Source should be unchanged → cached.
    expect(fakeRunBatch).not.toHaveBeenCalled()
    expect(result.totalKilled).toBe(2)
  })

  it('writes report without carry-forward when no previous report exists', async () => {
    const src = resolve('src/a.js')

    existsSync.mockReturnValue(false) // no previous report
    readFileSync.mockImplementation((path, enc) => {
      if (path === src) return enc === 'utf-8' ? sourceCode : Buffer.from(sourceCode)
      return Buffer.from('')
    })

    const fakeRunBatch = vi.fn().mockResolvedValue({
      totalSurvived: 0, totalKilled: 1, failures: 0,
      fileResults: { 'src/a.js': { mutants: [{ status: 'Killed' }] } }
    })

    await runIncremental(
      {
        sources: ['src/a.js'],
        testSources: [],
        reportDir: 'reports',
        reportPath: 'reports/report.json',
        runBatch: fakeRunBatch,
      },
      true,
      null
    )

    const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === 'reports/report.json')
    expect(reportCalls).toHaveLength(1)
    const report = JSON.parse(reportCalls[0][1])
    expect(report.files['src/a.js']).toBeDefined()
    expect(report.sourceHashes).toBeDefined()
  })

  it('skips carry-forward for unchanged files missing from previous report', async () => {
    const srcA = resolve('src/a.js')
    const srcB = resolve('src/b.js')
    const srcC = resolve('src/c.js')
    const codeA = 'const a = 1'
    const codeB = 'if (a === b) {}'
    const codeC = 'const c = 3'

    existsSync.mockReturnValue(true)
    readFileSync.mockImplementation((path, enc) => {
      if (path === 'reports/report.json')
        return JSON.stringify({
          // files has src/a.js results but NOT src/b.js
          files: { 'src/a.js': { mutants: [{ status: 'Killed' }] } },
          // sourceHashes: a.js and b.js match (unchanged), c.js is stale (changed)
          sourceHashes: {
            'src/a.js': hashOf(codeA),
            'src/b.js': hashOf(codeB),
            'src/c.js': 'stale',
          },
          testHashes: {},
        })
      const map = { [srcA]: codeA, [srcB]: codeB, [srcC]: codeC }
      const content = map[path] || ''
      return enc === 'utf-8' ? content : Buffer.from(content)
    })

    // c.js changed → batch runs on c.js. This ensures writeMergedReport is called.
    const fakeRunBatch = vi.fn().mockResolvedValue({
      totalSurvived: 0, totalKilled: 1, failures: 0,
      fileResults: { 'src/c.js': { mutants: [{ status: 'Killed' }] } }
    })

    await runIncremental(
      {
        sources: ['src/a.js', 'src/b.js', 'src/c.js'],
        testSources: [],
        reportDir: 'reports',
        reportPath: 'reports/report.json',
        runBatch: fakeRunBatch,
      },
      true,
      null
    )

    // Only c.js should be rerun
    expect(fakeRunBatch).toHaveBeenCalledWith(false, null, ['src/c.js'])

    const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === 'reports/report.json')
    const report = JSON.parse(reportCalls[0][1])
    // src/a.js carried forward (has entry in previousReport.files)
    expect(report.files['src/a.js']).toBeDefined()
    // src/b.js NOT carried forward (no entry in previousReport.files, despite matching hash)
    expect(report.files['src/b.js']).toBeUndefined()
    // src/c.js from batch results
    expect(report.files['src/c.js']).toBeDefined()
  })

  it('removes stale files from merged report when batch returns extra keys', async () => {
    const src = resolve('src/a.js')

    existsSync.mockReturnValue(true)
    readFileSync.mockImplementation((path, enc) => {
      if (path === 'reports/report.json')
        return JSON.stringify({
          files: {},
          sourceHashes: { 'src/a.js': 'stale' },
          testHashes: {},
        })
      if (path === src) return enc === 'utf-8' ? sourceCode : Buffer.from(sourceCode)
      return Buffer.from('')
    })

    // Fake runBatch that returns results for src/a.js AND a stale file
    const fakeRunBatch = vi.fn().mockResolvedValue({
      totalSurvived: 0, totalKilled: 1, failures: 0,
      fileResults: {
        'src/a.js': { mutants: [{ status: 'Killed' }] },
        'src/stale.js': { mutants: [{ status: 'Survived' }] },
      }
    })

    await runIncremental(
      {
        sources: ['src/a.js'],
        testSources: [],
        reportDir: 'reports',
        reportPath: 'reports/report.json',
        runBatch: fakeRunBatch,
      },
      true, // jsonOutput
      null
    )

    const reportCalls = writeFileSync.mock.calls.filter(([p]) => p === 'reports/report.json')
    expect(reportCalls).toHaveLength(1)
    const report = JSON.parse(reportCalls[0][1])
    expect(report.files['src/a.js']).toBeDefined()
    expect(report.files['src/stale.js']).toBeUndefined()
  })
})

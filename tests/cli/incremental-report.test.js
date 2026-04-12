import { describe, it, expect, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { countCachedResults, printIncrementalSummary, printIncrementalHeader, handleAllCached, writeMergedReport } from '../../cli/incremental-report.js'

vi.mock('node:fs', async (importOriginal) => {
  const orig = await importOriginal()
  return { ...orig, writeFileSync: vi.fn(), mkdirSync: vi.fn() }
})

describe('countCachedResults', () => {
  it('counts killed and survived mutants from cached files', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] },
        'b.js': { mutants: [{ status: 'Killed' }, { status: 'Killed' }] }
      }
    }
    const result = countCachedResults(report, ['a.js', 'b.js'])
    expect(result).toEqual({ killed: 3, survived: 1 })
  })

  it('returns zeros when report is null', () => {
    expect(countCachedResults(null, ['a.js'])).toEqual({ killed: 0, survived: 0 })
  })

  it('skips files not in the report', () => {
    const report = { files: { 'a.js': { mutants: [{ status: 'Killed' }] } } }
    const result = countCachedResults(report, ['missing.js'])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })

  it('counts Timeout mutants as killed', () => {
    const report = {
      files: { 'a.js': { mutants: [{ status: 'Timeout' }] } }
    }
    expect(countCachedResults(report, ['a.js'])).toEqual({ killed: 1, survived: 0 })
  })
})

describe('printIncrementalSummary', () => {
  it('adds cached counts to batch totals for grand totals', () => {
    const lines = []
    const out = msg => lines.push(msg)
    const batchResult = { totalSurvived: 2, totalKilled: 5, failures: 1 }
    const previous = {
      previousReport: {
        files: {
          'cached.js': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] }
        }
      }
    }
    const classification = {
      changedSources: ['changed.js'],
      unchangedSources: ['cached.js']
    }

    const result = printIncrementalSummary(out, batchResult, ['changed.js', 'cached.js'], previous, classification)

    // Grand totals must ADD cached counts, not subtract
    expect(result.totalKilled).toBe(6)    // 5 batch + 1 cached
    expect(result.totalSurvived).toBe(3)  // 2 batch + 1 cached
    expect(result.failures).toBe(1)

    const output = lines.join('\n')
    expect(output).toContain('Killed: 6')
    expect(output).toContain('Survived: 3')
  })

  it('returns correct totals when no cached results exist', () => {
    const out = () => {}
    const batchResult = { totalSurvived: 1, totalKilled: 3, failures: 0 }
    const previous = { previousReport: null }
    const classification = { changedSources: ['a.js'], unchangedSources: [] }

    const result = printIncrementalSummary(out, batchResult, ['a.js'], previous, classification)

    expect(result.totalKilled).toBe(3)
    expect(result.totalSurvived).toBe(1)
  })
})

describe('printIncrementalHeader', () => {
  it('shows changed test file count when tests changed', () => {
    const lines = []
    const out = msg => lines.push(msg)
    const sources = ['a.js', 'b.js', 'c.js']
    const classification = {
      changedSources: ['a.js'],
      unchangedSources: ['b.js', 'c.js'],
      changedTestFiles: ['test1.js', 'test2.js'],
      testInvalidated: new Set(['a.js'])
    }

    printIncrementalHeader(out, sources, classification)

    const output = lines.join('\n')
    expect(output).toContain('Changed tests: 2')
  })

  it('omits changed test line when no tests changed', () => {
    const lines = []
    const out = msg => lines.push(msg)
    const classification = {
      changedSources: ['a.js'],
      unchangedSources: [],
      changedTestFiles: [],
      testInvalidated: new Set()
    }

    printIncrementalHeader(out, ['a.js'], classification)

    const output = lines.join('\n')
    expect(output).not.toContain('Changed tests')
  })
})

describe('handleAllCached', () => {
  it('returns failures as 0', () => {
    const out = () => {}
    const config = { sources: ['a.js'], reportPath: '/tmp/report.json' }
    const previous = {
      previousReport: {
        files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
      }
    }
    const classification = {
      unchangedSources: ['a.js'],
      currentHashes: {},
      currentTestHashes: {}
    }

    const result = handleAllCached(out, config, previous, classification, false)

    expect(result.failures).toBe(0)
    expect(result.totalKilled).toBe(1)
    expect(result.totalSurvived).toBe(0)
  })

  it('writes updated report only when jsonOutput AND previousReport are both truthy', () => {
    const out = () => {}
    const config = { sources: ['a.js'], reportPath: '/tmp/test-report.json' }
    const currentHashes = { 'a.js': 'abc123' }
    const currentTestHashes = { 'test.js': 'def456' }
    const previousReport = {
      files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
    }
    const previous = { previousReport }
    const classification = {
      unchangedSources: ['a.js'],
      currentHashes,
      currentTestHashes
    }

    // jsonOutput=true AND previousReport exists → should write
    vi.mocked(writeFileSync).mockClear()
    handleAllCached(out, config, previous, classification, true)

    expect(previousReport.sourceHashes).toBe(currentHashes)
    expect(previousReport.testHashes).toBe(currentTestHashes)
    expect(writeFileSync).toHaveBeenCalledOnce()
  })

  it('does not write report when jsonOutput is false', () => {
    const out = () => {}
    const config = { sources: ['a.js'], reportPath: '/tmp/test-report.json' }
    const previousReport = {
      files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
    }
    const previous = { previousReport }
    const classification = {
      unchangedSources: ['a.js'],
      currentHashes: { 'a.js': 'abc' },
      currentTestHashes: {}
    }

    vi.mocked(writeFileSync).mockClear()
    handleAllCached(out, config, previous, classification, false)

    // jsonOutput=false → should NOT modify report or write file
    expect(previousReport.sourceHashes).toBeUndefined()
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('does not write report when previousReport is null', () => {
    const out = () => {}
    const config = { sources: [], reportPath: '/tmp/test-report.json' }
    const previous = { previousReport: null }
    const classification = {
      unchangedSources: [],
      currentHashes: {},
      currentTestHashes: {}
    }

    vi.mocked(writeFileSync).mockClear()
    handleAllCached(out, config, previous, classification, true)

    // jsonOutput=true but no previousReport → should not write
    expect(writeFileSync).not.toHaveBeenCalled()
  })
})

describe('writeMergedReport', () => {
  it('prunes files not in current sources using normalized relative paths', () => {
    vi.mocked(writeFileSync).mockClear()

    const out = () => {}
    // Use './' prefix so resolve+relative normalizes to 'src/a.js'
    // If map→filter mutation, the Set would contain './src/a.js' (original)
    // instead of 'src/a.js' (normalized), and pruning would delete the file
    const config = {
      sources: ['./src/a.js'],
      reportDir: '/tmp',
      reportPath: '/tmp/report.json',
    }
    const previous = {
      previousReport: {
        files: {
          'deleted.js': { mutants: [{ status: 'Killed' }] }
        }
      }
    }
    const classification = {
      unchangedSources: ['deleted.js'],
      currentHashes: {},
      currentTestHashes: {}
    }
    const fileResults = {
      'src/a.js': { mutants: [{ status: 'Survived' }] }
    }

    writeMergedReport(out, config, previous, classification, fileResults)

    // Verify writeFileSync was called with correct data
    expect(writeFileSync).toHaveBeenCalledOnce()
    const writtenReport = JSON.parse(writeFileSync.mock.calls[0][1])

    // 'src/a.js' should be present (it's in current sources, normalized)
    expect(writtenReport.files['src/a.js']).toBeDefined()
    // 'deleted.js' was cached but not in current sources → pruned
    expect(writtenReport.files['deleted.js']).toBeUndefined()
  })
})

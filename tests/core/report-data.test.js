import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
})

import {
  mutantKey, countStatuses, totalMutants, mutationScore,
  toJsonMutants, createReport, writeReportFile, tryLoadJson,
  combineReportData
} from '../../core/report-data.js'

describe('mutantKey', () => {
  it('builds a key from path, line, mutator name, and replacement', () => {
    const m = {
      location: { start: { line: 10 } },
      mutatorName: '=== → !==',
      replacement: ' !== '
    }
    expect(mutantKey('src/foo.js', m)).toBe('src/foo.js:10:=== → !==: !== ')
  })

  it('defaults to line 0 when location is missing', () => {
    const m = { mutatorName: 'test', replacement: 'r' }
    expect(mutantKey('file.js', m)).toBe('file.js:0:test:r')
  })

  it('handles missing mutatorName and replacement', () => {
    const m = { location: { start: { line: 5 } } }
    expect(mutantKey('file.js', m)).toBe('file.js:5::')
  })

  it('defaults to line 0 when location.start is null (optional chaining boundary)', () => {
    // location exists but start is null — location?.start?.line safely returns undefined
    // Without optional chaining on start (location?.start.line), this would throw TypeError
    const m = { location: { start: null }, mutatorName: 'x', replacement: 'y' }
    expect(mutantKey('file.js', m)).toBe('file.js:0:x:y')
  })
})

describe('countStatuses', () => {
  it('counts each status type across files', () => {
    const report = {
      files: {
        'a.js': {
          mutants: [
            { status: 'Killed' },
            { status: 'Survived' }
          ]
        },
        'b.js': {
          mutants: [
            { status: 'NoCoverage' },
            { status: 'Timeout' },
            { status: 'Killed' }
          ]
        }
      }
    }
    expect(countStatuses(report)).toEqual({
      killed: 2,
      survived: 1,
      noCoverage: 1,
      timeout: 1
    })
  })

  it('returns zeros when no mutants exist', () => {
    const report = { files: {} }
    expect(countStatuses(report)).toEqual({
      killed: 0,
      survived: 0,
      noCoverage: 0,
      timeout: 0
    })
  })

  it('ignores unrecognized statuses', () => {
    const report = {
      files: {
        'a.js': {
          mutants: [
            { status: 'Killed' },
            { status: 'CompileError' }
          ]
        }
      }
    }
    expect(countStatuses(report)).toEqual({
      killed: 1,
      survived: 0,
      noCoverage: 0,
      timeout: 0
    })
  })
})

describe('totalMutants', () => {
  it('sums all four status counts', () => {
    const counts = { killed: 3, survived: 2, noCoverage: 1, timeout: 4 }
    expect(totalMutants(counts)).toBe(10)
  })

  it('returns zero when all counts are zero', () => {
    const counts = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 }
    expect(totalMutants(counts)).toBe(0)
  })
})

describe('mutationScore', () => {
  it('computes (killed + timeout) / total * 100', () => {
    const counts = { killed: 3, survived: 1, noCoverage: 0, timeout: 1 }
    expect(mutationScore(counts)).toBeCloseTo(80.0)
  })

  it('returns 100 when total is zero', () => {
    const counts = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 }
    expect(mutationScore(counts)).toBe(100)
  })

  it('counts timeout as killed for scoring', () => {
    const counts = { killed: 0, survived: 1, noCoverage: 0, timeout: 1 }
    expect(mutationScore(counts)).toBeCloseTo(50.0)
  })
})

describe('toJsonMutants', () => {
  it('converts killed and survived results to Stryker-compatible format', () => {
    const results = {
      killed: [
        {
          line: 5,
          name: '=== → !==',
          original: 'a === b',
          mutated: 'a !== b',
          killedBy: ['/tests/a.test.js']
        }
      ],
      survived: [
        {
          line: 10,
          name: '+ → -',
          original: 'a + b',
          mutated: 'a - b'
        }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants).toHaveLength(2)

    const killed = output.mutants.find(m => m.status === 'Killed')
    expect(killed.mutatorName).toBe('=== → !==')
    expect(killed.location.start.line).toBe(5)
    expect(killed.killedBy).toEqual(['/tests/a.test.js'])

    const survived = output.mutants.find(m => m.status === 'Survived')
    expect(survived.mutatorName).toBe('+ → -')
    expect(survived.killedBy).toBeUndefined()
  })

  it('sets column to 0 in start and end locations', () => {
    const results = {
      killed: [{ line: 7, name: 'x', original: 'a', mutated: 'b', killedBy: ['t.js'] }],
      survived: []
    }
    const output = toJsonMutants('/project/src/foo.js', results)
    const m = output.mutants[0]
    expect(m.location.start.column).toBe(0)
    expect(m.location.end.column).toBe(0)
  })

  it('excludes killedBy when it is an empty array', () => {
    const results = {
      killed: [{ line: 3, name: 'x', original: 'a', mutated: 'b', killedBy: [] }],
      survived: []
    }
    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants[0]).not.toHaveProperty('killedBy')
  })

  it('includes timedOut mutations as Timeout status', () => {
    const results = {
      killed: [],
      survived: [],
      timedOut: [
        { line: 3, name: '&& → ||', original: 'a && b', mutated: 'a || b' }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants).toHaveLength(1)
    expect(output.mutants[0].status).toBe('Timeout')
    expect(output.mutants[0].mutatorName).toBe('&& → ||')
  })

  it('includes coveredBy on survived mutations when present', () => {
    const results = {
      killed: [],
      survived: [
        {
          line: 10,
          name: '+ → -',
          original: 'a + b',
          mutated: 'a - b',
          coveredBy: ['tests/math.test.js']
        }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    const survived = output.mutants[0]
    expect(survived.coveredBy).toEqual(['tests/math.test.js'])
  })

  it('excludes coveredBy when it is an empty array', () => {
    const results = {
      killed: [],
      survived: [
        { line: 10, name: 'x', original: 'a', mutated: 'b', coveredBy: [] }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants[0]).not.toHaveProperty('coveredBy')
  })

  it('excludes coveredBy when not present on mutation', () => {
    const results = {
      killed: [],
      survived: [
        { line: 10, name: 'x', original: 'a', mutated: 'b' }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants[0]).not.toHaveProperty('coveredBy')
  })

  it('produces a relative path', () => {
    const output = toJsonMutants(process.cwd() + '/src/foo.js', { killed: [], survived: [] })
    expect(output.path).toBe('src/foo.js')
  })
})

describe('createReport', () => {
  it('builds a report with schemaVersion, thresholds, and files', () => {
    const files = { 'a.js': { mutants: [{ status: 'Killed' }] } }
    const report = createReport(files)

    expect(report).toEqual({
      schemaVersion: '1',
      thresholds: { high: 80, low: 60 },
      files
    })
  })

  it('merges extra properties into the report', () => {
    const files = { 'a.js': { mutants: [] } }
    const report = createReport(files, { sourceHashes: { 'a.js': 'abc' }, testHashes: { 't.js': 'def' } })

    expect(report.schemaVersion).toBe('1')
    expect(report.thresholds).toEqual({ high: 80, low: 60 })
    expect(report.files).toBe(files)
    expect(report.sourceHashes).toEqual({ 'a.js': 'abc' })
    expect(report.testHashes).toEqual({ 't.js': 'def' })
  })

  it('returns empty files when given an empty object', () => {
    const report = createReport({})
    expect(report.files).toEqual({})
    expect(report.schemaVersion).toBe('1')
  })
})

describe('writeReportFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the directory, writes JSON, and logs the path', () => {
    const report = { schemaVersion: '1', thresholds: { high: 80, low: 60 }, files: {} }
    const out = vi.fn()

    writeReportFile('reports/mutation', 'reports/mutation/report.json', report, out)

    expect(mkdirSync).toHaveBeenCalledWith('reports/mutation', { recursive: true })
    expect(writeFileSync).toHaveBeenCalledWith(
      'reports/mutation/report.json',
      JSON.stringify(report, null, 2)
    )
    expect(out).toHaveBeenCalledWith('JSON report: reports/mutation/report.json')
  })
})

describe('tryLoadJson', () => {
  afterEach(() => {
    readFileSync.mockReset()
  })

  it('parses valid JSON from a file', () => {
    const data = { files: {}, schemaVersion: '1' }
    readFileSync.mockReturnValue(JSON.stringify(data))

    const result = tryLoadJson('/tmp/report.json')

    expect(result).toEqual(data)
  })

  it('returns undefined and calls out on read error', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const out = vi.fn()

    const result = tryLoadJson('/tmp/missing.json', out)

    expect(result).toBeUndefined()
    expect(out).toHaveBeenCalledWith(expect.stringContaining('Warning'))
    expect(out).toHaveBeenCalledWith(expect.stringContaining('missing.json'))
  })

  it('returns undefined and calls out on invalid JSON', () => {
    readFileSync.mockReturnValue('not valid json {{{')
    const out = vi.fn()

    const result = tryLoadJson('/tmp/bad.json', out)

    expect(result).toBeUndefined()
    expect(out).toHaveBeenCalledWith(expect.stringContaining('Warning'))
  })

  it('returns undefined silently when no out callback provided', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })

    const result = tryLoadJson('/tmp/missing.json')

    expect(result).toBeUndefined()
  })
})

describe('combineReportData', () => {
  beforeEach(() => {
    readFileSync.mockReset()
  })

  it('merges mutants from multiple report files', () => {
    const report1 = {
      files: {
        'a.js': {
          language: 'javascript',
          mutants: [
            {
              location: { start: { line: 1 } },
              mutatorName: 'x',
              replacement: 'y',
              status: 'Killed'
            }
          ]
        }
      }
    }
    const report2 = {
      files: {
        'b.js': {
          language: 'javascript',
          mutants: [
            {
              location: { start: { line: 5 } },
              mutatorName: 'z',
              replacement: 'w',
              status: 'Survived'
            }
          ]
        }
      }
    }
    readFileSync
      .mockReturnValueOnce(JSON.stringify(report1))
      .mockReturnValueOnce(JSON.stringify(report2))

    const merged = combineReportData(['file1.json', 'file2.json'], () => {})

    expect(Object.keys(merged.files)).toEqual(['a.js', 'b.js'])
    expect(merged.files['a.js'].mutants).toHaveLength(1)
    expect(merged.files['b.js'].mutants).toHaveLength(1)
    expect(merged.schemaVersion).toBe('1')
    expect(merged.thresholds).toEqual({ high: 80, low: 60 })
  })

  it('deduplicates mutants with the same key', () => {
    const mutant = {
      location: { start: { line: 1 } },
      mutatorName: 'x',
      replacement: 'y',
      status: 'Killed'
    }
    const report = {
      files: {
        'a.js': { language: 'javascript', mutants: [mutant] }
      }
    }
    readFileSync
      .mockReturnValueOnce(JSON.stringify(report))
      .mockReturnValueOnce(JSON.stringify(report))

    const out = vi.fn()
    const merged = combineReportData(['file1.json', 'file2.json'], out)

    expect(merged.files['a.js'].mutants).toHaveLength(1)
    expect(out).toHaveBeenCalledWith(expect.stringContaining('Deduplicated'))
  })

  it('reports the exact duplicate count', () => {
    const mutant = {
      location: { start: { line: 1 } },
      mutatorName: 'x',
      replacement: 'y',
      status: 'Killed'
    }
    const report = {
      files: {
        'a.js': { language: 'javascript', mutants: [mutant] }
      }
    }
    readFileSync
      .mockReturnValueOnce(JSON.stringify(report))
      .mockReturnValueOnce(JSON.stringify(report))

    const out = vi.fn()
    combineReportData(['file1.json', 'file2.json'], out)

    expect(out).toHaveBeenCalledWith('  Deduplicated: 1 duplicate mutant(s) removed')
  })

  it('handles unreadable files gracefully', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const out = vi.fn()

    const merged = combineReportData(['bad.json'], out)

    expect(Object.keys(merged.files)).toHaveLength(0)
    expect(out).toHaveBeenCalledWith(expect.stringContaining('Warning'))
  })

  it('merges mutants into the same file from different reports', () => {
    const report1 = {
      files: {
        'a.js': {
          language: 'javascript',
          mutants: [
            {
              location: { start: { line: 1 } },
              mutatorName: 'x',
              replacement: 'y',
              status: 'Killed'
            }
          ]
        }
      }
    }
    const report2 = {
      files: {
        'a.js': {
          language: 'javascript',
          mutants: [
            {
              location: { start: { line: 2 } },
              mutatorName: 'z',
              replacement: 'w',
              status: 'Survived'
            }
          ]
        }
      }
    }
    readFileSync
      .mockReturnValueOnce(JSON.stringify(report1))
      .mockReturnValueOnce(JSON.stringify(report2))

    const merged = combineReportData(['file1.json', 'file2.json'], () => {})

    expect(merged.files['a.js'].mutants).toHaveLength(2)
  })

  it('returns empty files for empty input', () => {
    const merged = combineReportData([], () => {})
    expect(Object.keys(merged.files)).toHaveLength(0)
  })
})

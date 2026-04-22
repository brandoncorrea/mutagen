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

import { mutantKey, mutationId, assignMutationIds } from '../../src/core/mutation-id.js'
import { countStatuses, totalMutants, mutationScore } from '../../src/core/mutation-status.js'
import {
  toJsonMutants, createReport, writeReportFile, tryLoadJson,
  combineReportData, writeStructuredReportFile, buildStructuredReport
} from '../../src/core/report-data.js'

describe('mutationId', () => {
  it('returns first 8 hex chars of SHA-256 of file:line:name', () => {
    const id = mutationId('src/foo.js', 10, '=== → !==')
    expect(id).toMatch(/^[0-9a-f]{8}$/)
    expect(id).toHaveLength(8)
  })

  it('is deterministic — same inputs produce same output', () => {
    const a = mutationId('src/foo.js', 10, '=== → !==')
    const b = mutationId('src/foo.js', 10, '=== → !==')
    expect(a).toBe(b)
  })

  it('differs for different file paths', () => {
    const a = mutationId('src/foo.js', 10, '=== → !==')
    const b = mutationId('src/bar.js', 10, '=== → !==')
    expect(a).not.toBe(b)
  })

  it('differs for different line numbers', () => {
    const a = mutationId('src/foo.js', 10, '=== → !==')
    const b = mutationId('src/foo.js', 11, '=== → !==')
    expect(a).not.toBe(b)
  })

  it('differs for different mutation names', () => {
    const a = mutationId('src/foo.js', 10, '=== → !==')
    const b = mutationId('src/foo.js', 10, '+ → -')
    expect(a).not.toBe(b)
  })
})

describe('assignMutationIds', () => {
  it('adds id field to each mutation based on file, line, and name', () => {
    const mutations = [
      { line: 5, name: '=== → !==', original: 'a', mutated: 'b' },
      { line: 10, name: '+ → -', original: 'c', mutated: 'd' }
    ]
    assignMutationIds(mutations, 'src/foo.js')

    expect(mutations[0].id).toBe(mutationId('src/foo.js', 5, '=== → !=='))
    expect(mutations[1].id).toBe(mutationId('src/foo.js', 10, '+ → -'))
  })

  it('returns the mutations array for chaining', () => {
    const mutations = [{ line: 1, name: 'x' }]
    const result = assignMutationIds(mutations, 'file.js')
    expect(result).toBe(mutations)
  })
})

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

  it('skips file entries without mutants arrays', () => {
    const report = {
      files: {
        'a.js': { score: 100, killed: 3, total: 3 },
        'b.js': { mutants: [{ status: 'Killed' }] }
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

    const killed = output.mutants.find(mutant => mutant.status === 'Killed')
    expect(killed.mutatorName).toBe('=== → !==')
    expect(killed.location.start.line).toBe(5)
    expect(killed.killedBy).toEqual(['/tests/a.test.js'])

    const survived = output.mutants.find(mutant => mutant.status === 'Survived')
    expect(survived.mutatorName).toBe('+ → -')
    expect(survived.killedBy).toBeUndefined()
  })

  it('uses deterministic hash-based ID from mutationId', () => {
    const results = {
      killed: [{ line: 5, name: '=== → !==', original: 'a', mutated: 'b', killedBy: ['t.js'] }],
      survived: []
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    const relPath = output.path
    const expectedId = mutationId(relPath, 5, '=== → !==')
    expect(output.mutants[0].id).toBe(expectedId)
    expect(output.mutants[0].id).toMatch(/^[0-9a-f]{8}$/)
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

  it('includes only survived mutants when survivorsOnly is true', () => {
    const results = {
      killed: [
        { line: 5, name: '=== → !==', original: 'a === b', mutated: 'a !== b', killedBy: ['t.js'] }
      ],
      survived: [
        { line: 10, name: '+ → -', original: 'a + b', mutated: 'a - b' }
      ],
      timedOut: [
        { line: 15, name: '&& → ||', original: 'a && b', mutated: 'a || b' }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results, { survivorsOnly: true })
    expect(output.mutants).toHaveLength(1)
    expect(output.mutants[0].status).toBe('Survived')
    expect(output.mutants[0].mutatorName).toBe('+ → -')
  })

  it('includes all mutants when survivorsOnly is false', () => {
    const results = {
      killed: [{ line: 5, name: 'x', original: 'a', mutated: 'b', killedBy: ['t.js'] }],
      survived: [{ line: 10, name: 'y', original: 'c', mutated: 'd' }],
      timedOut: [{ line: 15, name: 'z', original: 'e', mutated: 'f' }]
    }

    const output = toJsonMutants('/project/src/foo.js', results, { survivorsOnly: false })
    expect(output.mutants).toHaveLength(3)
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
    const out = { log: vi.fn(), error: vi.fn() }

    writeReportFile('reports/mutation', 'reports/mutation/report.json', report, out)

    expect(mkdirSync).toHaveBeenCalledWith('reports/mutation', { recursive: true })
    expect(writeFileSync).toHaveBeenCalledWith(
      'reports/mutation/report.json',
      JSON.stringify(report, null, 2)
    )
    expect(out.log).toHaveBeenCalledWith('JSON report: reports/mutation/report.json')
  })

  it('does not throw when out is omitted', () => {
    const report = { schemaVersion: '1', files: {} }

    expect(() =>
      writeReportFile('reports', 'reports/report.json', report)
    ).not.toThrow()

    expect(writeFileSync).toHaveBeenCalled()
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
    const out = { log: vi.fn(), error: vi.fn() }

    const result = tryLoadJson('/tmp/missing.json', out)

    expect(result).toBeUndefined()
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('Warning'))
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('missing.json'))
  })

  it('returns undefined and calls out on invalid JSON', () => {
    readFileSync.mockReturnValue('not valid json {{{')
    const out = { log: vi.fn(), error: vi.fn() }

    const result = tryLoadJson('/tmp/bad.json', out)

    expect(result).toBeUndefined()
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('Warning'))
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

    const merged = combineReportData(['file1.json', 'file2.json'], { log: () => {}, error: () => {} })

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

    const out = { log: vi.fn(), error: vi.fn() }
    const merged = combineReportData(['file1.json', 'file2.json'], out)

    expect(merged.files['a.js'].mutants).toHaveLength(1)
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('Deduplicated'))
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

    const out = { log: vi.fn(), error: vi.fn() }
    combineReportData(['file1.json', 'file2.json'], out)

    expect(out.log).toHaveBeenCalledWith('  Deduplicated: 1 duplicate mutant(s) removed')
  })

  it('handles unreadable files gracefully', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const out = { log: vi.fn(), error: vi.fn() }

    const merged = combineReportData(['bad.json'], out)

    expect(Object.keys(merged.files)).toHaveLength(0)
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('Warning'))
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

    const merged = combineReportData(['file1.json', 'file2.json'], { log: () => {}, error: () => {} })

    expect(merged.files['a.js'].mutants).toHaveLength(2)
  })

  it('returns empty files for empty input', () => {
    const merged = combineReportData([], { log: () => {}, error: () => {} })
    expect(Object.keys(merged.files)).toHaveLength(0)
  })

  it('skips file entries without mutants arrays', () => {
    readFileSync.mockReturnValueOnce(JSON.stringify({
      files: {
        'a.js': { score: 100, killed: 3, total: 3 },
        'b.js': { mutants: [{ mutatorName: 'x', replacement: 'y', status: 'Killed', location: { start: { line: 1 } } }] }
      }
    }))

    const merged = combineReportData(['file.json'], { log: () => {}, error: () => {} })

    expect(merged.files['b.js'].mutants).toHaveLength(1)
    expect(merged.files['a.js'].mutants).toHaveLength(0)
  })
})

describe('buildStructuredReport', () => {
  it('returns report and stats from file results', () => {
    const { report, stats } = buildStructuredReport({
      'a.js': { mutants: [{ status: 'Killed', mutatorName: 'x', description: 'a → b' }] }
    })

    expect(stats.killed).toBe(1)
    expect(stats.survived).toBe(0)
    expect(stats.total).toBe(1)
    expect(report.killed).toBe(1)
    expect(report.files['a.js'].killed).toBe(1)
  })

  it('computes score as percentage of killed over total', () => {
    const { report, stats } = buildStructuredReport({
      'a.js': { mutants: [
        { status: 'Killed', mutatorName: 'x' },
        { status: 'Survived', mutatorName: 'y' }
      ]}
    })

    expect(stats.score).toBe(50)
    expect(report.score).toBe(50)
    expect(stats.total).toBe(2)
  })

  it('defaults score to 100% when no mutants exist', () => {
    const { report, stats } = buildStructuredReport({})

    expect(stats.score).toBe(100)
    expect(report.score).toBe(100)
  })

  it('includes deltas when provided', () => {
    const deltas = { fixes: [], regressions: [] }
    const { report } = buildStructuredReport({}, deltas)

    expect(report.deltas).toEqual(deltas)
  })

  it('omits deltas when not provided', () => {
    const { report } = buildStructuredReport({})

    expect(report).not.toHaveProperty('deltas')
  })

  it('collects survivors with stable mutation IDs', () => {
    const { report } = buildStructuredReport({
      'a.js': { mutants: [{ status: 'Survived', mutatorName: 'x', location: { start: { line: 5 } } }] }
    })

    expect(report.survivors).toHaveLength(1)
    expect(report.survivors[0].id).toBe(mutationId('a.js', 5, 'x'))
  })

  it('counts timeout mutants as killed and tracks timedOut separately', () => {
    const { stats } = buildStructuredReport({
      'a.js': { mutants: [{ status: 'Timeout', mutatorName: 'x' }] }
    })

    expect(stats.killed).toBe(1)
    expect(stats.timedOut).toBe(1)
  })

  it('per-file score defaults to 100% when mutants array is empty', () => {
    const { report } = buildStructuredReport({
      'a.js': { mutants: [] }
    })

    expect(report.files['a.js'].score).toBe(100)
  })

  it('handles file entries without mutants arrays (old structured format)', () => {
    const { report, stats } = buildStructuredReport({
      'a.js': { score: 66.7, killed: 2, total: 3 },
      'b.js': { mutants: [{ status: 'Killed', mutatorName: 'x' }] }
    })

    expect(stats.killed).toBe(3)
    expect(report.files['a.js']).toEqual({ score: 66.7, killed: 2, total: 3 })
    expect(report.files['b.js'].killed).toBe(1)
    expect(report.files['b.js'].mutants).toBeDefined()
    // Summary-only entry should NOT have mutants key
    expect(report.files['a.js']).not.toHaveProperty('mutants')
  })

  it('defaults missing summary stats to zero/100 for entries without mutants', () => {
    const { report, stats } = buildStructuredReport({
      'a.js': {}
    })

    expect(stats.killed).toBe(0)
    expect(report.files['a.js']).toEqual({ score: 100, killed: 0, total: 0 })
  })

  it('is pure — does not perform I/O', () => {
    vi.clearAllMocks()
    buildStructuredReport({ 'a.js': { mutants: [{ status: 'Killed', mutatorName: 'x' }] } })

    expect(writeFileSync).not.toHaveBeenCalled()
    expect(mkdirSync).not.toHaveBeenCalled()
  })
})

describe('writeStructuredReportFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('counts killed mutants and writes report', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Killed', mutatorName: 'x', description: 'a → b' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.killed).toBe(1)
    expect(written.survived).toBe(0)
  })

  it('counts survived mutants and includes them in survivors', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', mutatorName: 'x', description: 'a → b' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survived).toBe(1)
    expect(written.survivors).toHaveLength(1)
  })

  it('includes stable mutation ID in each survivor', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', mutatorName: 'x', location: { start: { line: 5 } } }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].id).toBe(mutationId('a.js', 5, 'x'))
    expect(written.survivors[0].id).toMatch(/^[0-9a-f]{8}$/)
  })

  it('counts timeout mutants as killed', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Timeout', mutatorName: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.killed).toBe(1)
    expect(written.timedOut).toBe(1)
  })

  it('handles survived mutants without coveredBy', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', mutatorName: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0]).not.toHaveProperty('coveredBy')
  })

  it('includes coveredBy when present on survived mutants', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', mutatorName: 'x', coveredBy: ['t.js'] }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].coveredBy).toEqual(['t.js'])
  })

  it('handles mutants without description', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', mutatorName: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].original).toBe('')
    expect(written.survivors[0].mutated).toBe('')
  })

  it('handles description without arrow separator', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', mutatorName: 'x', description: 'noarrow' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].original).toBe('noarrow')
    expect(written.survivors[0].mutated).toBe('')
  })

  it('defaults score to 100% when no mutants exist', () => {
    writeStructuredReportFile('out.json', {})

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.score).toBe(100)
  })

  it('includes deltas when provided', () => {
    const deltas = { fixes: [], regressions: [] }
    writeStructuredReportFile('out.json', {}, deltas)

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.deltas).toEqual(deltas)
  })

  it('omits deltas when not provided', () => {
    writeStructuredReportFile('out.json', {})

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written).not.toHaveProperty('deltas')
  })

  it('includes extra fields in written report when provided', () => {
    const extra = {
      sourceHashes: { 'a.js': 'abc123' },
      testHashes: { 't.js': 'def456' }
    }
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Killed', mutatorName: 'x' }] }
    }, undefined, extra)

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.sourceHashes).toEqual({ 'a.js': 'abc123' })
    expect(written.testHashes).toEqual({ 't.js': 'def456' })
    expect(written.killed).toBe(1)
  })

  it('omits extra fields when not provided', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Killed', mutatorName: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written).not.toHaveProperty('sourceHashes')
    expect(written).not.toHaveProperty('testHashes')
  })

  it('handles mutants without location', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', mutatorName: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].line).toBe(0)
  })

  it('skips mutants with unrecognized status (neither killed nor alive)', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'CompileError', mutatorName: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.killed).toBe(0)
    expect(written.survived).toBe(0)
    expect(written.survivors).toHaveLength(0)
  })

  it('defaults file score to 100% when mutants array is empty', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.files['a.js'].score).toBe(100)
  })
})

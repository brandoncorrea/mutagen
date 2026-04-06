import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mutantKey, countStatuses, toJsonMutants, printRunReport, printSummary, combineReportData, diffReports } from '../../cli/report.js'
import { readFileSync } from 'node:fs'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn()
}))

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

  it('produces a relative path', () => {
    // toJsonMutants uses relative(process.cwd(), sourceFile)
    const output = toJsonMutants(process.cwd() + '/src/foo.js', { killed: [], survived: [] })
    expect(output.path).toBe('src/foo.js')
  })
})

describe('printSummary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    console.log.mockRestore()
  })

  it('prints file count, statuses, and mutation score', () => {
    const merged = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] },
        'b.js': { mutants: [{ status: 'Killed' }] }
      }
    }
    const counts = { killed: 2, survived: 1, noCoverage: 0, timeout: 0 }

    printSummary(merged, counts, '/tmp/report.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('Files:    2')
    expect(output).toContain('Killed:   2')
    expect(output).toContain('Survived: 1')
    expect(output).toContain('66.7%')
    expect(output).toContain('/tmp/report.json')
  })

  it('shows 100.0% when no mutants', () => {
    const counts = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 }
    printSummary({ files: {} }, counts, null)
    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('100.0%')
    expect(output).not.toContain('Report:')
  })

  it('includes timeout in score calculation', () => {
    const merged = {
      files: { 'a.js': { mutants: [{ status: 'Timeout' }, { status: 'Survived' }] } }
    }
    const counts = { killed: 0, survived: 1, noCoverage: 0, timeout: 1 }

    printSummary(merged, counts, null)

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('50.0%')
  })
})

describe('combineReportData', () => {
  beforeEach(() => {
    readFileSync.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    console.log.mockRestore()
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

    const merged = combineReportData(['file1.json', 'file2.json'])

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

    const merged = combineReportData(['file1.json', 'file2.json'])

    expect(merged.files['a.js'].mutants).toHaveLength(1)
    expect(console.log.mock.calls.some(c => c[0].includes('Deduplicated'))).toBe(true)
  })

  it('handles unreadable files gracefully', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })

    const merged = combineReportData(['bad.json'])

    expect(Object.keys(merged.files)).toHaveLength(0)
    expect(console.log.mock.calls.some(c => c[0].includes('Warning'))).toBe(true)
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

    const merged = combineReportData(['file1.json', 'file2.json'])

    expect(merged.files['a.js'].mutants).toHaveLength(2)
  })

  it('returns empty files for empty input', () => {
    const merged = combineReportData([])
    expect(Object.keys(merged.files)).toHaveLength(0)
  })
})

describe('diffReports', () => {
  beforeEach(() => {
    readFileSync.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    console.log.mockRestore()
  })

  function makeReport(files) {
    return {
      files,
      schemaVersion: '1',
      thresholds: { high: 80, low: 60 }
    }
  }

  function makeMutant(id, mutatorName, status, line = 1) {
    return {
      id,
      mutatorName,
      status,
      location: { start: { line }, column: 0 },
      replacement: ''
    }
  }

  it('detects newly killed mutants (Survived → Killed)', () => {
    const before = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived', 5)] }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    const result = diffReports('before.json', 'after.json')

    expect(result.newlyKilled).toBe(1)
    expect(result.regressions).toBe(0)
    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('NEWLY KILLED')
  })

  it('detects regressions (Killed → Survived)', () => {
    const before = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived', 5)] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    const result = diffReports('before.json', 'after.json')

    expect(result.regressions).toBe(1)
    expect(result.newlyKilled).toBe(0)
    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('REGRESSIONS')
  })

  it('detects new mutants (present only in after)', () => {
    const before = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] }
    })
    const after = makeReport({
      'a.js': {
        mutants: [
          makeMutant('m1', 'EqualityOperator', 'Killed', 5),
          makeMutant('m2', 'ArithmeticOperator', 'Survived', 10)
        ]
      }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    const result = diffReports('before.json', 'after.json')

    expect(result.newMutants).toBe(1)
    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('NEW MUTANTS')
  })

  it('detects removed mutants (present only in before)', () => {
    const before = makeReport({
      'a.js': {
        mutants: [
          makeMutant('m1', 'EqualityOperator', 'Killed', 5),
          makeMutant('m2', 'ArithmeticOperator', 'Survived', 10)
        ]
      }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    const result = diffReports('before.json', 'after.json')

    expect(result.removedMutants).toBe(1)
    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('REMOVED MUTANTS')
  })

  it('prints overall score delta', () => {
    const before = makeReport({
      'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Survived')
      ] }
    })
    const after = makeReport({
      'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Killed')
      ] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('50.0%')
    expect(output).toContain('100.0%')
    expect(output).toContain('+50.0%')
  })

  it('shows per-file score changes', () => {
    const before = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Survived')] }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('PER-FILE CHANGES')
    expect(output).toContain('a.js')
  })

  it('reports identical reports with no changes', () => {
    const report = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(report))
      .mockReturnValueOnce(JSON.stringify(report))

    const result = diffReports('before.json', 'after.json')

    expect(result.newlyKilled).toBe(0)
    expect(result.regressions).toBe(0)
    expect(result.newMutants).toBe(0)
    expect(result.removedMutants).toBe(0)
  })

  it('handles new files in after report', () => {
    const before = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] },
      'b.js': { mutants: [makeMutant('m2', 'y', 'Survived')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('PER-FILE CHANGES')
    expect(output).toContain('b.js')
    expect(output).toContain('NEW')
  })

  it('handles removed files in after report', () => {
    const before = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] },
      'b.js': { mutants: [makeMutant('m2', 'y', 'Survived')] }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('PER-FILE CHANGES')
    expect(output).toContain('REMOVED')
  })

  it('treats NoCoverage as alive for regression detection', () => {
    const before = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'NoCoverage')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    const result = diffReports('before.json', 'after.json')

    expect(result.regressions).toBe(1)
  })

  it('falls back to mutantKey when mutant has no id', () => {
    const mutantNoId = {
      mutatorName: 'EqualityOperator',
      status: 'Survived',
      location: { start: { line: 5 } },
      replacement: '!=='
    }
    const before = makeReport({
      'a.js': { mutants: [mutantNoId] }
    })
    const after = makeReport({
      'a.js': { mutants: [{ ...mutantNoId, status: 'Killed' }] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    const result = diffReports('before.json', 'after.json')

    expect(result.newlyKilled).toBe(1)
  })
})

describe('printRunReport', () => {
  it('prints mutation score for all-killed results', () => {
    const lines = []
    const log = (msg) => lines.push(msg)
    const mutations = [{ line: 1, name: 'test' }]
    const results = { killed: [{ line: 1, name: 'test' }], survived: [] }

    printRunReport(mutations, results, log)

    const output = lines.join('\n')
    expect(output).toContain('100.0%')
    expect(output).toContain('ALL mutations killed')
  })

  it('prints surviving mutations when some survive', () => {
    const lines = []
    const log = (msg) => lines.push(msg)
    const mutations = [
      { line: 1, name: 'a' },
      { line: 2, name: 'b' }
    ]
    const results = {
      killed: [{ line: 1, name: 'a' }],
      survived: [{ line: 2, name: 'b', original: 'x + y', mutated: 'x - y' }]
    }

    printRunReport(mutations, results, log)

    const output = lines.join('\n')
    expect(output).toContain('50.0%')
    expect(output).toContain('SURVIVING MUTATIONS')
    expect(output).toContain('x + y')
    expect(output).toContain('x - y')
  })

  it('reports 100% for zero mutations', () => {
    const lines = []
    const log = (msg) => lines.push(msg)
    printRunReport([], { killed: [], survived: [] }, log)
    expect(lines.join('\n')).toContain('100.0%')
  })
})

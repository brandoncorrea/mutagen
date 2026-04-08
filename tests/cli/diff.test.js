import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn()
}))

import { combineReportData, diffReports } from '../../cli/diff.js'

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

  it('formats per-file delta to one decimal place', () => {
    const before = makeReport({
      'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Survived'),
        makeMutant('m3', 'z', 'Survived')
      ] }
    })
    const after = makeReport({
      'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Killed'),
        makeMutant('m3', 'z', 'Survived')
      ] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('+33.3%')
    expect(output).not.toMatch(/\+33\.33/)
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

  it('scores 100% when both reports have zero mutations', () => {
    const before = makeReport({ 'a.js': { mutants: [] } })
    const after = makeReport({ 'a.js': { mutants: [] } })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('100.0%')
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

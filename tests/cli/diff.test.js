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

  it('routes warnings through injected out', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const out = vi.fn()

    combineReportData(['bad.json'], out)

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

  it('prints new mutants section when all new mutants are killed', () => {
    const before = makeReport({
      'a.js': { mutants: [] }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed', 5)] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    const result = diffReports('before.json', 'after.json')

    expect(result.newMutants).toBe(1)
    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('NEW MUTANTS')
    // No "SURVIVED" lines since all new mutants are killed
    expect(output).not.toContain('SURVIVED')
  })

  it('sorts REMOVED files after positive-delta files via || 0 fallback', () => {
    // removed.js enters the Set from beforeScores (first in spread), so it
    // appears BEFORE changed.js. Without || 0, the sort comparator produces
    // NaN and V8 preserves input order → REMOVED first (wrong).
    // With || 0, undefined becomes 0, arithmetic works, sort moves REMOVED after +delta.
    const before = makeReport({
      'removed.js': { mutants: [makeMutant('m1', 'x', 'Killed')] },
      'changed.js': { mutants: [makeMutant('m2', 'y', 'Survived')] }
    })
    const after = makeReport({
      'changed.js': { mutants: [makeMutant('m2', 'y', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    const perFileSection = output.slice(output.indexOf('PER-FILE CHANGES'))
    // changed.js (+100% delta) must sort before removed.js (no delta → 0)
    expect(perFileSection.indexOf('changed.js')).toBeLessThan(perFileSection.indexOf('removed.js'))
  })

  it('sorts per-file deltas descending, using 0 for NEW files', () => {
    // 3 files: c.js improved +100%, a.js improved +50%, b.js is NEW (no delta)
    // Sort descending by delta: c.js (+100), a.js (+50), b.js (NEW → 0)
    // Without || 0, b.js delta is undefined → NaN → sort is unstable
    const before = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Survived'), makeMutant('m2', 'y', 'Survived')] },
      'c.js': { mutants: [makeMutant('m4', 'w', 'Survived')] }
    })
    const after = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed'), makeMutant('m2', 'y', 'Survived')] },
      'b.js': { mutants: [makeMutant('m3', 'z', 'Killed')] },
      'c.js': { mutants: [makeMutant('m4', 'w', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    const perFileSection = output.slice(output.indexOf('PER-FILE CHANGES'))
    const cIdx = perFileSection.indexOf('c.js')
    const aIdx = perFileSection.indexOf('a.js')
    const bIdx = perFileSection.indexOf('b.js')
    // c.js (+100%) before a.js (+50%) before b.js (NEW, delta 0)
    expect(cIdx).toBeLessThan(aIdx)
    expect(aIdx).toBeLessThan(bIdx)
  })

  it('sorts NEW files before negative-delta files (delta: 0 vs undefined)', () => {
    // worsened.js enters Set first (from beforeScores), new.js second (from afterScores).
    // Sort descending: new.js (delta:0) should appear before worsened.js (delta:-50).
    // Without delta:0 on NEW, undefined - (-50) = NaN → no swap → worsened stays first (wrong).
    const before = makeReport({
      'worsened.js': { mutants: [makeMutant('m1', 'x', 'Killed'), makeMutant('m2', 'y', 'Killed')] }
    })
    const after = makeReport({
      'worsened.js': { mutants: [makeMutant('m1', 'x', 'Survived'), makeMutant('m2', 'y', 'Killed')] },
      'new.js': { mutants: [makeMutant('m3', 'z', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    const perFileSection = output.slice(output.indexOf('PER-FILE CHANGES'))
    // new.js (delta: 0) should sort before worsened.js (delta: -50) in descending order
    expect(perFileSection.indexOf('new.js')).toBeLessThan(perFileSection.indexOf('worsened.js'))
  })

  it('skips per-file section when no file scores changed', () => {
    const report = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(report))
      .mockReturnValueOnce(JSON.stringify(report))

    diffReports('before.json', 'after.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).not.toContain('PER-FILE CHANGES')
  })

  it('handles mutants with no location object', () => {
    const mutant = { id: 'm1', mutatorName: 'x', status: 'Killed', replacement: 'y' }
    const before = makeReport({
      'a.js': { mutants: [mutant] }
    })
    const after = makeReport({
      'a.js': { mutants: [{ ...mutant, status: 'Survived' }] }
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

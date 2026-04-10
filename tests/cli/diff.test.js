import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn()
}))

import { diffReports } from '../../cli/diff.js'

describe('diffReports', () => {
  let lines, out

  beforeEach(() => {
    readFileSync.mockReset()
    lines = []
    out = msg => lines.push(msg)
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

  function output() { return lines.join('\n') }

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

    const result = diffReports('before.json', 'after.json', out)

    expect(result.newlyKilled).toBe(1)
    expect(result.regressions).toBe(0)
    expect(output()).toContain('NEWLY KILLED')
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

    const result = diffReports('before.json', 'after.json', out)

    expect(result.regressions).toBe(1)
    expect(result.newlyKilled).toBe(0)
    expect(output()).toContain('REGRESSIONS')
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

    const result = diffReports('before.json', 'after.json', out)

    expect(result.newMutants).toBe(1)
    expect(output()).toContain('NEW MUTANTS')
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

    const result = diffReports('before.json', 'after.json', out)

    expect(result.removedMutants).toBe(1)
    expect(output()).toContain('REMOVED MUTANTS')
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

    diffReports('before.json', 'after.json', out)

    expect(output()).toContain('50.0%')
    expect(output()).toContain('100.0%')
    expect(output()).toContain('+50.0%')
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

    diffReports('before.json', 'after.json', out)

    expect(output()).toContain('PER-FILE CHANGES')
    expect(output()).toContain('a.js')
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

    diffReports('before.json', 'after.json', out)

    expect(output()).toContain('+33.3%')
    expect(output()).not.toMatch(/\+33\.33/)
  })

  it('reports identical reports with no changes', () => {
    const report = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(report))
      .mockReturnValueOnce(JSON.stringify(report))

    const result = diffReports('before.json', 'after.json', out)

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

    diffReports('before.json', 'after.json', out)

    expect(output()).toContain('PER-FILE CHANGES')
    expect(output()).toContain('b.js')
    expect(output()).toContain('NEW')
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

    diffReports('before.json', 'after.json', out)

    expect(output()).toContain('PER-FILE CHANGES')
    expect(output()).toContain('REMOVED')
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

    const result = diffReports('before.json', 'after.json', out)

    expect(result.regressions).toBe(1)
  })

  it('scores 100% when both reports have zero mutations', () => {
    const before = makeReport({ 'a.js': { mutants: [] } })
    const after = makeReport({ 'a.js': { mutants: [] } })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(before))
      .mockReturnValueOnce(JSON.stringify(after))

    diffReports('before.json', 'after.json', out)

    expect(output()).toContain('100.0%')
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

    const result = diffReports('before.json', 'after.json', out)

    expect(result.newMutants).toBe(1)
    expect(output()).toContain('NEW MUTANTS')
    // No "SURVIVED" lines since all new mutants are killed
    expect(output()).not.toContain('SURVIVED')
  })

  it('sorts REMOVED files after positive-delta files via || 0 fallback', () => {
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

    diffReports('before.json', 'after.json', out)

    const perFileSection = output().slice(output().indexOf('PER-FILE CHANGES'))
    expect(perFileSection.indexOf('changed.js')).toBeLessThan(perFileSection.indexOf('removed.js'))
  })

  it('sorts per-file deltas descending, using 0 for NEW files', () => {
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

    diffReports('before.json', 'after.json', out)

    const perFileSection = output().slice(output().indexOf('PER-FILE CHANGES'))
    const cIdx = perFileSection.indexOf('c.js')
    const aIdx = perFileSection.indexOf('a.js')
    const bIdx = perFileSection.indexOf('b.js')
    expect(cIdx).toBeLessThan(aIdx)
    expect(aIdx).toBeLessThan(bIdx)
  })

  it('sorts NEW files before negative-delta files (delta: 0 vs undefined)', () => {
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

    diffReports('before.json', 'after.json', out)

    const perFileSection = output().slice(output().indexOf('PER-FILE CHANGES'))
    expect(perFileSection.indexOf('new.js')).toBeLessThan(perFileSection.indexOf('worsened.js'))
  })

  it('skips per-file section when no file scores changed', () => {
    const report = makeReport({
      'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] }
    })
    readFileSync
      .mockReturnValueOnce(JSON.stringify(report))
      .mockReturnValueOnce(JSON.stringify(report))

    diffReports('before.json', 'after.json', out)

    expect(output()).not.toContain('PER-FILE CHANGES')
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

    const result = diffReports('before.json', 'after.json', out)

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

    const result = diffReports('before.json', 'after.json', out)

    expect(result.newlyKilled).toBe(1)
  })
})

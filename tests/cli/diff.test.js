import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn()
}))

import { diffReports } from '../../src/cli/diff.js'

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

  function runDiff(beforeFiles, afterFiles) {
    readFileSync
      .mockReturnValueOnce(JSON.stringify(makeReport(beforeFiles)))
      .mockReturnValueOnce(JSON.stringify(makeReport(afterFiles)))
    return diffReports('before.json', 'after.json', out)
  }

  it('detects newly killed mutants (Survived → Killed)', () => {
    const result = runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived', 5)] } },
      { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] } }
    )

    expect(result.newlyKilled).toBe(1)
    expect(result.regressions).toBe(0)
    expect(output()).toContain('NEWLY KILLED')
  })

  it('detects regressions (Killed → Survived)', () => {
    const result = runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] } },
      { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived', 5)] } }
    )

    expect(result.regressions).toBe(1)
    expect(result.newlyKilled).toBe(0)
    expect(output()).toContain('REGRESSIONS')
  })

  it('detects new mutants (present only in after)', () => {
    const result = runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] } },
      { 'a.js': {
        mutants: [
          makeMutant('m1', 'EqualityOperator', 'Killed', 5),
          makeMutant('m2', 'ArithmeticOperator', 'Survived', 10)
        ]
      } }
    )

    expect(result.newMutants).toBe(1)
    expect(output()).toContain('NEW MUTANTS')
  })

  it('detects removed mutants (present only in before)', () => {
    const result = runDiff(
      { 'a.js': {
        mutants: [
          makeMutant('m1', 'EqualityOperator', 'Killed', 5),
          makeMutant('m2', 'ArithmeticOperator', 'Survived', 10)
        ]
      } },
      { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] } }
    )

    expect(result.removedMutants).toBe(1)
    expect(output()).toContain('REMOVED MUTANTS')
  })

  it('prints overall score delta', () => {
    runDiff(
      { 'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Survived')
      ] } },
      { 'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Killed')
      ] } }
    )

    expect(output()).toContain('50.0%')
    expect(output()).toContain('100.0%')
    expect(output()).toContain('+50.0%')
  })

  it('shows per-file score changes', () => {
    runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Survived')] } },
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
    )

    expect(output()).toContain('PER-FILE CHANGES')
    expect(output()).toContain('a.js')
  })

  it('formats per-file delta to one decimal place', () => {
    runDiff(
      { 'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Survived'),
        makeMutant('m3', 'z', 'Survived')
      ] } },
      { 'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Killed'),
        makeMutant('m3', 'z', 'Survived')
      ] } }
    )

    expect(output()).toContain('+33.3%')
    expect(output()).not.toMatch(/\+33\.33/)
  })

  it('reports identical reports with no changes', () => {
    const files = { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
    const result = runDiff(files, files)

    expect(result.newlyKilled).toBe(0)
    expect(result.regressions).toBe(0)
    expect(result.newMutants).toBe(0)
    expect(result.removedMutants).toBe(0)
  })

  it('handles new files in after report', () => {
    runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } },
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] },
        'b.js': { mutants: [makeMutant('m2', 'y', 'Survived')] } }
    )

    expect(output()).toContain('PER-FILE CHANGES')
    expect(output()).toContain('b.js')
    expect(output()).toContain('NEW')
  })

  it('handles removed files in after report', () => {
    runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] },
        'b.js': { mutants: [makeMutant('m2', 'y', 'Survived')] } },
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
    )

    expect(output()).toContain('PER-FILE CHANGES')
    expect(output()).toContain('REMOVED')
  })

  it('treats NoCoverage as alive for regression detection', () => {
    const result = runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } },
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'NoCoverage')] } }
    )

    expect(result.regressions).toBe(1)
  })

  it('scores 100% when both reports have zero mutations', () => {
    runDiff(
      { 'a.js': { mutants: [] } },
      { 'a.js': { mutants: [] } }
    )

    expect(output()).toContain('100.0%')
  })

  it('prints new mutants section when all new mutants are killed', () => {
    const result = runDiff(
      { 'a.js': { mutants: [] } },
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed', 5)] } }
    )

    expect(result.newMutants).toBe(1)
    expect(output()).toContain('NEW MUTANTS')
    expect(output()).not.toContain('SURVIVED')
  })

  it('sorts REMOVED files after positive-delta files via || 0 fallback', () => {
    runDiff(
      { 'removed.js': { mutants: [makeMutant('m1', 'x', 'Killed')] },
        'changed.js': { mutants: [makeMutant('m2', 'y', 'Survived')] } },
      { 'changed.js': { mutants: [makeMutant('m2', 'y', 'Killed')] } }
    )

    const perFileSection = output().slice(output().indexOf('PER-FILE CHANGES'))
    expect(perFileSection.indexOf('changed.js')).toBeLessThan(perFileSection.indexOf('removed.js'))
  })

  it('sorts per-file deltas descending, using 0 for NEW files', () => {
    runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Survived'), makeMutant('m2', 'y', 'Survived')] },
        'c.js': { mutants: [makeMutant('m4', 'w', 'Survived')] } },
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed'), makeMutant('m2', 'y', 'Survived')] },
        'b.js': { mutants: [makeMutant('m3', 'z', 'Killed')] },
        'c.js': { mutants: [makeMutant('m4', 'w', 'Killed')] } }
    )

    const perFileSection = output().slice(output().indexOf('PER-FILE CHANGES'))
    const cIdx = perFileSection.indexOf('c.js')
    const aIdx = perFileSection.indexOf('a.js')
    const bIdx = perFileSection.indexOf('b.js')
    expect(cIdx).toBeLessThan(aIdx)
    expect(aIdx).toBeLessThan(bIdx)
  })

  it('sorts NEW files before negative-delta files (delta: 0 vs undefined)', () => {
    runDiff(
      { 'worsened.js': { mutants: [makeMutant('m1', 'x', 'Killed'), makeMutant('m2', 'y', 'Killed')] } },
      { 'worsened.js': { mutants: [makeMutant('m1', 'x', 'Survived'), makeMutant('m2', 'y', 'Killed')] },
        'new.js': { mutants: [makeMutant('m3', 'z', 'Killed')] } }
    )

    const perFileSection = output().slice(output().indexOf('PER-FILE CHANGES'))
    expect(perFileSection.indexOf('new.js')).toBeLessThan(perFileSection.indexOf('worsened.js'))
  })

  it('skips per-file section when no file scores changed', () => {
    const files = { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
    runDiff(files, files)

    expect(output()).not.toContain('PER-FILE CHANGES')
  })

  it('handles mutants with no location object', () => {
    const mutant = { id: 'm1', mutatorName: 'x', status: 'Killed', replacement: 'y' }
    const result = runDiff(
      { 'a.js': { mutants: [mutant] } },
      { 'a.js': { mutants: [{ ...mutant, status: 'Survived' }] } }
    )

    expect(result.regressions).toBe(1)
  })

  it('returns null and warns when a report file is unreadable', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })

    const result = diffReports('missing.json', 'also-missing.json', out)

    expect(result).toBeFalsy()
    expect(output()).toContain('Warning')
  })

  it('prints negative score delta when score decreases', () => {
    runDiff(
      { 'a.js': { mutants: [
        makeMutant('m1', 'a', 'Killed'),
        makeMutant('m2', 'b', 'Killed'),
        makeMutant('m3', 'c', 'Killed'),
        makeMutant('m4', 'd', 'Killed'),
        makeMutant('m5', 'e', 'Survived')
      ] } },
      { 'a.js': { mutants: [
        makeMutant('m1', 'a', 'Killed'),
        makeMutant('m2', 'b', 'Killed'),
        makeMutant('m3', 'c', 'Killed'),
        makeMutant('m4', 'd', 'Survived'),
        makeMutant('m5', 'e', 'Survived')
      ] } }
    )

    expect(output()).toContain('Overall: 80.0% → 60.0% (-20.0%)')
  })

  it('prints correct killed count among new mutants', () => {
    runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } },
      { 'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Killed', 10),
        makeMutant('m3', 'z', 'Survived', 20)
      ] } }
    )

    expect(output()).toContain('NEW MUTANTS: 2 (1 killed, 1 survived)')
  })

  it('hides REMOVED MUTANTS section when no mutants were removed', () => {
    runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Survived')] } },
      { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
    )

    expect(output()).not.toContain('REMOVED MUTANTS')
  })

  it('falls back to mutantKey when mutant has no id', () => {
    const mutantNoId = {
      mutatorName: 'EqualityOperator',
      status: 'Survived',
      location: { start: { line: 5 } },
      replacement: '!=='
    }
    const result = runDiff(
      { 'a.js': { mutants: [mutantNoId] } },
      { 'a.js': { mutants: [{ ...mutantNoId, status: 'Killed' }] } }
    )

    expect(result.newlyKilled).toBe(1)
  })

  it('returns undefined when only before file is unreadable', () => {
    readFileSync
      .mockImplementationOnce(() => { throw new Error('ENOENT') })
      .mockReturnValueOnce(JSON.stringify(makeReport({ 'a.js': { mutants: [] } })))

    const result = diffReports('missing.json', 'after.json', out)

    expect(result).toBeUndefined()
  })

  it('returns undefined when only after file is unreadable', () => {
    readFileSync
      .mockReturnValueOnce(JSON.stringify(makeReport({ 'a.js': { mutants: [] } })))
      .mockImplementationOnce(() => { throw new Error('ENOENT') })

    const result = diffReports('before.json', 'missing.json', out)

    expect(result).toBeUndefined()
  })

  it('tracks mutants separately by id even when computed keys collide', () => {
    const m1 = makeMutant('id-alpha', 'EqualityOperator', 'Survived', 5)
    const m2 = makeMutant('id-beta', 'EqualityOperator', 'Survived', 5)

    const result = runDiff(
      { 'a.js': { mutants: [m1, m2] } },
      { 'a.js': { mutants: [
        { ...m1, status: 'Killed' },
        { ...m2, status: 'Killed' }
      ] } }
    )

    expect(result.newlyKilled).toBe(2)
  })

  it('reports correct line number for newly killed mutant', () => {
    const result = runDiff(
      { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived', 42)] } },
      { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 42)] } }
    )

    expect(result.newlyKilled).toBe(1)
    expect(output()).toContain('a.js:42')
  })

  it('uses line 0 for mutant with no location', () => {
    const noLoc = { id: 'no-loc', mutatorName: 'X', status: 'Survived', replacement: '' }

    const result = runDiff(
      { 'a.js': { mutants: [noLoc] } },
      { 'a.js': { mutants: [{ ...noLoc, status: 'Killed' }] } }
    )

    expect(result.newlyKilled).toBe(1)
    expect(output()).toContain('a.js:0')
  })

  it('handles mutant with location but missing start', () => {
    const noStart = { id: 'no-start', mutatorName: 'X', status: 'Survived', location: {}, replacement: '' }

    const result = runDiff(
      { 'a.js': { mutants: [noStart] } },
      { 'a.js': { mutants: [{ ...noStart, status: 'Killed' }] } }
    )

    expect(result.newlyKilled).toBe(1)
    expect(output()).toContain('a.js:0')
  })

  it('computes exact per-file scores from mutant counts', () => {
    runDiff(
      { 'a.js': { mutants: [
        makeMutant('m1', 'x', 'Survived'),
        makeMutant('m2', 'y', 'Survived')
      ] } },
      { 'a.js': { mutants: [
        makeMutant('m1', 'x', 'Killed'),
        makeMutant('m2', 'y', 'Killed')
      ] } }
    )

    const perFile = output().slice(output().indexOf('PER-FILE'))
    expect(perFile).toContain('0.0% → 100.0%')
  })

  describe('JSON output mode', () => {
    function runDiffJson(beforeFiles, afterFiles) {
      readFileSync
        .mockReturnValueOnce(JSON.stringify(makeReport(beforeFiles)))
        .mockReturnValueOnce(JSON.stringify(makeReport(afterFiles)))
      return diffReports('before.json', 'after.json', out, true)
    }

    function parsedOutput() {
      return JSON.parse(lines[0])
    }

    it('outputs valid JSON instead of text report', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } },
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
      )

      expect(lines).toHaveLength(1)
      expect(() => JSON.parse(lines[0])).not.toThrow()
    })

    it('includes beforeScore, afterScore, and delta', () => {
      runDiffJson(
        { 'a.js': { mutants: [
          makeMutant('m1', 'x', 'Killed'),
          makeMutant('m2', 'y', 'Survived')
        ] } },
        { 'a.js': { mutants: [
          makeMutant('m1', 'x', 'Killed'),
          makeMutant('m2', 'y', 'Killed')
        ] } }
      )

      const json = parsedOutput()
      expect(json.beforeScore).toBe(50)
      expect(json.afterScore).toBe(100)
      expect(json.delta).toBe(50)
    })

    it('includes newlyKilled mutants with file, line, and mutatorName', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived', 5)] } },
        { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 5)] } }
      )

      const json = parsedOutput()
      expect(json.newlyKilled).toHaveLength(1)
      expect(json.newlyKilled[0]).toMatchObject({
        file: 'a.js',
        line: 5,
        mutatorName: 'EqualityOperator'
      })
    })

    it('includes regressions with file, line, and mutatorName', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed', 7)] } },
        { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived', 7)] } }
      )

      const json = parsedOutput()
      expect(json.regressions).toHaveLength(1)
      expect(json.regressions[0]).toMatchObject({
        file: 'a.js',
        line: 7,
        mutatorName: 'EqualityOperator'
      })
    })

    it('includes newMutants with file, line, mutatorName, and status', () => {
      runDiffJson(
        { 'a.js': { mutants: [] } },
        { 'a.js': { mutants: [makeMutant('m1', 'ArithmeticOperator', 'Survived', 3)] } }
      )

      const json = parsedOutput()
      expect(json.newMutants).toHaveLength(1)
      expect(json.newMutants[0]).toMatchObject({
        file: 'a.js',
        line: 3,
        mutatorName: 'ArithmeticOperator',
        status: 'Survived'
      })
    })

    it('includes removedMutants with file, line, mutatorName, and status', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'LogicalOperator', 'Killed', 9)] } },
        { 'a.js': { mutants: [] } }
      )

      const json = parsedOutput()
      expect(json.removedMutants).toHaveLength(1)
      expect(json.removedMutants[0]).toMatchObject({
        file: 'a.js',
        line: 9,
        mutatorName: 'LogicalOperator',
        status: 'Killed'
      })
    })

    it('includes fileDeltas keyed by path', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Survived')] } },
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
      )

      const json = parsedOutput()
      expect(json.fileDeltas).toHaveProperty('a.js')
      expect(json.fileDeltas['a.js']).toMatchObject({
        before: 0,
        after: 100,
        delta: 100
      })
    })

    it('omits files with no score change from fileDeltas', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } },
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
      )

      const json = parsedOutput()
      expect(json.fileDeltas).toEqual({})
    })

    it('returns the same counts object as text mode', () => {
      const result = runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Survived', 5)] } },
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed', 5)] } }
      )

      expect(result.newlyKilled).toBe(1)
      expect(result.regressions).toBe(0)
      expect(result.newMutants).toBe(0)
      expect(result.removedMutants).toBe(0)
    })

    it('includes new files in fileDeltas with null before', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } },
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] },
          'b.js': { mutants: [makeMutant('m2', 'y', 'Survived')] } }
      )

      const json = parsedOutput()
      expect(json.fileDeltas['b.js']).toMatchObject({
        before: null,
        after: 0,
        delta: 0
      })
    })

    it('includes removed files in fileDeltas with null after', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] },
          'b.js': { mutants: [makeMutant('m2', 'y', 'Killed')] } },
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
      )

      const json = parsedOutput()
      expect(json.fileDeltas['b.js']).toMatchObject({
        before: 100,
        after: null,
        delta: 0
      })
    })

    it('does not print text report headers in JSON mode', () => {
      runDiffJson(
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } },
        { 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } }
      )

      expect(output()).not.toContain('MUTATION DIFF')
    })
  })

  describe('malformed reports', () => {
    it('returns undefined when report has no files key', () => {
      readFileSync
        .mockReturnValueOnce(JSON.stringify({ score: 100 }))
        .mockReturnValueOnce(JSON.stringify(makeReport({ 'a.js': { mutants: [] } })))

      const result = diffReports('before.json', 'after.json', out)
      expect(result).toBeUndefined()
    })

    it('returns undefined when after report has no files key', () => {
      readFileSync
        .mockReturnValueOnce(JSON.stringify(makeReport({ 'a.js': { mutants: [] } })))
        .mockReturnValueOnce(JSON.stringify({ score: 100 }))

      const result = diffReports('before.json', 'after.json', out)
      expect(result).toBeUndefined()
    })
  })
})

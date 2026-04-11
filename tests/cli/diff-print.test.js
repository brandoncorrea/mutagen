import { describe, it, expect } from 'vitest'

import { printDiffReport, formatTenth, formatSigned } from '../../cli/diff-print.js'

describe('printDiffReport', () => {
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

  function capture(fn) {
    const lines = []
    fn(msg => lines.push(msg))
    return lines.join('\n')
  }

  it('prints header with file paths', () => {
    const before = makeReport({ 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } })
    const after = makeReport({ 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } })
    const changes = { newlyKilled: [], regressions: [], newMutants: [], removedMutants: [] }

    const output = capture(out =>
      printDiffReport({ beforeFile: 'old.json', afterFile: 'new.json', before, after }, changes, [], out)
    )

    expect(output).toContain('MUTATION DIFF')
    expect(output).toContain('Before: old.json')
    expect(output).toContain('After:  new.json')
  })

  it('prints overall score summary', () => {
    const before = makeReport({ 'a.js': { mutants: [makeMutant('m1', 'x', 'Survived')] } })
    const after = makeReport({ 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } })
    const changes = { newlyKilled: [{ after: { file: 'a.js', line: 1, mutatorName: 'x' } }], regressions: [], newMutants: [], removedMutants: [] }

    const output = capture(out =>
      printDiffReport({ beforeFile: 'a', afterFile: 'b', before, after }, changes, [], out)
    )

    expect(output).toContain('0.0%')
    expect(output).toContain('100.0%')
    expect(output).toContain('+100.0%')
  })

  it('prints per-file deltas', () => {
    const before = makeReport({ 'a.js': { mutants: [makeMutant('m1', 'x', 'Survived')] } })
    const after = makeReport({ 'a.js': { mutants: [makeMutant('m1', 'x', 'Killed')] } })
    const changes = { newlyKilled: [], regressions: [], newMutants: [], removedMutants: [] }
    const fileDeltas = [{ file: 'a.js', before: 0, after: 100, delta: 100 }]

    const output = capture(out =>
      printDiffReport({ beforeFile: 'a', afterFile: 'b', before, after }, changes, fileDeltas, out)
    )

    expect(output).toContain('PER-FILE CHANGES')
    expect(output).toContain('a.js')
  })
})

describe('formatTenth', () => {
  it('formats to one decimal place', () => {
    expect(formatTenth(33.333)).toBe('33.3')
    expect(formatTenth(100)).toBe('100.0')
    expect(formatTenth(0)).toBe('0.0')
  })
})

describe('formatSigned', () => {
  it('prepends + for positive values', () => {
    expect(formatSigned(50)).toBe('+50.0')
  })

  it('uses - for negative values', () => {
    expect(formatSigned(-25.5)).toBe('-25.5')
  })

  it('prepends + for zero', () => {
    expect(formatSigned(0)).toBe('+0.0')
  })
})

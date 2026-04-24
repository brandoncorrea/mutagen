import { describe, it, expect } from 'vitest'

import { autoDiffSummary } from '../../src/cli/auto-diff.js'
import { makeMutant } from './helpers.js'

function makeReport(files, survivors = []) {
  return { score: 0, total: 0, killed: 0, survived: 0, timedOut: 0, files, survivors }
}

function reportWithSurvivors(files) {
  const survivors = []
  for (const [file, { mutants }] of Object.entries(files))
    if (mutants)
      for (const mutant of mutants)
        if (mutant.status === 'Survived' && mutant.id)
          survivors.push({ id: mutant.id, file, line: mutant.line, name: mutant.name })
  return makeReport(files, survivors)
}

describe('autoDiffSummary', () => {
  it('returns null when no previous report', () => {
    const current = { 'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed')] } }
    expect(autoDiffSummary(null, current)).toBeNull()
  })

  it('returns null when previous report has no survivors', () => {
    expect(autoDiffSummary({}, { 'a.js': { mutants: [] } })).toBeNull()
    expect(autoDiffSummary({ score: 50 }, { 'a.js': { mutants: [] } })).toBeNull()
  })

  it('detects newly killed mutants', () => {
    const previous = reportWithSurvivors({
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Survived'),
        makeMutant('m2', 'EqualityOperator', 'Survived')
      ] }
    })
    const current = {
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Killed'),
        makeMutant('m2', 'EqualityOperator', 'Killed')
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+2 newly killed')
  })

  it('counts unchanged survivors', () => {
    const previous = reportWithSurvivors({
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Survived'),
        makeMutant('m2', 'EqualityOperator', 'Survived')
      ] }
    })
    const current = {
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Survived'),
        makeMutant('m2', 'EqualityOperator', 'Survived')
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('2 unchanged survivors')
  })

  it('returns null when all mutants are new (no overlap)', () => {
    const previous = reportWithSurvivors({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived')] }
    })
    const current = {
      'b.js': { mutants: [makeMutant('m2', 'EqualityOperator', 'Killed')] }
    }

    expect(autoDiffSummary(previous, current)).toBeNull()
  })

  it('handles mixed changes', () => {
    const previous = reportWithSurvivors({
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Survived'),
        makeMutant('m2', 'EqualityOperator', 'Survived'),
        makeMutant('m3', 'EqualityOperator', 'Survived')
      ] }
    })
    const current = {
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Killed'),
        makeMutant('m2', 'EqualityOperator', 'Survived'),
        makeMutant('m3', 'EqualityOperator', 'Survived')
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
    expect(result).toContain('2 unchanged survivors')
  })

  it('treats Timeout as killed', () => {
    const previous = reportWithSurvivors({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived')] }
    })
    const current = {
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Timeout')] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
  })

  it('detects newly killed from survivors list', () => {
    const previous = makeReport(
      { 'a.js': { score: 0, killed: 0, total: 2 } },
      [
        { id: 'm1', file: 'a.js', line: 1, name: 'x' },
        { id: 'm2', file: 'a.js', line: 2, name: 'y' }
      ]
    )
    const current = {
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Killed'),
        makeMutant('m2', 'EqualityOperator', 'Killed')
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+2 newly killed')
  })

  it('returns null when survivors array is empty', () => {
    const previous = makeReport(
      { 'a.js': { score: 100, killed: 5, total: 5 } },
      []
    )
    const current = {
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed')] }
    }

    expect(autoDiffSummary(previous, current)).toBeNull()
  })

  describe('format', () => {
    it('uses singular "regression" for count of 1', () => {
      const previous = reportWithSurvivors({
        'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived')] }
      })
      const current = {
        'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived')] }
      }

      expect(autoDiffSummary(previous, current)).toContain('0 regressions,')
    })

    it('uses singular "survivor" for count of 1', () => {
      const previous = reportWithSurvivors({
        'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived')] }
      })
      const current = {
        'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived')] }
      }

      expect(autoDiffSummary(previous, current)).toContain('1 unchanged survivor')
      expect(autoDiffSummary(previous, current)).not.toContain('survivors')
    })

    it('matches expected format', () => {
      const previous = reportWithSurvivors({
        'a.js': { mutants: [
          ...Array.from({ length: 7 }, (_, i) => makeMutant(`kill-${i}`, 'EqualityOperator', 'Survived')),
          ...Array.from({ length: 15 }, (_, i) => makeMutant(`surv-${i}`, 'EqualityOperator', 'Survived'))
        ] }
      })
      const current = {
        'a.js': { mutants: [
          ...Array.from({ length: 7 }, (_, i) => makeMutant(`kill-${i}`, 'EqualityOperator', 'Killed')),
          ...Array.from({ length: 15 }, (_, i) => makeMutant(`surv-${i}`, 'EqualityOperator', 'Survived'))
        ] }
      }

      expect(autoDiffSummary(previous, current)).toBe(
        '+7 newly killed, 0 regressions, 15 unchanged survivors'
      )
    })
  })

  it('skips survivors without id', () => {
    const previous = makeReport({}, [
      { id: 'm1', file: 'a.js', line: 1, name: 'x' },
      { file: 'a.js', line: 2, name: 'y' }
    ])
    const current = {
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Killed')] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
  })

  it('skips current mutants without id', () => {
    const previous = reportWithSurvivors({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived')] }
    })
    const current = {
      'a.js': { mutants: [
        { name: 'x', status: 'Killed' },
        makeMutant('m1', 'EqualityOperator', 'Killed')
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
  })

  it('ignores previously survived mutant with unrecognized current status', () => {
    const previous = reportWithSurvivors({
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Survived'),
        makeMutant('m2', 'EqualityOperator', 'Survived')
      ] }
    })
    const current = {
      'a.js': { mutants: [
        makeMutant('m1', 'EqualityOperator', 'Killed'),
        makeMutant('m2', 'EqualityOperator', 'CompileError')
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
    expect(result).toContain('0 unchanged survivor')
  })

  it('handles current file entries without mutants array', () => {
    const previous = reportWithSurvivors({
      'a.js': { mutants: [makeMutant('m1', 'EqualityOperator', 'Survived')] }
    })
    const current = {
      'a.js': { score: 100, killed: 1, total: 1 }
    }

    expect(() => autoDiffSummary(previous, current)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'

import { autoDiffSummary } from '../../src/cli/auto-diff.js'

function makeMutant(id, status, mutatorName = 'EqualityOperator', line = 1) {
  return { id, mutatorName, status, location: { start: { line } } }
}

function legacyReport(files) {
  return { schemaVersion: '1', thresholds: { high: 80, low: 60 }, files }
}

function structuredReport({ survivors = [], files = {}, score = 0, total = 0, killed = 0, survived = 0 }) {
  return { score, total, killed, survived, timedOut: 0, files, survivors }
}

describe('autoDiffSummary', () => {
  it('returns null when no previous report', () => {
    const current = { 'a.js': { mutants: [makeMutant('m1', 'Killed')] } }
    expect(autoDiffSummary(null, current)).toBeNull()
  })

  it('returns null when previous report has no recognizable data', () => {
    expect(autoDiffSummary({}, { 'a.js': { mutants: [] } })).toBeNull()
    expect(autoDiffSummary({ score: 50 }, { 'a.js': { mutants: [] } })).toBeNull()
  })

  describe('with legacy report (per-mutant data)', () => {
    it('detects newly killed mutants', () => {
      const previous = legacyReport({
        'a.js': { mutants: [
          makeMutant('m1', 'Survived'),
          makeMutant('m2', 'Survived')
        ] }
      })
      const current = {
        'a.js': { mutants: [
          makeMutant('m1', 'Killed'),
          makeMutant('m2', 'Killed')
        ] }
      }

      const result = autoDiffSummary(previous, current)
      expect(result).toContain('+2 newly killed')
    })

    it('detects regressions', () => {
      const previous = legacyReport({
        'a.js': { mutants: [
          makeMutant('m1', 'Killed'),
          makeMutant('m2', 'Killed')
        ] }
      })
      const current = {
        'a.js': { mutants: [
          makeMutant('m1', 'Survived'),
          makeMutant('m2', 'Killed')
        ] }
      }

      const result = autoDiffSummary(previous, current)
      expect(result).toContain('1 regression,')
    })

    it('counts unchanged survivors', () => {
      const previous = legacyReport({
        'a.js': { mutants: [
          makeMutant('m1', 'Survived'),
          makeMutant('m2', 'Survived')
        ] }
      })
      const current = {
        'a.js': { mutants: [
          makeMutant('m1', 'Survived'),
          makeMutant('m2', 'Survived')
        ] }
      }

      const result = autoDiffSummary(previous, current)
      expect(result).toContain('2 unchanged survivors')
    })

    it('returns null when all mutants are new (no overlap)', () => {
      const previous = legacyReport({
        'a.js': { mutants: [makeMutant('m1', 'Killed')] }
      })
      const current = {
        'b.js': { mutants: [makeMutant('m2', 'Killed')] }
      }

      expect(autoDiffSummary(previous, current)).toBeNull()
    })

    it('handles mixed changes', () => {
      const previous = legacyReport({
        'a.js': { mutants: [
          makeMutant('m1', 'Survived'),
          makeMutant('m2', 'Killed'),
          makeMutant('m3', 'Survived')
        ] }
      })
      const current = {
        'a.js': { mutants: [
          makeMutant('m1', 'Killed'),
          makeMutant('m2', 'Survived'),
          makeMutant('m3', 'Survived')
        ] }
      }

      const result = autoDiffSummary(previous, current)
      expect(result).toContain('+1 newly killed')
      expect(result).toContain('1 regression,')
      expect(result).toContain('1 unchanged survivor')
    })

    it('treats Timeout as killed', () => {
      const previous = legacyReport({
        'a.js': { mutants: [makeMutant('m1', 'Survived')] }
      })
      const current = {
        'a.js': { mutants: [makeMutant('m1', 'Timeout')] }
      }

      const result = autoDiffSummary(previous, current)
      expect(result).toContain('+1 newly killed')
    })

    it('treats NoCoverage as alive', () => {
      const previous = legacyReport({
        'a.js': { mutants: [makeMutant('m1', 'Killed')] }
      })
      const current = {
        'a.js': { mutants: [makeMutant('m1', 'NoCoverage')] }
      }

      const result = autoDiffSummary(previous, current)
      expect(result).toContain('1 regression')
    })
  })

  describe('with structured report (survivors array)', () => {
    it('detects newly killed from survivors list', () => {
      const previous = structuredReport({
        survivors: [
          { id: 'm1', file: 'a.js', line: 1, name: 'x' },
          { id: 'm2', file: 'a.js', line: 2, name: 'y' }
        ],
        files: { 'a.js': { score: 0, killed: 0, total: 2 } },
        score: 0, total: 2, killed: 0, survived: 2
      })
      const current = {
        'a.js': { mutants: [
          makeMutant('m1', 'Killed'),
          makeMutant('m2', 'Killed')
        ] }
      }

      const result = autoDiffSummary(previous, current)
      expect(result).toContain('+2 newly killed')
    })

    it('counts unchanged survivors', () => {
      const previous = structuredReport({
        survivors: [
          { id: 'm1', file: 'a.js', line: 1, name: 'x' }
        ],
        files: { 'a.js': { score: 50, killed: 1, total: 2 } },
        score: 50, total: 2, killed: 1, survived: 1
      })
      const current = {
        'a.js': { mutants: [
          makeMutant('m1', 'Survived'),
          makeMutant('m2', 'Killed')
        ] }
      }

      const result = autoDiffSummary(previous, current)
      expect(result).toContain('1 unchanged survivor')
    })

    it('returns null when survivors array is empty and no mutant data', () => {
      const previous = structuredReport({
        survivors: [],
        files: { 'a.js': { score: 100, killed: 5, total: 5 } },
        score: 100, total: 5, killed: 5, survived: 0
      })
      const current = {
        'a.js': { mutants: [makeMutant('m1', 'Killed')] }
      }

      expect(autoDiffSummary(previous, current)).toBeNull()
    })
  })

  describe('format', () => {
    it('uses singular "regression" for count of 1', () => {
      const previous = legacyReport({
        'a.js': { mutants: [makeMutant('m1', 'Killed')] }
      })
      const current = {
        'a.js': { mutants: [makeMutant('m1', 'Survived')] }
      }

      expect(autoDiffSummary(previous, current)).toContain('1 regression,')
    })

    it('uses plural "regressions" for count != 1', () => {
      const previous = legacyReport({
        'a.js': { mutants: [
          makeMutant('m1', 'Killed'),
          makeMutant('m2', 'Killed')
        ] }
      })
      const current = {
        'a.js': { mutants: [
          makeMutant('m1', 'Survived'),
          makeMutant('m2', 'Survived')
        ] }
      }

      expect(autoDiffSummary(previous, current)).toContain('2 regressions,')
    })

    it('uses singular "survivor" for count of 1', () => {
      const previous = legacyReport({
        'a.js': { mutants: [makeMutant('m1', 'Survived')] }
      })
      const current = {
        'a.js': { mutants: [makeMutant('m1', 'Survived')] }
      }

      expect(autoDiffSummary(previous, current)).toContain('1 unchanged survivor')
      expect(autoDiffSummary(previous, current)).not.toContain('survivors')
    })

    it('matches expected format from issue', () => {
      const previous = legacyReport({
        'a.js': { mutants: [
          ...Array.from({ length: 7 }, (_, i) => makeMutant(`kill-${i}`, 'Survived')),
          ...Array.from({ length: 15 }, (_, i) => makeMutant(`surv-${i}`, 'Survived'))
        ] }
      })
      const current = {
        'a.js': { mutants: [
          ...Array.from({ length: 7 }, (_, i) => makeMutant(`kill-${i}`, 'Killed')),
          ...Array.from({ length: 15 }, (_, i) => makeMutant(`surv-${i}`, 'Survived'))
        ] }
      }

      expect(autoDiffSummary(previous, current)).toBe(
        '+7 newly killed, 0 regressions, 15 unchanged survivors'
      )
    })
  })

  it('skips legacy mutants without id while processing those with id', () => {
    const previous = legacyReport({
      'a.js': { mutants: [
        makeMutant('m1', 'Survived'),
        { mutatorName: 'x', status: 'Survived' }  // no id — skipped
      ] }
    })
    const current = {
      'a.js': { mutants: [
        makeMutant('m1', 'Killed'),
        { mutatorName: 'x', status: 'Killed' }
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
  })

  it('skips mutants without id', () => {
    const previous = legacyReport({
      'a.js': { mutants: [{ mutatorName: 'x', status: 'Survived' }] }
    })
    const current = {
      'a.js': { mutants: [{ mutatorName: 'x', status: 'Killed' }] }
    }

    expect(autoDiffSummary(previous, current)).toBeNull()
  })

  it('skips current mutants without id when previous has valid entries', () => {
    const previous = legacyReport({
      'a.js': { mutants: [makeMutant('m1', 'Survived')] }
    })
    const current = {
      'a.js': { mutants: [
        { mutatorName: 'x', status: 'Killed' },    // no id — should be skipped
        makeMutant('m1', 'Killed')                   // has id — newly killed
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
  })

  it('ignores previously survived mutant with unrecognized current status', () => {
    const previous = legacyReport({
      'a.js': { mutants: [
        makeMutant('m1', 'Survived'),
        makeMutant('m2', 'Survived')
      ] }
    })
    const current = {
      'a.js': { mutants: [
        makeMutant('m1', 'Killed'),
        makeMutant('m2', 'CompileError')   // neither killed nor alive
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
    expect(result).toContain('0 unchanged survivor')
  })

  it('skips structured survivors without id', () => {
    const previous = structuredReport({
      survivors: [
        { id: 'm1', file: 'a.js', line: 1, name: 'x' },
        { file: 'a.js', line: 2, name: 'y' }  // no id — should be skipped
      ],
      files: { 'a.js': { score: 0, killed: 0, total: 2 } },
      score: 0, total: 2, killed: 0, survived: 2
    })
    const current = {
      'a.js': { mutants: [
        makeMutant('m1', 'Killed')
      ] }
    }

    const result = autoDiffSummary(previous, current)
    expect(result).toContain('+1 newly killed')
  })
})

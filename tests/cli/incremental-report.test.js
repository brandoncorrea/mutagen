import { describe, it, expect } from 'vitest'
import { countCachedResults } from '../../cli/incremental-report.js'

describe('countCachedResults', () => {
  it('returns zeros when report is null', () => {
    const result = countCachedResults(null, ['a.js'])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })

  it('returns zeros when no relPaths match report files', () => {
    const report = {
      files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
    }
    const result = countCachedResults(report, ['b.js'])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })

  it('counts Killed mutants', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Killed' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(2)
    expect(result.survived).toBe(0)
  })

  it('counts Survived mutants', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Survived' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.survived).toBe(1)
    expect(result.killed).toBe(0)
  })

  it('counts Timeout mutants as killed', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Timeout' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(1)
  })

  it('aggregates counts across multiple files', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }] },
        'b.js': { mutants: [{ status: 'Survived' }, { status: 'Killed' }] }
      }
    }
    const result = countCachedResults(report, ['a.js', 'b.js'])
    expect(result.killed).toBe(2)
    expect(result.survived).toBe(1)
  })

  it('ignores mutants with unrecognized status', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Unknown' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(1)
    expect(result.survived).toBe(0)
  })

  it('returns zeros when relPaths is empty', () => {
    const report = {
      files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
    }
    const result = countCachedResults(report, [])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}))

import { combineReportData } from '../../core/report-data.js'

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

    const merged = combineReportData(['file1.json', 'file2.json'], () => {})

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

    const out = vi.fn()
    const merged = combineReportData(['file1.json', 'file2.json'], out)

    expect(merged.files['a.js'].mutants).toHaveLength(1)
    expect(out).toHaveBeenCalledWith(expect.stringContaining('Deduplicated'))
  })

  it('handles unreadable files gracefully', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const out = vi.fn()

    const merged = combineReportData(['bad.json'], out)

    expect(Object.keys(merged.files)).toHaveLength(0)
    expect(out).toHaveBeenCalledWith(expect.stringContaining('Warning'))
  })

  it('routes deduplication message through injected out', () => {
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

    const out = vi.fn()
    combineReportData(['file1.json', 'file2.json'], out)

    expect(out).toHaveBeenCalledWith(expect.stringContaining('Deduplicated'))
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

    const merged = combineReportData(['file1.json', 'file2.json'], () => {})

    expect(merged.files['a.js'].mutants).toHaveLength(2)
  })

  it('returns empty files for empty input', () => {
    const merged = combineReportData([], () => {})
    expect(Object.keys(merged.files)).toHaveLength(0)
  })
})

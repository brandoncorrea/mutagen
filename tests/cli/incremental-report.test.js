import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
})

import {
  printIncrementalSummary,
  printIncrementalHeader,
  printAllCachedSummary,
  computeDeltas
} from '../../src/cli/incremental-report.js'

import { capture } from './helpers.js'

beforeEach(() => { vi.clearAllMocks() })

describe('printIncrementalSummary', () => {
  it('displays correct unchangedSources and sources counts', () => {
    const { out, lines } = capture()
    const batchResult = { totalSurvived: 1, totalKilled: 3, failures: 0 }
    const sources = ['a.js', 'b.js', 'c.js']
    const previous = { previousReport: null }
    const classification = {
      unchangedSources: ['a.js'],
      changedSources: ['b.js', 'c.js']
    }

    printIncrementalSummary(out, batchResult, sources, previous, classification)

    const cachedLine = lines.find(line => line.startsWith('Cached:'))
    expect(cachedLine).toContain('1 files')
    const totalLine = lines.find(line => line.startsWith('Total:'))
    expect(totalLine).toContain('3 files')
  })

  it('displays rerun line with killed and survived counts', () => {
    const { out, lines } = capture()
    const batchResult = { totalSurvived: 2, totalKilled: 5, failures: 1 }
    const sources = ['a.js', 'b.js', 'c.js']
    const previous = { previousReport: null }
    const classification = {
      unchangedSources: [],
      changedSources: ['a.js', 'b.js', 'c.js']
    }

    printIncrementalSummary(out, batchResult, sources, previous, classification)

    const rerunLine = lines.find(line => line.startsWith('Rerun:'))
    expect(rerunLine).toContain('3 files')
    expect(rerunLine).toContain('Killed: 5')
    expect(rerunLine).toContain('Survived: 2')
    expect(rerunLine).toContain('Errors: 1')
  })
})

describe('printIncrementalHeader', () => {
  it('displays correct sources and cached counts', () => {
    const { out, lines } = capture()
    const sources = ['a.js', 'b.js', 'c.js', 'd.js']
    const classification = {
      changedSources: ['c.js'],
      unchangedSources: ['a.js', 'b.js', 'd.js'],
      changedTestFiles: [],
      testInvalidated: new Set()
    }

    printIncrementalHeader(out, sources, classification)

    const totalLine = lines.find(line => line.startsWith('Total sources:'))
    expect(totalLine).toContain('4')
    const cachedLine = lines.find(line => line.startsWith('Cached:'))
    expect(cachedLine).toMatch(/3$/)
  })
})

describe('printAllCachedSummary', () => {
  it('displays correct file count when everything is cached', () => {
    const { out, lines } = capture()
    const sources = ['a.js', 'b.js']
    const previous = { previousReport: null }
    const classification = { unchangedSources: ['a.js', 'b.js'] }

    printAllCachedSummary(out, sources, previous, classification)

    const filesLine = lines.find(line => line.startsWith('Files:'))
    expect(filesLine).toContain('2')
  })

  it('displays killed and survived counts from cached results', () => {
    const { out, lines } = capture()
    const sources = ['a.js']
    const previous = {
      previousReport: {
        files: {
          'a.js': {
            mutants: [
              { status: 'Killed' },
              { status: 'Killed' },
              { status: 'Survived' }
            ]
          }
        }
      }
    }
    const classification = { unchangedSources: ['a.js'] }

    printAllCachedSummary(out, sources, previous, classification)

    const filesLine = lines.find(line => line.startsWith('Files:'))
    expect(filesLine).toContain('Killed: 2')
    expect(filesLine).toContain('Survived: 1')
  })

  it('handles structured report format without mutants arrays', () => {
    const { out, lines } = capture()
    const sources = ['a.js']
    const previous = {
      previousReport: {
        files: {
          'a.js': { score: 100, killed: 5, total: 5 }
        }
      }
    }
    const classification = { unchangedSources: ['a.js'] }

    expect(() =>
      printAllCachedSummary(out, sources, previous, classification)
    ).not.toThrow()
  })
})

describe('structured report compatibility', () => {
  it('printIncrementalSummary handles files without mutants arrays', () => {
    const { out } = capture()
    const batchResult = { totalSurvived: 0, totalKilled: 1, failures: 0 }
    const sources = ['a.js', 'b.js']
    const previous = {
      previousReport: {
        files: {
          'a.js': { score: 100, killed: 3, total: 3 }
        }
      }
    }
    const classification = {
      unchangedSources: ['a.js'],
      changedSources: ['b.js']
    }

    expect(() =>
      printIncrementalSummary(out, batchResult, sources, previous, classification)
    ).not.toThrow()
  })

  it('computeDeltas handles new file results without mutants arrays', () => {
    const previousReport = {
      files: {
        'a.js': {
          mutants: [
            { id: 'm1', mutatorName: 'x', status: 'Killed', location: { start: { line: 1 } } }
          ]
        }
      }
    }
    const newFileResults = {
      'a.js': { score: 100, killed: 1, total: 1 }  // no mutants array
    }
    const classification = { unchangedSources: [] }

    expect(() =>
      computeDeltas(previousReport, newFileResults, classification)
    ).not.toThrow()
  })

  it('computeDeltas handles previous report without mutants arrays', () => {
    const previousReport = {
      files: {
        'a.js': { score: 100, killed: 3, total: 3 }
      }
    }
    const newFileResults = {
      'a.js': {
        mutants: [
          { id: 'm1', mutatorName: 'x', status: 'Killed', location: { start: { line: 1 } } }
        ]
      }
    }
    const classification = { unchangedSources: [] }

    expect(() =>
      computeDeltas(previousReport, newFileResults, classification)
    ).not.toThrow()
  })
})

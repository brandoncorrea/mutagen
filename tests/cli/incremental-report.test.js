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
  printAllCachedSummary
} from '../../src/cli/incremental-report.js'

function capture() {
  const lines = []
  return { out: { log: msg => lines.push(msg), error: () => {} }, lines }
}

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

    const cachedLine = lines.find(l => l.startsWith('Cached:'))
    expect(cachedLine).toContain('1 files')
    const totalLine = lines.find(l => l.startsWith('Total:'))
    expect(totalLine).toContain('3 files')
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

    const totalLine = lines.find(l => l.startsWith('Total sources:'))
    expect(totalLine).toContain('4')
    const cachedLine = lines.find(l => l.startsWith('Cached:'))
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

    const filesLine = lines.find(l => l.startsWith('Files:'))
    expect(filesLine).toContain('2')
  })
})

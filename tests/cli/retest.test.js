import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve, relative } from 'node:path'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn()
  }
})

vi.mock('../../src/core/temp-copy.js')

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createTempCopy } from '../../src/core/temp-copy.js'
import { loadRetestTargets, filterMutationsToSurvivors } from '../../src/cli/retest.js'
import { mutationId } from '../../src/core/mutation-id.js'
import { prepareMutationConfig } from '../../src/core/generate.js'
import { testMutators, sourceCode, noop } from './helpers.js'

function mockFs(files) {
  readFileSync.mockImplementation((path, enc) => {
    const content = files[path]
    if (!content) return enc === 'utf-8' ? '' : Buffer.from('')
    return enc === 'utf-8' ? content : Buffer.from(content)
  })
}

const id1 = mutationId('src/a.js', 1, '=== → !==')

const sampleReport = {
  score: 50,
  total: 2,
  killed: 1,
  survived: 1,
  timedOut: 0,
  files: {
    'src/a.js': { score: 50, killed: 1, total: 2 }
  },
  survivors: [
    {
      id: id1,
      file: 'src/a.js',
      line: 1,
      name: '=== → !==',
      original: 'a === b',
      mutated: 'a !== b'
    }
  ]
}

describe('loadRetestTargets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('extracts unique files from survivors', () => {
    const targets = loadRetestTargets(sampleReport)
    expect(targets.files).toEqual(['src/a.js'])
  })

  it('builds survivor IDs from the report', () => {
    const targets = loadRetestTargets(sampleReport)
    expect(targets.survivorIds.size).toBe(1)
    expect(targets.survivorIds.has(id1)).toBe(true)
  })

  it('handles report with multiple survivors across files', () => {
    const report = {
      ...sampleReport,
      survivors: [
        { id: 'id1', file: 'src/a.js', line: 1, name: '=== → !==' },
        { id: 'id2', file: 'src/b.js', line: 5, name: '+ → -' },
        { id: 'id3', file: 'src/a.js', line: 10, name: '> → <' }
      ]
    }
    const targets = loadRetestTargets(report)
    expect(targets.files).toEqual(['src/a.js', 'src/b.js'])
    expect(targets.survivorIds.size).toBe(3)
  })

  it('handles report with no survivors', () => {
    const report = { ...sampleReport, survivors: [] }
    const targets = loadRetestTargets(report)
    expect(targets.files).toEqual([])
    expect(targets.survivorIds.size).toBe(0)
  })

  it('handles report with missing survivors key', () => {
    const report = { score: 100, total: 0, killed: 0, survived: 0, files: {} }
    const targets = loadRetestTargets(report)
    expect(targets.files).toEqual([])
    expect(targets.survivorIds.size).toBe(0)
  })

  it('skips survivors without id', () => {
    const report = {
      ...sampleReport,
      survivors: [
        { id: 'id1', file: 'src/a.js', line: 1, name: 'x' },
        { file: 'src/a.js', line: 2, name: 'y' }
      ]
    }
    const targets = loadRetestTargets(report)
    expect(targets.survivorIds.size).toBe(1)
  })
})

describe('filterMutationsToSurvivors', () => {
  it('filters mutations to only those matching survivor IDs', () => {
    const mutations = [
      { id: id1, line: 1, name: '=== → !==', source: 'if (a !== b) {}' },
      { id: 'other', line: 2, name: '+ → -', source: 'a - b' }
    ]
    const survivorIds = new Set([id1])
    const result = filterMutationsToSurvivors(mutations, survivorIds)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].name).toBe('=== → !==')
  })

  it('returns empty matched when no survivors match', () => {
    const mutations = [
      { id: 'x', line: 1, name: '=== → !==', source: 's' }
    ]
    const survivorIds = new Set(['no-match'])
    const result = filterMutationsToSurvivors(mutations, survivorIds)
    expect(result.matched).toHaveLength(0)
  })

  it('tracks skipped count for survivors not found in current mutations', () => {
    const mutations = []
    const survivorIds = new Set(['id1', 'id2'])
    const result = filterMutationsToSurvivors(mutations, survivorIds)
    expect(result.skipped).toBe(2)
  })
})

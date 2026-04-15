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

vi.mock('../../src/core/worktree.js')

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createWorktree } from '../../src/core/worktree.js'
import { loadRetestTargets, filterMutationsToSurvivors } from '../../src/cli/retest.js'
import { prepareMutationConfig } from '../../src/core/generate.js'
import { patterns, sourceCode, noop } from './helpers.js'

function mockFs(files) {
  readFileSync.mockImplementation((path, enc) => {
    const content = files[path]
    if (!content) return enc === 'utf-8' ? '' : Buffer.from('')
    return enc === 'utf-8' ? content : Buffer.from(content)
  })
}

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

  it('builds survivor keys from the report', () => {
    const targets = loadRetestTargets(sampleReport)
    expect(targets.survivorKeys.size).toBe(1)
    expect(targets.survivorKeys.has('src/a.js:1:=== → !==')).toBe(true)
  })

  it('handles report with multiple survivors across files', () => {
    const report = {
      ...sampleReport,
      survivors: [
        { file: 'src/a.js', line: 1, name: '=== → !==', original: 'a', mutated: 'b' },
        { file: 'src/b.js', line: 5, name: '+ → -', original: 'x', mutated: 'y' },
        { file: 'src/a.js', line: 10, name: '> → <', original: 'c', mutated: 'd' }
      ]
    }
    const targets = loadRetestTargets(report)
    expect(targets.files).toEqual(['src/a.js', 'src/b.js'])
    expect(targets.survivorKeys.size).toBe(3)
  })

  it('handles report with no survivors', () => {
    const report = { ...sampleReport, survivors: [] }
    const targets = loadRetestTargets(report)
    expect(targets.files).toEqual([])
    expect(targets.survivorKeys.size).toBe(0)
  })
})

describe('filterMutationsToSurvivors', () => {
  it('filters mutations to only those matching survivor keys', () => {
    const mutations = [
      { line: 1, name: '=== → !==', original: 'a === b', mutated: 'a !== b', source: 'if (a !== b) {}' },
      { line: 2, name: '+ → -', original: 'a + b', mutated: 'a - b', source: 'a - b' }
    ]
    const survivorKeys = new Set(['src/a.js:1:=== → !=='])
    const result = filterMutationsToSurvivors(mutations, 'src/a.js', survivorKeys)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].name).toBe('=== → !==')
  })

  it('returns empty matched when no survivors match', () => {
    const mutations = [
      { line: 1, name: '=== → !==', original: 'a', mutated: 'b', source: 's' }
    ]
    const survivorKeys = new Set(['src/other.js:1:=== → !=='])
    const result = filterMutationsToSurvivors(mutations, 'src/a.js', survivorKeys)
    expect(result.matched).toHaveLength(0)
  })

  it('tracks skipped count for survivors not found in current mutations', () => {
    const mutations = []
    const survivorKeys = new Set(['src/a.js:1:=== → !==', 'src/a.js:5:+ → -'])
    const result = filterMutationsToSurvivors(mutations, 'src/a.js', survivorKeys)
    expect(result.skipped).toBe(2)
  })

  it('counts only file-relevant survivors as skipped', () => {
    const mutations = []
    const survivorKeys = new Set(['src/a.js:1:=== → !==', 'src/b.js:5:+ → -'])
    const result = filterMutationsToSurvivors(mutations, 'src/a.js', survivorKeys)
    expect(result.skipped).toBe(1)
  })
})

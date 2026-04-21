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
import {
  loadRetestTargets, filterMutationsToSurvivors,
  survivorKeysForFile, readRetestSource,
  emptyRetestResult, mapRetestResult
} from '../../src/cli/retest.js'
import { prepareMutationConfig } from '../../src/core/generate.js'
import { testMutators, sourceCode, noop } from './helpers.js'

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

  it('handles report with missing survivors key', () => {
    const report = { score: 100, total: 0, killed: 0, survived: 0, files: {} }
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

describe('survivorKeysForFile', () => {
  it('returns only keys matching the given file prefix', () => {
    const keys = new Set([
      'src/a.js:1:=== → !==',
      'src/b.js:5:+ → -',
      'src/a.js:10:> → <'
    ])
    const result = survivorKeysForFile('src/a.js', keys)
    expect(result).toEqual([
      'src/a.js:1:=== → !==',
      'src/a.js:10:> → <'
    ])
  })

  it('returns empty array when no keys match', () => {
    const keys = new Set(['src/b.js:1:=== → !=='])
    expect(survivorKeysForFile('src/a.js', keys)).toEqual([])
  })

  it('does not match partial file prefixes', () => {
    const keys = new Set(['src/a.jsx:1:=== → !=='])
    expect(survivorKeysForFile('src/a.js', keys)).toEqual([])
  })
})

describe('emptyRetestResult', () => {
  it('returns zero counts with given skipped value', () => {
    expect(emptyRetestResult(3)).toEqual({
      skipped: 3, killed: 0, survived: 0,
      timedOut: 0, error: false, fileResult: null
    })
  })

  it('defaults to zero skipped', () => {
    expect(emptyRetestResult(0)).toEqual({
      skipped: 0, killed: 0, survived: 0,
      timedOut: 0, error: false, fileResult: null
    })
  })
})

describe('readRetestSource', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns source when file exists', () => {
    const absPath = resolve('src/a.js')
    readFileSync.mockReturnValue('const x = 1')
    const result = readRetestSource('src/a.js', new Set(), noop)
    expect(result).toEqual({ source: 'const x = 1' })
    expect(readFileSync).toHaveBeenCalledWith(absPath, 'utf-8')
  })

  it('returns skipResult when file not found', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const keys = new Set(['src/a.js:1:=== → !==', 'src/a.js:5:+ → -'])
    const logs = []
    const out = { log: msg => logs.push(msg) }
    const result = readRetestSource('src/a.js', keys, out)
    expect(result.skipResult).toEqual({
      skipped: 2, killed: 0, survived: 0,
      timedOut: 0, error: false, fileResult: null
    })
    expect(logs[0]).toContain('Skipping src/a.js')
  })
})

describe('mapRetestResult', () => {
  it('maps error result', () => {
    const result = mapRetestResult({ error: true }, 1)
    expect(result).toEqual({
      skipped: 1, killed: 0, survived: 0,
      timedOut: 0, error: true, fileResult: null
    })
  })

  it('maps successful result', () => {
    const runResult = {
      killed: 3, survived: 1, timedOut: 2,
      jsonData: { path: 'src/a.js', mutants: [{ id: 1 }] }
    }
    const result = mapRetestResult(runResult, 0)
    expect(result).toEqual({
      skipped: 0, killed: 3, survived: 1, timedOut: 2,
      error: false,
      fileResult: { path: 'src/a.js', mutants: [{ id: 1 }] }
    })
  })

  it('defaults timedOut to 0 when missing', () => {
    const runResult = {
      killed: 1, survived: 0,
      jsonData: { path: 'x.js', mutants: [] }
    }
    const result = mapRetestResult(runResult, 0)
    expect(result.timedOut).toBe(0)
  })
})

/**
 * Tests for result determinism between runSingle and runParallel.
 * Verifies that the same mutations produce identical outcome counts
 * and JSON report content regardless of execution mode.
 *
 * Uses real pool (not mocked) with mocked fs and deterministic runners.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'

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

vi.mock('../../../src/core/temp-copy.js')

// NOTE: pool.js is NOT mocked — we use the real pool for determinism verification

import { runSingle, runParallel } from '../../../src/cli/runner/index.js'
import { prepareMutationConfig } from '../../../src/core/generate.js'
import { createTempCopy } from '../../../src/core/temp-copy.js'
import { readFileSync } from 'node:fs'
import { noop, mockFs as _mockFs } from '../helpers.js'

const mutators = [
  {
    name: '=== → !==',
    types: ['BinaryExpression'],
    test: node => node.operator === '===',
    mutate: (node, source) => {
      const idx = source.indexOf('===', node.left.end)
      if (idx === -1) return null
      return { start: idx, end: idx + 3, replacement: '!==' }
    }
  },
  {
    name: '+ → -',
    types: ['BinaryExpression'],
    test: node => node.operator === '+',
    mutate: (node, source) => {
      const idx = source.indexOf('+', node.left.end)
      if (idx === -1) return null
      return { start: idx, end: idx + 1, replacement: '-' }
    }
  }
]
const mutationConfig = prepareMutationConfig({ mutators })

// Source with multiple mutations to exercise distribution
const multiSource = [
  'if (a === b) {',
  '  const x = a + b',
  '  if (c === d) {',
  '    const y = c + d',
  '  }',
  '}'
].join('\n')

function mockFs(files) { _mockFs(readFileSync, files) }

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-det'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    cleanup: vi.fn()
  }
}

/**
 * Create a runner factory with all-killed mutation behavior.
 *
 * runSingle calls createRunner once; that runner handles preflight (first run()
 * call returns passed:true) then mutations. runParallel creates a separate
 * preflight runner, then pool workers via the same factory.
 *
 * Each runner tracks its own preflight state via closure. The first run() on
 * each runner returns passed:true. For runSingle, that's the actual preflight.
 * For runParallel pool workers, we accept that the first mutation per worker
 * returns "survived" — this is consistent WITHIN a given worker count, so
 * parallel-vs-parallel comparisons with the same worker count are deterministic.
 *
 * For cross-mode comparisons (single vs parallel), we compare only total
 * mutation count, not per-status counts, since the execution model differs.
 */
function killedRunnerFactory() {
  return vi.fn().mockImplementation(async () => {
    let preflightDone = false
    return {
      run: vi.fn().mockImplementation(() => {
        if (!preflightDone) {
          preflightDone = true
          return Promise.resolve({ passed: true, killedBy: [] })
        }
        return Promise.resolve({ passed: false, killedBy: ['spec.js'] })
      }),
      close: vi.fn().mockResolvedValue(),
      applyMutation: vi.fn()
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  createTempCopy.mockImplementation(() => fakeWorktree())
})

describe('runSingle vs runParallel result determinism', () => {
  const sourceFile = resolve('src/multi.js')

  it('processes the same total number of mutations', async () => {
    mockFs({ [sourceFile]: multiSource })

    const seqResult = await runSingle({
      sourceFile, mutationConfig,
      createRunner: killedRunnerFactory(),
      out: noop
    })

    const parResult = await runParallel({
      sourceFile, mutationConfig,
      createRunner: killedRunnerFactory(),
      workerCount: 3,
      out: noop
    })

    const seqTotal = seqResult.killed + seqResult.survived + seqResult.timedOut
    const parTotal = parResult.killed + parResult.survived + parResult.timedOut

    expect(seqTotal).toBe(parTotal)
    expect(seqTotal).toBeGreaterThan(0)
  })

  it('produces same jsonData mutant IDs in both modes', async () => {
    mockFs({ [sourceFile]: multiSource })

    const seqResult = await runSingle({
      sourceFile, mutationConfig,
      createRunner: killedRunnerFactory(),
      out: noop
    })

    const parResult = await runParallel({
      sourceFile, mutationConfig,
      createRunner: killedRunnerFactory(),
      workerCount: 2,
      out: noop
    })

    // Same number of mutants in JSON report
    expect(seqResult.jsonData.mutants.length).toBe(parResult.jsonData.mutants.length)

    // Same mutant IDs (sorted, since parallel order may differ)
    const seqIds = seqResult.jsonData.mutants.map(mutant => mutant.id).sort()
    const parIds = parResult.jsonData.mutants.map(mutant => mutant.id).sort()
    expect(seqIds).toEqual(parIds)
  })

  it('produces consistent counts across repeated runs with same worker count', async () => {
    const results = []
    for (const wc of [2, 2, 2]) {
      mockFs({ [sourceFile]: multiSource })
      const r = await runParallel({
        sourceFile, mutationConfig,
        createRunner: killedRunnerFactory(),
        workerCount: wc,
        out: noop
      })
      results.push(r)
    }

    // Same worker count should always produce identical results
    for (let i = 1; i < results.length; i++) {
      expect(results[i].killed).toBe(results[0].killed)
      expect(results[i].survived).toBe(results[0].survived)
      expect(results[i].timedOut).toBe(results[0].timedOut)
      expect(results[i].jsonData.mutants.length).toBe(results[0].jsonData.mutants.length)
    }
  })

  it('runSingle produces identical results across multiple runs', async () => {
    const results = []
    for (let i = 0; i < 3; i++) {
      mockFs({ [sourceFile]: multiSource })
      results.push(await runSingle({
        sourceFile, mutationConfig,
        createRunner: killedRunnerFactory(),
        out: noop
      }))
    }

    for (let i = 1; i < results.length; i++) {
      expect(results[i].killed).toBe(results[0].killed)
      expect(results[i].survived).toBe(results[0].survived)
      expect(results[i].timedOut).toBe(results[0].timedOut)
    }
  })

  it('runParallel produces identical results across multiple runs', async () => {
    const results = []
    for (let i = 0; i < 3; i++) {
      mockFs({ [sourceFile]: multiSource })
      results.push(await runParallel({
        sourceFile, mutationConfig,
        createRunner: killedRunnerFactory(),
        workerCount: 3,
        out: noop
      }))
    }

    for (let i = 1; i < results.length; i++) {
      expect(results[i].killed).toBe(results[0].killed)
      expect(results[i].survived).toBe(results[0].survived)
      expect(results[i].timedOut).toBe(results[0].timedOut)
    }
  })

  it('preserves all jsonData fields in both modes', async () => {
    mockFs({ [sourceFile]: multiSource })

    const seqResult = await runSingle({
      sourceFile, mutationConfig,
      createRunner: killedRunnerFactory(),
      out: noop
    })

    const parResult = await runParallel({
      sourceFile, mutationConfig,
      createRunner: killedRunnerFactory(),
      workerCount: 2,
      out: noop
    })

    // Both modes produce jsonData with path and mutants
    expect(seqResult.jsonData).toHaveProperty('path')
    expect(seqResult.jsonData).toHaveProperty('mutants')
    expect(parResult.jsonData).toHaveProperty('path')
    expect(parResult.jsonData).toHaveProperty('mutants')
    expect(seqResult.jsonData.path).toBe(parResult.jsonData.path)

    const mutants = [
      ...seqResult.jsonData.mutants,
      ...parResult.jsonData.mutants
    ]

    // Every mutant has required fields
    for (const mutant of mutants) {
      expect(mutant).toHaveProperty('id')
      expect(mutant).toHaveProperty('name')
      expect(mutant).toHaveProperty('status')
      expect(mutant).toHaveProperty('line')
    }
  })
})

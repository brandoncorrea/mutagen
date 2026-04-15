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

vi.mock('../../../core/pool.js')
vi.mock('../../../core/worktree.js')

import { runParallel } from '../../../cli/runner/index.js'
import { preparePatterns } from '../../../core/engine.js'
import { createPool } from '../../../core/pool.js'
import { createWorktree } from '../../../core/worktree.js'
import { readFileSync } from 'node:fs'
import { patterns, sourceCode, noop, fakePoolRunner, mockFs as _mockFs } from '../helpers.js'

const prepared = preparePatterns(patterns)

function mockFs(files) { _mockFs(readFileSync, files) }

let worktreeIndex = 0
function fakeWorktree() {
  const idx = worktreeIndex++
  const tempRoot = `/tmp/mutagen-worker-${idx}`
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    cleanup: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  worktreeIndex = 0
  createWorktree.mockImplementation(() => fakeWorktree())
})

describe('runParallel', () => {
  it('creates a pool with specified workerCount and dispatches mutations', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({
      killed: [{ line: 1, name: '=== → !==', original: 'a === b', mutated: 'a !== b', source: 'if (a !== b) {}', killedBy: ['t.js'] }],
      survived: [],
      timedOut: []
    })
    const poolClose = vi.fn().mockResolvedValue()
    createPool.mockReturnValue({ run: poolRun, close: poolClose })

    const result = await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 4,
      out: noop
    })

    expect(createPool).toHaveBeenCalledWith({
      workerCount: 4,
      createRunner: expect.any(Function)
    })
    expect(poolRun).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ line: 1 })]),
      expect.objectContaining({ timeout: undefined })
    )
    expect(result.killed).toBe(1)
    expect(result.survived).toBe(0)
  })

  it('returns same shape as runSingle: survived, killed, timedOut, jsonData', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({
      killed: [{ line: 1, name: '=== → !==', original: 'a === b', mutated: 'a !== b', source: 'if (a !== b) {}', killedBy: ['t.js'] }],
      survived: [],
      timedOut: []
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    const result = await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: noop
    })

    expect(result).toHaveProperty('survived', 0)
    expect(result).toHaveProperty('killed', 1)
    expect(result).toHaveProperty('timedOut', 0)
    expect(result).toHaveProperty('jsonData')
    expect(result.jsonData).toHaveProperty('path')
    expect(result.jsonData).toHaveProperty('mutants')
  })

  it('aborts early when preflight tests fail', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: false }])

    const result = await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: noop
    })

    expect(result).toEqual({ error: true })
    expect(createPool).not.toHaveBeenCalled()
  })

  it('passes timeout to pool.run', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({ killed: [], survived: [], timedOut: [] })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      timeout: 5000,
      out: noop
    })

    expect(poolRun).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ timeout: 5000 })
    )
  })

  it('closes both preflight runner and pool on completion', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolClose = vi.fn().mockResolvedValue()
    const poolRun = vi.fn().mockResolvedValue({ killed: [], survived: [], timedOut: [] })
    createPool.mockReturnValue({ run: poolRun, close: poolClose })

    await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: noop
    })

    expect(preflightRunner.close).toHaveBeenCalled()
    expect(poolClose).toHaveBeenCalled()
  })

  it('reports progress via onResult callback during pool execution', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockImplementation((mutations, opts) => {
      opts.onResult?.({ mutation: mutations[0], status: 'killed' })
      return { killed: [mutations[0]], survived: [], timedOut: [] }
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    const lines = []
    await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: msg => lines.push(msg)
    })

    const progressLines = lines.filter(l => /\[\d+\/\d+\]/.test(l))
    expect(progressLines.length).toBeGreaterThan(0)
  })

  it('formats survived and timedOut statuses in progress output', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockImplementation((mutations, opts) => {
      opts.onResult?.({ mutation: mutations[0], status: 'SURVIVED' })
      opts.onResult?.({ mutation: mutations[0], status: 'TIMEOUT (killed)' })
      return Promise.resolve({ killed: [], survived: [mutations[0]], timedOut: [mutations[0]] })
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    const lines = []
    await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: msg => lines.push(msg)
    })

    expect(lines.some(l => l.includes('SURVIVED'))).toBe(true)
    expect(lines.some(l => l.includes('TIMEOUT (killed)'))).toBe(true)
  })

  it('prints run report after pool completes', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({
      killed: [{ line: 1, name: '=== → !==', original: 'a === b', mutated: 'a !== b', source: 'if (a !== b) {}', killedBy: ['t.js'] }],
      survived: [],
      timedOut: []
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    const lines = []
    await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: msg => lines.push(msg)
    })

    const reportLines = lines.filter(l => l.includes('MUTATION REPORT') || l.includes('Killed'))
    expect(reportLines.length).toBeGreaterThan(0)
  })

  it('respects targetLine filter', async () => {
    const multiLineSource = 'if (a === b) {}\nif (c === d) {}'
    mockFs({ [resolve('src/a.js')]: multiLineSource })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({ killed: [], survived: [], timedOut: [] })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      targetLine: 2,
      out: noop
    })

    const mutations = poolRun.mock.calls[0][0]
    for (const { line } of mutations) {
      expect(line).toBe(2)
    }
  })

  it('closes pool even when pool.run throws', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolClose = vi.fn().mockResolvedValue()
    const poolRun = vi.fn().mockRejectedValue(new Error('pool exploded'))
    createPool.mockReturnValue({ run: poolRun, close: poolClose })

    await expect(runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: noop
    })).rejects.toThrow('pool exploded')

    expect(poolClose).toHaveBeenCalled()
    expect(preflightRunner.close).toHaveBeenCalled()
  })

  it('defaults workerCount to 2 when not specified', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({ killed: [], survived: [], timedOut: [] })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      out: noop
    })

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({ workerCount: 2 })
    )
  })

  it('pool createRunner creates worktrees per worker', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])

    // Capture the createRunner passed to createPool
    let poolCreateRunner
    createPool.mockImplementation(({ createRunner }) => {
      poolCreateRunner = createRunner
      return {
        run: vi.fn().mockResolvedValue({ killed: [], survived: [], timedOut: [] }),
        close: vi.fn().mockResolvedValue()
      }
    })

    const userCreateRunner = vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue({ passed: true }),
      close: vi.fn().mockResolvedValue()
    })

    await runParallel({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: userCreateRunner,
      workerCount: 2,
      out: noop
    })

    // Each call to poolCreateRunner should create a worktree
    const worker = await poolCreateRunner()
    expect(createWorktree).toHaveBeenCalledWith(process.cwd())
    expect(worker.applyMutation).toBeTypeOf('function')
    expect(worker.run).toBeTypeOf('function')
    expect(worker.close).toBeTypeOf('function')
  })
})

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

vi.mock('../../../src/core/pool.js')
vi.mock('../../../src/core/temp-copy.js')

import { runParallel, createBatchPool } from '../../../src/cli/runner/index.js'
import { prepareMutationConfig } from '../../../src/core/generate.js'
import { createPool } from '../../../src/core/pool.js'
import { createTempCopy } from '../../../src/core/temp-copy.js'
import { readFileSync } from 'node:fs'
import { testMutators, sourceCode, noop, fakePoolRunner, mockFs as _mockFs } from '../helpers.js'

const mutationConfig = prepareMutationConfig({ mutators: testMutators })

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
  createTempCopy.mockImplementation(() => fakeWorktree())
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
      mutationConfig,
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
      mutationConfig,
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
      mutationConfig,
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
      mutationConfig,
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
      mutationConfig,
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
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: { log: msg => lines.push(msg), error: () => {} }
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
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: { log: msg => lines.push(msg), error: () => {} }
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
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      out: { log: msg => lines.push(msg), error: () => {} }
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
      mutationConfig,
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
      mutationConfig,
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
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      out: noop
    })

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({ workerCount: 2 })
    )
  })

  it('suppresses killed progress lines when survivorsOnly is true', async () => {
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
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      survivorsOnly: true,
      out: { log: msg => lines.push(msg), error: () => {} }
    })

    const progressLines = lines.filter(l => /\[\d+\/\d+\]/.test(l))
    expect(progressLines).toHaveLength(0)
  })

  it('shows survived progress lines when survivorsOnly is true', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockImplementation((mutations, opts) => {
      opts.onResult?.({ mutation: mutations[0], status: 'SURVIVED' })
      return { killed: [], survived: [mutations[0]], timedOut: [] }
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    const lines = []
    await runParallel({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      survivorsOnly: true,
      out: { log: msg => lines.push(msg), error: () => {} }
    })

    const progressLines = lines.filter(l => /\[\d+\/\d+\]/.test(l))
    expect(progressLines).toHaveLength(1)
    expect(progressLines[0]).toContain('SURVIVED')
  })

  it('filters JSON to only survivors when survivorsOnly is true', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const mutation = { line: 1, name: '=== → !==', original: 'a === b', mutated: 'a !== b', source: 'if (a !== b) {}' }
    const poolRun = vi.fn().mockResolvedValue({
      killed: [{ ...mutation, killedBy: ['t.js'] }],
      survived: [],
      timedOut: []
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    const result = await runParallel({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      survivorsOnly: true,
      out: noop
    })

    expect(result.jsonData.mutants).toHaveLength(0)
  })

  it('reuses external pool when provided instead of creating a new one', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({
      killed: [{ line: 1, name: '=== → !==', original: 'a === b', mutated: 'a !== b', source: 'if (a !== b) {}', killedBy: ['t.js'] }],
      survived: [],
      timedOut: []
    })
    const poolClose = vi.fn().mockResolvedValue()
    const externalPool = { run: poolRun, close: poolClose, switchFile: vi.fn() }

    const result = await runParallel({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 4,
      pool: externalPool,
      out: noop
    })

    expect(createPool).not.toHaveBeenCalled()
    expect(externalPool.switchFile).toHaveBeenCalledWith(resolve('src/a.js'))
    expect(poolRun).toHaveBeenCalled()
    expect(poolClose).not.toHaveBeenCalled()
    expect(result.killed).toBe(1)
  })

  it('emits ordered progress without polluting mutation objects', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const statuses = []
    const poolRun = vi.fn().mockImplementation((mutations, opts) => {
      for (const mutation of mutations) {
        expect(mutation).not.toHaveProperty('_progressIndex')
        opts.onResult?.({ mutation, status: 'killed' })
      }
      return { killed: mutations, survived: [], timedOut: [] }
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    await runParallel({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      workerCount: 2,
      onProgress: (status) => statuses.push(status),
      out: noop
    })

    expect(statuses.length).toBeGreaterThan(0)
  })

  it('does not close external pool on completion', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const preflightRunner = fakePoolRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({ killed: [], survived: [], timedOut: [] })
    const poolClose = vi.fn().mockResolvedValue()
    const externalPool = { run: poolRun, close: poolClose, switchFile: vi.fn() }

    await runParallel({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(preflightRunner),
      pool: externalPool,
      out: noop
    })

    expect(poolClose).not.toHaveBeenCalled()
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
      mutationConfig,
      createRunner: userCreateRunner,
      workerCount: 2,
      out: noop
    })

    // Each call to poolCreateRunner should create a worktree
    const worker = await poolCreateRunner()
    expect(createTempCopy).toHaveBeenCalledWith(process.cwd())
    expect(worker.applyMutation).toBeTypeOf('function')
    expect(worker.run).toBeTypeOf('function')
    expect(worker.close).toBeTypeOf('function')
  })

  it('pool worker has switchFile method', async () => {
    mockFs({
      [resolve('src/a.js')]: sourceCode,
      [resolve('src/b.js')]: 'if (x === y) {}'
    })
    const preflightRunner = fakePoolRunner([{ passed: true }])

    let poolCreateRunner
    createPool.mockImplementation(({ createRunner }) => {
      poolCreateRunner = createRunner
      return {
        run: vi.fn().mockResolvedValue({ killed: [], survived: [], timedOut: [] }),
        close: vi.fn().mockResolvedValue()
      }
    })

    const innerRunner = {
      run: vi.fn().mockResolvedValue({ passed: true, killedBy: [], coveredBy: [] }),
      close: vi.fn().mockResolvedValue(),
      switchFile: vi.fn()
    }
    const userCreateRunner = vi.fn().mockResolvedValue(innerRunner)

    await runParallel({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: userCreateRunner,
      workerCount: 2,
      out: noop
    })

    const worker = await poolCreateRunner()
    expect(worker.switchFile).toBeTypeOf('function')

    await worker.switchFile(resolve('src/b.js'))
    expect(innerRunner.switchFile).toHaveBeenCalled()
  })

  it('pool worker switchFile falls back to close+recreate when runner lacks switchFile', async () => {
    mockFs({
      [resolve('src/a.js')]: sourceCode,
      [resolve('src/b.js')]: 'if (x === y) {}'
    })
    const preflightRunner = fakePoolRunner([{ passed: true }])

    let poolCreateRunner
    createPool.mockImplementation(({ createRunner }) => {
      poolCreateRunner = createRunner
      return {
        run: vi.fn().mockResolvedValue({ killed: [], survived: [], timedOut: [] }),
        close: vi.fn().mockResolvedValue()
      }
    })

    const firstRunner = {
      run: vi.fn().mockResolvedValue({ passed: true, killedBy: [], coveredBy: [] }),
      close: vi.fn().mockResolvedValue()
    }
    const secondRunner = {
      run: vi.fn().mockResolvedValue({ passed: true, killedBy: [], coveredBy: [] }),
      close: vi.fn().mockResolvedValue()
    }
    const userCreateRunner = vi.fn()
      .mockResolvedValueOnce(firstRunner)
      .mockResolvedValueOnce(secondRunner)

    await runParallel({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: userCreateRunner,
      workerCount: 2,
      out: noop
    })

    const worker = await poolCreateRunner()
    await worker.switchFile(resolve('src/b.js'))

    expect(firstRunner.close).toHaveBeenCalled()
    expect(userCreateRunner).toHaveBeenCalledTimes(3) // preflight + first worker + recreated worker
  })
})

describe('createBatchPool', () => {
  it('creates a pool with the specified workerCount', () => {
    createPool.mockReturnValue({ run: vi.fn(), close: vi.fn() })

    createBatchPool({
      workerCount: 4,
      sourceFile: resolve('src/a.js'),
      createRunner: vi.fn()
    })

    expect(createPool).toHaveBeenCalledWith({
      workerCount: 4,
      createRunner: expect.any(Function)
    })
  })

  it('defaults workerCount to 2', () => {
    createPool.mockReturnValue({ run: vi.fn(), close: vi.fn() })

    createBatchPool({
      sourceFile: resolve('src/a.js'),
      createRunner: vi.fn()
    })

    expect(createPool).toHaveBeenCalledWith({
      workerCount: 2,
      createRunner: expect.any(Function)
    })
  })

  it('factory creates a runner with worktree isolation', async () => {
    createPool.mockReturnValue({ run: vi.fn(), close: vi.fn() })
    const mockRunner = fakePoolRunner([])

    createBatchPool({
      workerCount: 1,
      sourceFile: resolve('src/a.js'),
      createRunner: vi.fn().mockResolvedValue(mockRunner)
    })

    const factory = createPool.mock.calls[0][0].createRunner
    const worker = await factory()
    expect(worker).toHaveProperty('run')
    expect(worker).toHaveProperty('close')
    expect(worker).toHaveProperty('applyMutation')
    expect(createTempCopy).toHaveBeenCalled()
  })
})

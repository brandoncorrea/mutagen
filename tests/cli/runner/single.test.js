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

vi.mock('../../../core/worktree.js')

import { runSingle } from '../../../cli/runner/index.js'
import { prepareMutationConfig } from '../../../core/generate.js'
import { createWorktree } from '../../../core/worktree.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { patterns, sourceCode, mockFs as _mockFs, noop } from '../helpers.js'

const mutationConfig = prepareMutationConfig({ patterns })

function mockFs(files) { _mockFs(readFileSync, files) }

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-test'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    cleanup: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  createWorktree.mockReturnValue(fakeWorktree())
})

describe('worktree-based mutation isolation', () => {
  it('creates a worktree for mutation isolation', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(createWorktree).toHaveBeenCalledWith(process.cwd())
  })

  it('writes mutations to temp file, not original source', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    // writeFileSync should write to the temp path, not the original
    const writeCalls = writeFileSync.mock.calls
    for (const [path] of writeCalls) {
      expect(path).toContain('/tmp/mutagen-test')
      expect(path).not.toBe(resolve('src/a.js'))
    }
  })

  it('passes temp root to createRunner', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined)
    }
    const createRunner = vi.fn().mockResolvedValue(runner)

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner,
      out: noop
    })

    expect(createRunner).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/mutagen-test'),
      expect.objectContaining({ root: '/tmp/mutagen-test' })
    )
  })

  it('cleans up worktree after completion', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined)
    }
    const wt = fakeWorktree()
    createWorktree.mockReturnValue(wt)

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(wt.cleanup).toHaveBeenCalled()
  })

  it('cleans up worktree even when runner throws', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockRejectedValueOnce(new Error('boom')),
      close: vi.fn().mockResolvedValue(undefined)
    }
    const wt = fakeWorktree()
    createWorktree.mockReturnValue(wt)

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(wt.cleanup).toHaveBeenCalled()
  })

  it('never writes to the original source file', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: true }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    // Original source file should never appear as a writeFileSync target
    const originalPath = resolve('src/a.js')
    for (const [path] of writeFileSync.mock.calls) {
      expect(path).not.toBe(originalPath)
    }
  })
})

describe('runSingle', () => {
  it('closes runner only after all mutations complete', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const events = []
    const runner = {
      run: vi.fn()
        .mockImplementationOnce(async () => {
          events.push('preflight')
          return { passed: true }
        })
        .mockImplementationOnce(() => new Promise(resolve => {
          setTimeout(() => {
            events.push('mutation-complete')
            resolve({ passed: false })
          }, 10)
        })),
      close: vi.fn().mockImplementation(async () => {
        events.push('close')
      })
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(events.indexOf('mutation-complete')).toBeLessThan(events.indexOf('close'))
  })

  it('classifies non-timeout errors as killed, not timed out', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockRejectedValueOnce(new Error('SIGTERM')),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const result = await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(result.killed).toBe(1)
    expect(result.timedOut).toBe(0)
  })
})

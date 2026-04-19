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

import { runSingle } from '../../../src/cli/runner/index.js'
import { reportMutation } from '../../../src/cli/runner/shared.js'
import { prepareMutationConfig } from '../../../src/core/generate.js'
import { createTempCopy } from '../../../src/core/temp-copy.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { testMutators, sourceCode, mockFs as _mockFs, noop } from '../helpers.js'

const mutationConfig = prepareMutationConfig({ mutators: testMutators })

function mockFs(files) { _mockFs(readFileSync, files) }

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-test'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    unresolve: vi.fn((path) => path.startsWith(tempRoot) ? path.replace(tempRoot, resolve('.')) : path),
    mapPaths: vi.fn(paths => paths?.map(p => p.startsWith(tempRoot) ? p.replace(tempRoot, resolve(".")) : p)),
    cleanup: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  createTempCopy.mockReturnValue(fakeWorktree())
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

    expect(createTempCopy).toHaveBeenCalledWith(process.cwd())
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
    createTempCopy.mockReturnValue(wt)

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
    createTempCopy.mockReturnValue(wt)

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

describe('--survivors-only output filtering', () => {
  it('suppresses killed mutation lines in text output when survivorsOnly is true', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const lines = []
    const out = { log: msg => lines.push(msg), error: () => {} }
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })   // preflight
        .mockResolvedValueOnce({ passed: false }),  // killed
      close: vi.fn().mockResolvedValue(undefined)
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      survivorsOnly: true,
      out
    })

    const perMutationLines = lines.filter(l => l.match(/^\[\d+\/\d+\]/))
    expect(perMutationLines).toHaveLength(0)
  })

  it('shows survived mutation lines when survivorsOnly is true', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const lines = []
    const out = { log: msg => lines.push(msg), error: () => {} }
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: true }),  // survived
      close: vi.fn().mockResolvedValue(undefined)
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      survivorsOnly: true,
      out
    })

    const perMutationLines = lines.filter(l => l.match(/^\[\d+\/\d+\]/))
    expect(perMutationLines).toHaveLength(1)
    expect(perMutationLines[0]).toContain('Survived')
  })

  it('filters JSON output to only survivors when survivorsOnly is true', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: true }),  // survived
      close: vi.fn().mockResolvedValue(undefined)
    }

    const result = await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      survivorsOnly: true,
      out: noop
    })

    expect(result.jsonData.mutants).toHaveLength(1)
    expect(result.jsonData.mutants[0].status).toBe('Survived')
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

  it('includes coveredBy on survived mutations from runner result', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: true, coveredBy: ['test/a.test.js'] }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const result = await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(result.jsonData.mutants[0].coveredBy).toEqual(['test/a.test.js'])
  })

  it('classifies timeout errors as timed out', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockRejectedValueOnce(new Error('Mutation timed out after 5000ms')),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const result = await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(result.timedOut).toBe(1)
  })

  it('suppresses timeout report with survivorsOnly', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockRejectedValueOnce(new Error('Mutation timed out after 5000ms')),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const lines = []
    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      survivorsOnly: true,
      out: { log: msg => lines.push(msg), error: () => {} }
    })

    expect(lines.some(l => l.includes('Timeout'))).toBe(false)
  })

  it('suppresses error report with survivorsOnly', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockRejectedValueOnce(new Error('SIGTERM')),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const lines = []
    await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      survivorsOnly: true,
      out: { log: msg => lines.push(msg), error: () => {} }
    })

    const progressLines = lines.filter(l => /^\[\d+\/\d+\]/.test(l))
    expect(progressLines).toHaveLength(0)
  })

  it('reportMutation omits id tag when mutation has no id', () => {
    const lines = []
    reportMutation({ log: msg => lines.push(msg), error: () => {} }, 3, { number: 1, line: 5, name: '=== → !==' }, 'killed')
    expect(lines[0]).toBe('[1/3] Line 5: === → !== ... killed')
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

  it('skips live preflight when runner has preflight.passed = true', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn().mockResolvedValue({ passed: false, killedBy: ['t.js'] }),
      close: vi.fn().mockResolvedValue(undefined),
      preflight: { passed: true }
    }

    const result = await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    // run() is called only for mutations, not preflight
    expect(runner.run).toHaveBeenCalledTimes(1)
    expect(result.killed).toBe(1)
  })

  it('aborts immediately when runner has preflight.passed = false', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
      preflight: { passed: false }
    }

    const lines = []
    const result = await runSingle({
      sourceFile: resolve('src/a.js'),
      mutationConfig,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: { log: msg => lines.push(msg), error: () => {} }
    })

    expect(result.error).toBe(true)
    expect(runner.run).not.toHaveBeenCalled()
    expect(lines.some(l => l.includes('ABORT'))).toBe(true)
  })
})

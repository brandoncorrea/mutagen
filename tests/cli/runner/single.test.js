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

import { runSingle } from '../../../cli/runner/index.js'
import { preparePatterns } from '../../../core/engine.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { patterns, sourceCode, mockFs as _mockFs, noop } from '../helpers.js'

const prepared = preparePatterns(patterns)

function mockFs(files) { _mockFs(readFileSync, files) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('in-memory mutant switching', () => {
  it('uses setMutant instead of writeFileSync when runner supports it', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined),
      setMutant: vi.fn(),
      clearMutant: vi.fn()
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(runner.setMutant).toHaveBeenCalledOnce()
    expect(runner.setMutant.mock.calls[0][0]).toContain('!==')
  })

  it('calls clearMutant after each mutation', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined),
      setMutant: vi.fn(),
      clearMutant: vi.fn()
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(runner.clearMutant).toHaveBeenCalledOnce()
  })

  it('does not write to disk when runner supports in-memory switching', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined),
      setMutant: vi.fn(),
      clearMutant: vi.fn()
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('falls back to writeFileSync when runner lacks setMutant', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(writeFileSync).toHaveBeenCalled()
  })

  it('calls clearMutant in finally block even when run throws', async () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })  // preflight
        .mockRejectedValueOnce(new Error('boom')),
      close: vi.fn().mockResolvedValue(undefined),
      setMutant: vi.fn(),
      clearMutant: vi.fn()
    }

    await runSingle({
      sourceFile: resolve('src/a.js'),
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(runner.clearMutant).toHaveBeenCalledOnce()
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
      prepared,
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
      prepared,
      createRunner: vi.fn().mockResolvedValue(runner),
      out: noop
    })

    expect(result.killed).toBe(1)
    expect(result.timedOut).toBe(0)
  })
})

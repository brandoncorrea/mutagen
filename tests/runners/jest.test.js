import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawn } from 'node:child_process'
import { createJestRunner } from '../../src/runners/jest.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}))

function fakeProcess(stdout, exitCode = 0) {
  const proc = {
    stdout: { on: vi.fn(), setEncoding: vi.fn() },
    stderr: { on: vi.fn(), setEncoding: vi.fn() },
    on: vi.fn(),
    kill: vi.fn()
  }

  proc.stdout.on.mockImplementation((event, cb) => {
    if (event === 'data') cb(stdout)
  })
  proc.stderr.on.mockImplementation((event, cb) => {
    if (event === 'data') cb('')
  })
  proc.on.mockImplementation((event, cb) => {
    if (event === 'close') cb(exitCode)
  })

  spawn.mockReturnValue(proc)
  return proc
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createJestRunner', () => {
  it('returns a runner with run and close', async () => {
    const runner = await createJestRunner('src/foo.js')
    expect(runner).toHaveProperty('run')
    expect(runner).toHaveProperty('close')
    expect(typeof runner.run).toBe('function')
    expect(typeof runner.close).toBe('function')
  })

  it('spawns jest with --json and --findRelatedTests', async () => {
    const json = JSON.stringify({
      success: true,
      testResults: [
        { testFilePath: '/app/test/a.test.js', status: 'passed' }
      ]
    })
    fakeProcess(json)

    const runner = await createJestRunner('src/foo.js')
    await runner.run()

    expect(spawn).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['jest', '--json', '--findRelatedTests', 'src/foo.js']),
      expect.any(Object)
    )
  })

  it('returns parsed results from run()', async () => {
    const json = JSON.stringify({
      success: true,
      testResults: [
        { testFilePath: '/app/test/a.test.js', status: 'passed' },
        { testFilePath: '/app/test/b.test.js', status: 'passed' }
      ]
    })
    fakeProcess(json)

    const runner = await createJestRunner('src/foo.js')
    const result = await runner.run()

    expect(result).toEqual({
      passed: true,
      killedBy: [],
      coveredBy: ['/app/test/a.test.js', '/app/test/b.test.js']
    })
  })

  it('returns failed results when tests fail', async () => {
    const json = JSON.stringify({
      success: false,
      testResults: [
        { testFilePath: '/app/test/a.test.js', status: 'failed' },
        { testFilePath: '/app/test/b.test.js', status: 'passed' }
      ]
    })
    fakeProcess(json, 1)

    const runner = await createJestRunner('src/foo.js')
    const result = await runner.run()

    expect(result).toEqual({
      passed: false,
      killedBy: ['/app/test/a.test.js'],
      coveredBy: ['/app/test/a.test.js', '/app/test/b.test.js']
    })
  })

  it('passes --config when config option provided', async () => {
    const json = JSON.stringify({ success: true, testResults: [] })
    fakeProcess(json)

    const runner = await createJestRunner('src/foo.js', {
      config: '/app/jest.config.js'
    })
    await runner.run()

    expect(spawn).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['--config', '/app/jest.config.js']),
      expect.any(Object)
    )
  })

  it('uses root as cwd when provided', async () => {
    const json = JSON.stringify({ success: true, testResults: [] })
    fakeProcess(json)

    const runner = await createJestRunner('src/foo.js', {
      root: '/app/project'
    })
    await runner.run()

    expect(spawn).toHaveBeenCalledWith(
      'npx',
      expect.any(Array),
      expect.objectContaining({ cwd: '/app/project' })
    )
  })

  it('close() kills active process', async () => {
    const proc = {
      stdout: { on: vi.fn(), setEncoding: vi.fn() },
      stderr: { on: vi.fn(), setEncoding: vi.fn() },
      on: vi.fn(),
      kill: vi.fn()
    }
    // Process never closes — simulates a hanging run
    proc.stdout.on.mockImplementation(() => {})
    proc.stderr.on.mockImplementation(() => {})
    proc.on.mockImplementation(() => {})
    spawn.mockReturnValue(proc)

    const runner = await createJestRunner('src/foo.js')
    runner.run() // start but don't await — it will hang
    // Flush microtasks so activeProc is set
    await new Promise(resolve => setImmediate(resolve))
    await runner.close()

    expect(proc.kill).toHaveBeenCalled()
  })

  it('close() is a no-op when no process is active', async () => {
    const runner = await createJestRunner('src/foo.js')
    await expect(runner.close()).resolves.not.toThrow()
  })

  it('does not include --config when config option omitted', async () => {
    const json = JSON.stringify({ success: true, testResults: [] })
    fakeProcess(json)

    const runner = await createJestRunner('src/foo.js')
    await runner.run()

    const args = spawn.mock.calls[0][1]
    expect(args).not.toContain('--config')
  })

  it('does not set cwd when root option omitted', async () => {
    const json = JSON.stringify({ success: true, testResults: [] })
    fakeProcess(json)

    const runner = await createJestRunner('src/foo.js')
    await runner.run()

    const opts = spawn.mock.calls[0][2]
    expect(opts.cwd).toBeUndefined()
  })

  it('passes both config and root together', async () => {
    const json = JSON.stringify({ success: true, testResults: [] })
    fakeProcess(json)

    const runner = await createJestRunner('src/foo.js', {
      config: '/app/jest.config.js',
      root: '/app/project'
    })
    await runner.run()

    expect(spawn).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['--config', '/app/jest.config.js']),
      expect.objectContaining({ cwd: '/app/project' })
    )
  })

  it('caps stdout buffer to prevent unbounded memory growth', async () => {
    const proc = {
      stdout: { on: vi.fn(), setEncoding: vi.fn() },
      stderr: { on: vi.fn(), setEncoding: vi.fn() },
      on: vi.fn(),
      kill: vi.fn()
    }

    let stdoutCb
    proc.stdout.on.mockImplementation((event, cb) => {
      if (event === 'data') stdoutCb = cb
    })
    proc.stderr.on.mockImplementation(() => {})
    proc.on.mockImplementation((event, cb) => {
      if (event === 'close') {
        const chunk = 'x'.repeat(1024 * 1024) // 1 MB
        for (let i = 0; i < 15; i++) stdoutCb(chunk)
        cb(0)
      }
    })
    spawn.mockReturnValue(proc)

    const runner = await createJestRunner('src/foo.js')
    const result = await runner.run()

    // stdout is invalid JSON after capping, so parse returns failed
    expect(result.passed).toBe(false)
  })

  it('caps stderr buffer to prevent unbounded memory growth', async () => {
    const proc = {
      stdout: { on: vi.fn(), setEncoding: vi.fn() },
      stderr: { on: vi.fn(), setEncoding: vi.fn() },
      on: vi.fn(),
      kill: vi.fn()
    }

    let stderrCb
    proc.stdout.on.mockImplementation((event, cb) => {
      if (event === 'data') cb('not json') // invalid → parse failure, stderr surfaces
    })
    proc.stderr.on.mockImplementation((event, cb) => {
      if (event === 'data') stderrCb = cb
    })
    proc.on.mockImplementation((event, cb) => {
      if (event === 'close') {
        const chunk = 'x'.repeat(1024 * 1024) // 1 MB
        for (let i = 0; i < 15; i++) stderrCb(chunk)
        cb(1)
      }
    })
    spawn.mockReturnValue(proc)

    const runner = await createJestRunner('src/foo.js')
    const result = await runner.run()

    expect(result.passed).toBe(false)
    // stderr should be capped at ~10 MB, not 15 MB
    expect(result.stderr.length).toBeLessThanOrEqual(11 * 1024 * 1024)
  })

  it('configures stdio to ignore stdin and pipe stdout/stderr', async () => {
    const json = JSON.stringify({ success: true, testResults: [] })
    fakeProcess(json)

    const runner = await createJestRunner('src/foo.js')
    await runner.run()

    const opts = spawn.mock.calls[0][2]
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'pipe'])
  })

  describe('error handling', () => {
    it('rejects when spawn emits error', async () => {
      const proc = {
        stdout: { on: vi.fn(), setEncoding: vi.fn() },
        stderr: { on: vi.fn(), setEncoding: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      }

      proc.stdout.on.mockImplementation(() => {})
      proc.stderr.on.mockImplementation(() => {})
      proc.on.mockImplementation((event, cb) => {
        if (event === 'error') cb(new Error('spawn ENOENT'))
      })

      spawn.mockReturnValue(proc)

      const runner = await createJestRunner('src/foo.js')
      await expect(runner.run()).rejects.toThrow('spawn ENOENT')
    })

    it('returns failed result when stdout is invalid JSON', async () => {
      fakeProcess('not valid json at all')

      const runner = await createJestRunner('src/foo.js')
      const result = await runner.run()
      expect(result.passed).toBe(false)
    })

    it('returns failed result when stdout is empty', async () => {
      fakeProcess('')

      const runner = await createJestRunner('src/foo.js')
      const result = await runner.run()
      expect(result.passed).toBe(false)
    })
  })

  describe('timeout handling', () => {
    it('run() blocks when process never closes (caller can timeout externally)', async () => {
      const proc = {
        stdout: { on: vi.fn(), setEncoding: vi.fn() },
        stderr: { on: vi.fn(), setEncoding: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      }

      // Process never emits 'close' or 'error'
      proc.stdout.on.mockImplementation(() => {})
      proc.stderr.on.mockImplementation(() => {})
      proc.on.mockImplementation(() => {})

      spawn.mockReturnValue(proc)

      const runner = await createJestRunner('src/foo.js')

      const result = await Promise.race([
        runner.run(),
        new Promise(resolve => setTimeout(() => resolve('BLOCKED'), 50))
      ])

      expect(result).toBe('BLOCKED')
    })
  })

  describe('multiple runs', () => {
    it('spawns a fresh process for each run() call', async () => {
      const json = JSON.stringify({ success: true, testResults: [] })
      fakeProcess(json)

      const runner = await createJestRunner('src/foo.js')
      await runner.run()
      await runner.run()

      expect(spawn).toHaveBeenCalledTimes(2)
    })
  })
})

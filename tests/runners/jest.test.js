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
  proc.stderr.on.mockImplementation(() => {})
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

  it('close() is a no-op', async () => {
    const runner = await createJestRunner('src/foo.js')
    await expect(runner.close()).resolves.toBeUndefined()
  })
})

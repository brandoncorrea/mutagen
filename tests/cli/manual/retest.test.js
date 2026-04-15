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

vi.mock('../../../src/core/worktree.js')
vi.mock('../../../src/core/pool.js')

import { createManualRunner as _createManualRunner } from '../../../src/cli/manual.js'
import { createWorktree } from '../../../src/core/worktree.js'
import { createPool } from '../../../src/core/pool.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { testMutators, sourceCode, fakeRunner, mockFs as _mockFs, noop } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-retest'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    mapPaths: vi.fn(paths => paths),
    cleanup: vi.fn()
  }
}

const survivorReport = JSON.stringify({
  score: 0,
  total: 1,
  killed: 0,
  survived: 1,
  timedOut: 0,
  files: {
    'src/a.js': { score: 0, killed: 0, total: 1 }
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
})

const noSurvivorReport = JSON.stringify({
  score: 100,
  total: 1,
  killed: 1,
  survived: 0,
  timedOut: 0,
  files: {},
  survivors: []
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  existsSync.mockReturnValue(false)
  createWorktree.mockReturnValue(fakeWorktree())
})

describe('createManualRunner --retest', () => {
  it('exits 0 when all survivors are now killed', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: sourceCode
    })

    const runner = fakeRunner([
      { passed: true },                           // preflight
      { passed: false, killedBy: ['t.test.js'] }  // killed
    ])

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json'])

    expect(exitCode).toBe(0)
  })

  it('exits 1 when survivors still survive', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: sourceCode
    })

    const runner = fakeRunner([
      { passed: true },  // preflight
      { passed: true }   // still surviving
    ])

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json'])

    expect(exitCode).toBe(1)
  })

  it('exits 0 when report has no survivors', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({ [reportPath]: noSurvivorReport })

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn()
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json'])

    expect(exitCode).toBe(0)
  })

  it('exits 1 when report file cannot be loaded', async () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn()
    })
    const exitCode = await manual.run(['--retest', 'reports/missing.json'])

    expect(exitCode).toBe(1)
  })

  it('exits 0 when survivor no longer exists in source (skipped)', async () => {
    const reportPath = resolve('reports/latest.json')
    // Source code changed so mutation no longer matches
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: 'const x = 42'  // no === to match
    })

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn()
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json'])

    expect(exitCode).toBe(0)
  })

  it('writes structured report when --json path is provided', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: sourceCode
    })

    const runner = fakeRunner([
      { passed: true },
      { passed: false, killedBy: ['t.test.js'] }
    ])

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    await manual.run(['--retest', 'reports/latest.json', '--json', 'reports/retest-out.json'])

    const reportCalls = writeFileSync.mock.calls.filter(
      ([p]) => p === resolve('reports/retest-out.json')
    )
    expect(reportCalls).toHaveLength(1)
    const report = JSON.parse(reportCalls[0][1])
    expect(report).toHaveProperty('score')
    expect(report).toHaveProperty('killed')
  })

  it('skips file when source is not found', async () => {
    const reportPath = resolve('reports/latest.json')
    readFileSync.mockImplementation((path) => {
      if (path === reportPath) return survivorReport
      throw new Error('ENOENT')
    })

    const lines = []
    const manual = _createManualRunner({
      out: msg => lines.push(msg),
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn()
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json'])

    expect(lines.some(l => l.includes('Skipping') && l.includes('not found'))).toBe(true)
    expect(exitCode).toBe(0)
  })

  it('reports preflight failure during retest', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: sourceCode
    })

    const runner = fakeRunner([
      { passed: false }  // preflight fails
    ])

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json'])

    expect(exitCode).toBe(1)
  })

  it('writes to default report path when --json flag has no path', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: sourceCode
    })

    const runner = fakeRunner([
      { passed: true },
      { passed: false, killedBy: ['t.test.js'] }
    ])

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    await manual.run(['--retest', 'reports/latest.json', '--json'])

    const defaultCalls = writeFileSync.mock.calls.filter(
      ([p]) => p === resolve('reports/mutation/retest-report.json')
    )
    expect(defaultCalls).toHaveLength(1)
  })

  it('uses --parallel flag during retest', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: sourceCode
    })

    const preflightRunner = fakeRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({
      killed: [{ line: 1, name: '=== → !==', original: 'a === b', mutated: 'a !== b', source: 'if (a !== b) {}', killedBy: ['t.js'] }],
      survived: [],
      timedOut: []
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(preflightRunner)
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json', '--parallel', '2'])

    expect(exitCode).toBe(0)
    expect(createPool).toHaveBeenCalled()
  })

  it('uses default worker count when --parallel has no number', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: sourceCode
    })

    const preflightRunner = fakeRunner([{ passed: true }])
    const poolRun = vi.fn().mockResolvedValue({
      killed: [{ line: 1, name: '=== → !==', original: 'a === b', mutated: 'a !== b', source: 'if (a !== b) {}', killedBy: ['t.js'] }],
      survived: [],
      timedOut: []
    })
    createPool.mockReturnValue({ run: poolRun, close: vi.fn().mockResolvedValue() })

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(preflightRunner)
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json', '--parallel'])

    expect(exitCode).toBe(0)
  })

  it('respects --timeout flag', async () => {
    const reportPath = resolve('reports/latest.json')
    mockFs({
      [reportPath]: survivorReport,
      [resolve('src/a.js')]: sourceCode
    })

    const runner = fakeRunner([{ passed: true }])
    runner.run.mockResolvedValueOnce({ passed: true })  // preflight
      .mockRejectedValue(new Error('Mutation timed out after 100ms'))

    const manual = createManualRunner({
      mutators: testMutators, sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    const exitCode = await manual.run(['--retest', 'reports/latest.json', '--timeout', '100'])

    // Timeout counts as killed, so exit 0
    expect(exitCode).toBe(0)
  })
})

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

import { createManualRunner as _createManualRunner } from '../../../src/cli/manual.js'
import { createTempCopy } from '../../../src/core/temp-copy.js'
import { readFileSync, existsSync } from 'node:fs'
import { testMutators, sourceCode, fakeRunner, mockFs as _mockFs, noop } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-test'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    mapPaths: vi.fn(paths => paths),
    cleanup: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  existsSync.mockReturnValue(false)
  createTempCopy.mockReturnValue(fakeWorktree())
})

describe('createManualRunner', () => {
  describe('run (CLI dispatch) — core', () => {
    it('returns 0 when single-file mutation kills all mutants', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(0)
    })

    it('returns 1 when mutations survive', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: true } // survived
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(1)
    })

    it('returns 0 for --help', async () => {
      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--help'])

      expect(code).toBe(0)
    })

    it('returns 1 for missing arguments', async () => {
      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run([])

      expect(code).toBe(1)
    })

    it('returns 1 for --diff without file args', async () => {
      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff'])

      expect(code).toBe(1)
    })

    it('runs --all batch mode and returns exit code', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['--all'])

      expect(code).toBe(0)
    })

    it('runs --incremental mode and returns exit code', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      existsSync.mockReturnValue(false)
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['--incremental'])

      expect(code).toBe(0)
    })

    it('parses --line and --timeout flags', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js', '--line', '99', '--timeout', '5000'])

      expect(code).toBe(0)
    })

    it('returns 1 when preflight fails in single-file mode', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: false }])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(1)
    })

    it('uses config timeout when CLI does not specify one', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        timeout: 3000,
        out: { log: msg => lines.push(msg), error: () => {} }
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(0)
      expect(lines.join('\n')).toContain('Timeout: 3000ms')
    })

    it('returns 0 with --min-score when source has no mutable code', async () => {
      mockFs({ [resolve('src/a.js')]: 'const x = 42' })
      const runner = fakeRunner([{ passed: true }])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js', '--min-score', '100'])

      expect(code).toBe(0)
    })

    it('main() calls process.exit with run() result', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
      const originalArgv = process.argv
      process.argv = ['node', 'script', 'src/a.js']

      await manual.main()

      expect(exitSpy).toHaveBeenCalledWith(0)

      process.argv = originalArgv
      exitSpy.mockRestore()
    })
  })

  describe('exit code clamping', () => {
    it('returns 1 (not raw count) when multiple mutations survive in single-file mode', async () => {
      const multiSource = 'if (a === b && c === d) {}'
      mockFs({ [resolve('src/a.js')]: multiSource })
      const runner = fakeRunner([
        { passed: true },
        { passed: true },
        { passed: true },
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(1)
    })

    it('returns 1 (not raw count) when --all has multiple survivors', async () => {
      const multiSource = 'if (a === b && c === d) {}'
      mockFs({ [resolve('src/a.js')]: multiSource })
      const runner = fakeRunner([
        { passed: true },
        { passed: true },
        { passed: true },
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['--all'])

      expect(code).toBe(1)
    })

    it('returns 1 (not raw count) when --incremental has multiple survivors', async () => {
      const multiSource = 'if (a === b && c === d) {}'
      mockFs({ [resolve('src/a.js')]: multiSource })
      existsSync.mockReturnValue(false)
      const runner = fakeRunner([
        { passed: true },
        { passed: true },
        { passed: true },
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['--incremental'])

      expect(code).toBe(1)
    })

    it('returns 1 when --all has both survivors and failures', async () => {
      mockFs({
        [resolve('src/a.js')]: sourceCode,
        [resolve('src/b.js')]: sourceCode
      })
      const failRunner = fakeRunner([{ passed: false }])
      const surviveRunner = fakeRunner([
        { passed: true },
        { passed: true }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn()
          .mockResolvedValueOnce(failRunner)
          .mockResolvedValueOnce(surviveRunner)
      })
      const code = await manual.run(['--all'])

      expect(code).toBe(1)
    })

    it('returns 1 when --incremental has both survivors and failures', async () => {
      mockFs({
        [resolve('src/a.js')]: sourceCode,
        [resolve('src/b.js')]: sourceCode
      })
      existsSync.mockReturnValue(false)
      const failRunner = fakeRunner([{ passed: false }])
      const surviveRunner = fakeRunner([
        { passed: true },
        { passed: true }
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn()
          .mockResolvedValueOnce(failRunner)
          .mockResolvedValueOnce(surviveRunner)
      })
      const code = await manual.run(['--incremental'])

      expect(code).toBe(1)
    })
  })

  describe('out default', () => {
    it('defaults to console.log when out is not provided', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const manual = _createManualRunner({
        mutators: testMutators, sources: [],
        createRunner: vi.fn()
      })
      await manual.run(['--help'])
      expect(logSpy).toHaveBeenCalled()
      logSpy.mockRestore()
    })
  })
})

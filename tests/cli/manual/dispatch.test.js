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
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { testMutators, sourceCode, fakeRunner, mockFs as _mockFs, noop, hashOf } from '../helpers.js'

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
  describe('run (CLI dispatch)', () => {
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

    it('runs dry-run mode: shows mutations grouped by line, no tests run', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const lines = []
      const createRunner = vi.fn()

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'], createRunner,
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['src/a.js', '--dry-run'])

      expect(code).toBe(0)
      expect(createRunner).not.toHaveBeenCalled()
      const output = lines.join('\n')
      expect(output).toContain('DRY RUN')
      expect(output).toContain('L1:')
      expect(output).toContain('Total: 1 mutations')
    })

    it('dry-run filters to target line', async () => {
      mockFs({ [resolve('src/a.js')]: 'line1\nif (a === b) {}' })
      const lines = []

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'], createRunner: vi.fn(),
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['src/a.js', '--dry-run', '--line', '1'])

      expect(code).toBe(0)
      expect(lines.join('\n')).toContain('Total: 0 mutations')
    })

    it('runs batch dry-run across all sources', async () => {
      mockFs({
        [resolve('src/a.js')]: sourceCode,
        [resolve('src/b.js')]: 'if (x === y) {}'
      })
      const lines = []
      const createRunner = vi.fn()

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js', 'src/b.js'], createRunner,
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['--all', '--dry-run'])

      expect(code).toBe(0)
      expect(createRunner).not.toHaveBeenCalled()
      expect(lines.join('\n')).toContain('Grand total: 2 mutations across 2 files')
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
        // no mutations on line 99, so nothing to kill
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js', '--line', '99', '--timeout', '5000'])

      expect(code).toBe(0)
    })

    it('runs --diff mode and returns 0 when no regressions', async () => {
      const report = JSON.stringify({
        files: {
          'a.js': {
            mutants: [{
              id: 'm1', mutatorName: 'x', status: 'Killed',
              location: { start: { line: 1 } }, replacement: 'y'
            }]
          }
        }
      })
      mockFs({
        [resolve('before.json')]: report,
        [resolve('after.json')]: report
      })

      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'before.json', 'after.json'])

      expect(code).toBe(0)
    })

    it('runs --diff mode and returns 1 when regressions found', async () => {
      const before = JSON.stringify({
        files: {
          'a.js': {
            mutants: [{
              id: 'm1', mutatorName: 'x', status: 'Killed',
              location: { start: { line: 1 } }, replacement: 'y'
            }]
          }
        }
      })
      const after = JSON.stringify({
        files: {
          'a.js': {
            mutants: [{
              id: 'm1', mutatorName: 'x', status: 'Survived',
              location: { start: { line: 1 } }, replacement: 'y'
            }]
          }
        }
      })
      mockFs({
        [resolve('before.json')]: before,
        [resolve('after.json')]: after
      })

      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'before.json', 'after.json'])

      expect(code).toBe(1)
    })

    it('returns 1 when --diff report file is unreadable', async () => {
      readFileSync.mockImplementation(() => { throw new Error('ENOENT') })

      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'missing.json', 'also-missing.json'])

      expect(code).toBe(1)
    })

    it('returns 1 (not raw count) when multiple mutations survive in single-file mode', async () => {
      const multiSource = 'if (a === b && c === d) {}'
      mockFs({ [resolve('src/a.js')]: multiSource })
      const runner = fakeRunner([
        { passed: true },   // preflight
        { passed: true },   // mutation 1 survived
        { passed: true },   // mutation 2 survived
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
        { passed: true },   // preflight
        { passed: true },   // mutation 1 survived
        { passed: true },   // mutation 2 survived
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
        { passed: true },   // preflight
        { passed: true },   // mutation 1 survived
        { passed: true },   // mutation 2 survived
      ])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['--incremental'])

      expect(code).toBe(1)
    })

    it('returns 1 (not raw count) when --diff finds multiple regressions', async () => {
      const before = JSON.stringify({
        files: {
          'a.js': {
            mutants: [
              { id: 'm1', mutatorName: 'x', status: 'Killed', location: { start: { line: 1 } }, replacement: 'y' },
              { id: 'm2', mutatorName: 'x', status: 'Killed', location: { start: { line: 2 } }, replacement: 'z' }
            ]
          }
        }
      })
      const after = JSON.stringify({
        files: {
          'a.js': {
            mutants: [
              { id: 'm1', mutatorName: 'x', status: 'Survived', location: { start: { line: 1 } }, replacement: 'y' },
              { id: 'm2', mutatorName: 'x', status: 'Survived', location: { start: { line: 2 } }, replacement: 'z' }
            ]
          }
        }
      })
      mockFs({
        [resolve('before.json')]: before,
        [resolve('after.json')]: after
      })

      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'before.json', 'after.json'])

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

    it('returns 1 when preflight fails in single-file mode', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: false }]) // preflight fails

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(1)
    })

    it('--quiet with preflight failure produces numeric stats, not NaN', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: false }]) // preflight fails

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['src/a.js', '--quiet'])

      const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).not.toContain('NaN')
      expect(stderrOutput).not.toContain('undefined')
      expect(stderrOutput).toContain('(0/0) | 0 survivors')

      stderrSpy.mockRestore()
    })

    it('--quiet with killed mutations shows correct killed count in stats', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['src/a.js', '--quiet'])

      const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).toContain('(1/1) | 0 survivors')

      stderrSpy.mockRestore()
    })

    it('--quiet with surviving mutations shows correct survived count in stats', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: true } // survived
      ])

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.run(['src/a.js', '--quiet'])

      const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).toContain('(0/1) | 1 survivors')

      stderrSpy.mockRestore()
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

    it('non-quiet run does not write formatQuietSummary to stderr', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: noop
      })
      const code = await manual.run(['src/a.js'])

      const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).not.toMatch(/Score:.*\|.*survivors/)

      stderrSpy.mockRestore()
    })

    it('--quiet suppresses normal output and writes summary to stderr', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: true } // survived
      ])

      const lines = []
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['src/a.js', '--quiet'])

      // Normal output should be suppressed
      expect(lines).toEqual([])
      // Summary should go to stderr
      expect(stderrSpy).toHaveBeenCalled()
      const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).toMatch(/^Score: \d+\.\d+% \(\d+\/\d+\) \| \d+ survivors \| \d+ files\n$/)

      stderrSpy.mockRestore()
    })

    it('--quiet in batch mode writes summary to stderr', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['--all', '--quiet'])

      expect(lines).toEqual([])
      expect(stderrSpy).toHaveBeenCalled()
      const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).toContain('Score:')
      expect(stderrOutput).toContain('| 1 files')

      stderrSpy.mockRestore()
    })

    it('--quiet still returns correct exit code', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: true } // survived
      ])

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: noop
      })
      const code = await manual.run(['src/a.js', '--quiet'])

      expect(code).toBe(1) // survived, so exit 1
      stderrSpy.mockRestore()
    })

    it('--dry-run --quiet outputs just mutation count summary to stderr', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const lines = []
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn(),
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['src/a.js', '--dry-run', '--quiet'])

      expect(lines).toEqual([])
      expect(stderrSpy).toHaveBeenCalled()
      const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).toBe('1 mutations across 1 files\n')
      expect(code).toBe(0)

      stderrSpy.mockRestore()
    })

    it('--all --dry-run --quiet outputs just mutation count summary to stderr', async () => {
      mockFs({
        [resolve('src/a.js')]: sourceCode,
        [resolve('src/b.js')]: 'if (x === y) {}'
      })
      const lines = []
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn(),
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['--all', '--dry-run', '--quiet'])

      expect(lines).toEqual([])
      expect(stderrSpy).toHaveBeenCalled()
      const stderrOutput = stderrSpy.mock.calls.map(c => c[0]).join('')
      expect(stderrOutput).toBe('2 mutations across 2 files\n')
      expect(code).toBe(0)

      stderrSpy.mockRestore()
    })

    it('passes --survivors-only through to text output filtering in single mode', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      await manual.run(['src/a.js', '--survivors-only'])

      const perMutationLines = lines.filter(l => l.match(/^\[\d+\/\d+\]/))
      expect(perMutationLines).toHaveLength(0)
    })

    it('passes --survivors-only through to text output filtering in --all mode', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      await manual.run(['--all', '--survivors-only'])

      const perMutationLines = lines.filter(l => l.match(/^\[\d+\/\d+\]/))
      expect(perMutationLines).toHaveLength(0)
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
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(0)
      expect(lines.join('\n')).toContain('Timeout: 3000ms')
    })

    it('returns 0 with --min-score when source has no mutable code', async () => {
      mockFs({ [resolve('src/a.js')]: 'const x = 42' }) // no === to mutate
      const runner = fakeRunner([{ passed: true }])

      const manual = createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js', '--min-score', '100'])

      expect(code).toBe(0)
    })
  })
})

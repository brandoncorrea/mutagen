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

import { createManualRunner as _createManualRunner } from '../../../cli/manual.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { patterns, sourceCode, fakeRunner, mockFs as _mockFs, noop, hashOf } from './helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  existsSync.mockReturnValue(false)
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
        patterns, sources: ['src/a.js'],
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
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(1)
    })

    it('returns 1 for missing arguments', async () => {
      const manual = createManualRunner({
        patterns, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run([])

      expect(code).toBe(1)
    })

    it('returns 1 for --diff without file args', async () => {
      const manual = createManualRunner({
        patterns, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff'])

      expect(code).toBe(1)
    })

    it('runs dry-run mode: shows mutations grouped by line, no tests run', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const lines = []
      const createRunner = vi.fn()

      const manual = _createManualRunner({
        patterns, sources: ['src/a.js'], createRunner,
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
        patterns, sources: ['src/a.js'], createRunner: vi.fn(),
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
        patterns, sources: ['src/a.js', 'src/b.js'], createRunner,
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
        patterns, sources: ['src/a.js'],
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
        patterns, sources: ['src/a.js'],
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
        patterns, sources: ['src/a.js'],
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
        patterns, sources: [], createRunner: vi.fn()
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
        patterns, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'before.json', 'after.json'])

      expect(code).toBe(1)
    })

    it('returns 1 when --diff report file is unreadable', async () => {
      readFileSync.mockImplementation(() => { throw new Error('ENOENT') })

      const manual = createManualRunner({
        patterns, sources: [], createRunner: vi.fn()
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
        patterns, sources: ['src/a.js'],
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
        patterns, sources: ['src/a.js'],
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
        patterns, sources: ['src/a.js'],
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
        patterns, sources: [], createRunner: vi.fn()
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
        patterns, sources: ['src/a.js', 'src/b.js'],
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
        patterns, sources: ['src/a.js', 'src/b.js'],
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
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(1)
    })

    it('main() calls process.exit with run() result', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
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

    it('uses config timeout when CLI does not specify one', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        timeout: 3000,
        out: msg => lines.push(msg)
      })
      const code = await manual.run(['src/a.js'])

      expect(code).toBe(0)
      expect(lines.join('\n')).toContain('Timeout: 3000ms')
    })
  })
})

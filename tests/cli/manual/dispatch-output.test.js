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
  describe('dry-run mode', () => {
    it('shows mutations grouped by line, no tests run', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const lines = []
      const createRunner = vi.fn()

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'], createRunner,
        out: { log: msg => lines.push(msg), error: () => {} }
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
        out: { log: msg => lines.push(msg), error: () => {} }
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
        out: { log: msg => lines.push(msg), error: () => {} }
      })
      const code = await manual.run(['--all', '--dry-run'])

      expect(code).toBe(0)
      expect(createRunner).not.toHaveBeenCalled()
      expect(lines.join('\n')).toContain('Grand total: 2 mutations across 2 files')
    })

    it('--dry-run --quiet outputs just mutation count summary to out.error', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const lines = []
      const errors = []

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn(),
        out: { log: msg => lines.push(msg), error: msg => errors.push(msg) }
      })
      const code = await manual.run(['src/a.js', '--dry-run', '--quiet'])

      expect(lines).toEqual([])
      expect(errors.length).toBeGreaterThan(0)
      const errorOutput = errors.join('')
      expect(errorOutput).toBe('1 mutations across 1 file\n')
      expect(code).toBe(0)
    })

    it('--all --dry-run --quiet outputs just mutation count summary to out.error', async () => {
      mockFs({
        [resolve('src/a.js')]: sourceCode,
        [resolve('src/b.js')]: 'if (x === y) {}'
      })
      const lines = []
      const errors = []

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn(),
        out: { log: msg => lines.push(msg), error: msg => errors.push(msg) }
      })
      const code = await manual.run(['--all', '--dry-run', '--quiet'])

      expect(lines).toEqual([])
      expect(errors.length).toBeGreaterThan(0)
      const errorOutput = errors.join('')
      expect(errorOutput).toBe('2 mutations across 2 files\n')
      expect(code).toBe(0)
    })

    it('--all --dry-run --quiet uses singular "file" for single source', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const errors = []

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn(),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      await manual.run(['--all', '--dry-run', '--quiet'])

      expect(errors.join('')).toBe('1 mutations across 1 file\n')
    })
  })

  describe('--quiet mode', () => {
    it('with preflight failure produces numeric stats, not NaN', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([{ passed: false }])

      const errors = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      await manual.run(['src/a.js', '--quiet'])

      const errorOutput = errors.join('')
      expect(errorOutput).not.toContain('NaN')
      expect(errorOutput).not.toContain('undefined')
      expect(errorOutput).toContain('(0/0) | 0 survivors')
    })

    it('with killed mutations shows correct killed count in stats', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const errors = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      await manual.run(['src/a.js', '--quiet'])

      const errorOutput = errors.join('')
      expect(errorOutput).toContain('(1/1) | 0 survivors')
    })

    it('with surviving mutations shows correct survived count in stats', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: true }
      ])

      const errors = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      await manual.run(['src/a.js', '--quiet'])

      const errorOutput = errors.join('')
      expect(errorOutput).toContain('(0/1) | 1 survivors')
    })

    it('suppresses normal output and writes summary to stderr', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: true }
      ])

      const lines = []
      const errors = []

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: msg => lines.push(msg), error: msg => errors.push(msg) }
      })
      const code = await manual.run(['src/a.js', '--quiet'])

      expect(lines).toEqual([])
      expect(errors.length).toBeGreaterThan(0)
      const errorOutput = errors.join('')
      expect(errorOutput).toMatch(/^Score: \d+\.\d+% \(\d+\/\d+\) \| \d+ survivors \| \d+ files\n$/)
    })

    it('still returns correct exit code', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: true }
      ])

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: noop
      })
      const code = await manual.run(['src/a.js', '--quiet'])

      expect(code).toBe(1)
    })

    it('in batch mode writes summary to out.error', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const errors = []

      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: msg => lines.push(msg), error: msg => errors.push(msg) }
      })
      const code = await manual.run(['--all', '--quiet'])

      expect(lines).toEqual([])
      expect(errors.length).toBeGreaterThan(0)
      const errorOutput = errors.join('')
      expect(errorOutput).toContain('Score:')
      expect(errorOutput).toContain('| 1 files')
    })
  })

  describe('non-quiet run', () => {
    it('does not write formatQuietSummary to stderr', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const errors = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      const code = await manual.run(['src/a.js'])

      const errorOutput = errors.join('')
      expect(errorOutput).not.toMatch(/Score:.*\|.*survivors/)
    })
  })

  describe('--progress mode', () => {
    it('streams dots to stderr in single-file mode', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])

      const errors = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      await manual.run(['src/a.js', '--progress'])

      const errorOutput = errors.join('')
      expect(errorOutput).toContain('.')
      expect(errorOutput).toMatch(/\d+ files \| \d+ mutations \| \d+ killed \| \d+ survived \| [\d.]+%/)
    })

    it('shows ! for survived mutations', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: true }
      ])

      const errors = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      await manual.run(['src/a.js', '--progress'])

      const errorOutput = errors.join('')
      expect(errorOutput).toContain('!')
    })

    it('suppresses per-mutation verbose output', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: msg => lines.push(msg), error: () => {} }
      })
      await manual.run(['src/a.js', '--progress'])

      expect(lines).toEqual([])
    })

    it('in batch mode shows dots per file', async () => {
      mockFs({
        [resolve('src/a.js')]: sourceCode,
        [resolve('src/b.js')]: 'if (x === y) {}'
      })
      const runner = fakeRunner([
        { passed: true }, { passed: false },
        { passed: true }, { passed: false }
      ])

      const errors = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      await manual.run(['--all', '--progress'])

      const errorOutput = errors.join('')
      expect(errorOutput).toContain('src/a.js')
      expect(errorOutput).toContain('src/b.js')
      expect(errorOutput).toContain('.')
      expect(errorOutput).toMatch(/2 files \|/)
    })

    it('does not show quiet summary when --quiet is not set', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const errors = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: () => {}, error: msg => errors.push(msg) }
      })
      await manual.run(['src/a.js', '--progress'])

      const errorOutput = errors.join('')
      expect(errorOutput).not.toMatch(/^Score:/)
      expect(errorOutput).toMatch(/\d+ mutations/)
    })
  })

  describe('--survivors-only', () => {
    it('filters output in single mode', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: msg => lines.push(msg), error: () => {} }
      })
      await manual.run(['src/a.js', '--survivors-only'])

      const perMutationLines = lines.filter(l => l.match(/^\[\d+\/\d+\]/))
      expect(perMutationLines).toHaveLength(0)
    })

    it('filters output in --all mode', async () => {
      mockFs({ [resolve('src/a.js')]: sourceCode })
      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])

      const lines = []
      const manual = _createManualRunner({
        mutators: testMutators, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: { log: msg => lines.push(msg), error: () => {} }
      })
      await manual.run(['--all', '--survivors-only'])

      const perMutationLines = lines.filter(l => l.match(/^\[\d+\/\d+\]/))
      expect(perMutationLines).toHaveLength(0)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../src/cli/args.js'

function expectErrorResult(...args) {
  const result = parseArgs(args)
  expect(result).toHaveProperty('error')
}

describe('parseArgs', () => {
  describe('--help flag', () => {
    it('returns usage message for --help', () => {
      const result = parseArgs(['--help'])
      expect(result.help).toContain('Usage:')
      expect(result).not.toHaveProperty('error')
    })

    it('returns usage message for -h', () => {
      const result = parseArgs(['-h'])
      expect(result.help).toContain('Usage:')
    })

    it('returns usage even when combined with other flags', () => {
      const result = parseArgs(['--all', '--help'])
      expect(result.help).toContain('Usage:')
    })

    it('includes flag descriptions', () => {
      const result = parseArgs(['--help'])
      expect(result.help).toContain('--line N')
      expect(result.help).toContain('--json')
      expect(result.help).toContain('--dry-run')
      expect(result.help).toContain('--timeout N')
      expect(result.help).toContain('--parallel')
      expect(result.help).toContain('--quiet')
      expect(result.help).toContain('--survivors-only')
      expect(result.help).toContain('--min-score N')
      expect(result.help).toContain('--changed')
      // Each flag should have a description after it
      expect(result.help).toMatch(/--timeout N\s+.+/)
      expect(result.help).toMatch(/--parallel\s+.+/)
      expect(result.help).toMatch(/--quiet\s+.+/)
    })

    it('includes mode explanations', () => {
      const result = parseArgs(['--help'])
      expect(result.help).toContain('Modes:')
      expect(result.help).toMatch(/--all\s+.+/)
      expect(result.help).toMatch(/--incremental\s+.+/)
      expect(result.help).toMatch(/--retest\s+.+/)
      expect(result.help).toMatch(/--diff\s+.+/)
    })

    it('includes exit code documentation', () => {
      const result = parseArgs(['--help'])
      expect(result.help).toContain('Exit codes:')
      expect(result.help).toContain('0')
      expect(result.help).toContain('1')
    })
  })

  describe('unknown flags', () => {
    it('does not treat unknown flags as source files', () => {
      const result = parseArgs(['--typo'])
      expect(result.error).toContain('Usage:')
    })

    it('does not treat unknown flags as source files alongside valid args', () => {
      const result = parseArgs(['source.js', '--unknown'])
      expect(result.sourceFile).toContain('source.js')
      // --unknown is silently ignored, not treated as a second source file
    })
  })

  describe('--diff mode', () => {
    it('returns error when only one file provided after --diff', () =>
      expectErrorResult('--diff', 'before.json'))

    it('returns error when no files provided after --diff', () =>
      expectErrorResult('--diff'))

    it('parses both files when two are provided after --diff', () => {
      const result = parseArgs(['--diff', 'before.json', 'after.json'])
      expect(result.diffMode).toBe(true)
      expect(result.beforeFile).toContain('before.json')
      expect(result.afterFile).toContain('after.json')
    })

    it('parses --json flag in diff mode', () => {
      const result = parseArgs(['--diff', 'before.json', 'after.json', '--json'])
      expect(result.diffMode).toBe(true)
      expect(result.jsonOutput).toBe(true)
    })

    it('defaults jsonOutput to false when --json is absent in diff mode', () => {
      const result = parseArgs(['--diff', 'before.json', 'after.json'])
      expect(result.jsonOutput).toBeFalsy()
    })
  })

  describe('--timeout flag', () => {
    it('parses timeout in --incremental mode', () => {
      const result = parseArgs(['--incremental', '--timeout', '5000'])
      expect(result.timeout).toBe(5000)
    })

    it('parses timeout in --all mode', () => {
      const result = parseArgs(['--all', '--timeout', '3000'])
      expect(result.timeout).toBe(3000)
    })

    it('returns undefined timeout when flag is absent', () => {
      const result = parseArgs(['--incremental'])
      expect(result.timeout).toBeUndefined()
    })

    it('returns error when --timeout is last arg with no value (incremental)', () =>
      expectErrorResult('--incremental', '--timeout'))

    it('returns error when --timeout is last arg with no value (all)', () =>
      expectErrorResult('--all', '--timeout'))

    it('returns error when --timeout is last arg with no value (source file)', () =>
      expectErrorResult('source.js', '--timeout'))

    it('includes "positive" in --timeout error message', () => {
      const result = parseArgs(['--incremental', '--timeout', 'abc'])
      expect(result.error).toContain('positive')
    })

    it('returns error when --timeout value is non-numeric', () =>
      expectErrorResult('--incremental', '--timeout', 'abc'))

    it('returns error when --timeout value is negative', () =>
      expectErrorResult('--incremental', '--timeout', '-1'))

    it('returns error when --timeout is 0', () =>
      expectErrorResult('--incremental', '--timeout', '0'))
  })

  describe('--line flag', () => {
    it('returns error when --line is last arg with no value', () =>
      expectErrorResult('source.js', '--line'))

    it('returns error when --line value is non-numeric', () =>
      expectErrorResult('source.js', '--line', 'abc'))

    it('returns error when --line value is negative', () =>
      expectErrorResult('source.js', '--line', '-5'))

    it('parses --line with a valid numeric value', () => {
      const result = parseArgs(['source.js', '--line', '42'])
      expect(result.targetLine).toBe(42)
    })

    it('accepts --line 0 as valid', () => {
      const result = parseArgs(['source.js', '--line', '0'])
      expect(result.targetLine).toBe(0)
      expect(result).not.toHaveProperty('error')
    })
  })

  describe('error message content', () => {
    it('returns usage message containing flag names when no source file given', () => {
      const result = parseArgs([])
      expect(result.error).toContain('--line')
      expect(result.error).toContain('--json')
      expect(result.error).toContain('--dry-run')
      expect(result.error).toContain('--timeout')
      expect(result.error).toContain('--all')
      expect(result.error).toContain('--incremental')
    })

    it('returns diff usage message containing --diff flag', () => {
      const result = parseArgs(['--diff'])
      expect(result.error).toContain('--diff')
      expect(result.error).toContain('<before.json>')
      expect(result.error).toContain('<after.json>')
    })

    it('diff error message uses npx mutagen as command prefix', () => {
      const result = parseArgs(['--diff'])
      expect(result.error).toContain('npx mutagen')
      expect(result.error).not.toContain('<script>')
    })

    it('retest error message uses npx mutagen as command prefix', () => {
      const result = parseArgs(['--retest'])
      expect(result.error).toContain('npx mutagen')
      expect(result.error).not.toContain('<script>')
    })
  })

  describe('--parallel flag', () => {
    it('accepts --parallel at the maximum (32)', () => {
      const result = parseArgs(['--all', '--parallel', '32'])
      expect(result.parallel).toBe(32)
      expect(result).not.toHaveProperty('error')
    })

    it('rejects --parallel one above the maximum (33)', () => {
      const result = parseArgs(['--all', '--parallel', '33'])
      expect(result.error).toContain('--parallel')
    })

    it('parses --parallel when it appears first in argv', () => {
      const result = parseArgs(['--parallel', '4', '--all'])
      expect(result.parallel).toBe(4)
      expect(result).not.toHaveProperty('error')
    })

    it('parses --parallel with a numeric value in --all mode', () => {
      const result = parseArgs(['--all', '--parallel', '4'])
      expect(result.parallel).toBe(4)
    })

    it('parses --parallel with a numeric value in --incremental mode', () => {
      const result = parseArgs(['--incremental', '--parallel', '2'])
      expect(result.parallel).toBe(2)
    })

    it('parses --parallel with a numeric value in source file mode', () => {
      const result = parseArgs(['source.js', '--parallel', '8'])
      expect(result.parallel).toBe(8)
    })

    it('returns true when --parallel is used without a value', () => {
      const result = parseArgs(['--all', '--parallel'])
      expect(result.parallel).toBe(true)
    })

    it('returns true when --parallel is followed by another flag', () => {
      const result = parseArgs(['--all', '--parallel', '--json'])
      expect(result.parallel).toBe(true)
    })

    it('returns error when --parallel value is non-numeric (--all)', () =>
      expectErrorResult('--all', '--parallel', 'abc'))

    it('returns error when --parallel value is non-numeric (--incremental)', () =>
      expectErrorResult('--incremental', '--parallel', 'abc'))

    it('returns error when --parallel value is non-numeric (source file)', () =>
      expectErrorResult('source.js', '--parallel', 'abc'))

    it('returns error when --parallel value is negative', () =>
      expectErrorResult('--all', '--parallel', '-1'))

    it('returns error when --parallel exceeds maximum', () =>
      expectErrorResult('--all', '--parallel', '999'))

    it('accepts --parallel 0 as valid', () => {
      const result = parseArgs(['--all', '--parallel', '0'])
      expect(result.parallel).toBe(0)
      expect(result).not.toHaveProperty('error')
    })

    it('accepts --parallel 1 as valid', () => {
      const result = parseArgs(['--all', '--parallel', '1'])
      expect(result.parallel).toBe(1)
    })

    it('returns undefined when --parallel is absent', () => {
      const result = parseArgs(['--all'])
      expect(result.parallel).toBeUndefined()
    })

    it('does not consume next positional arg when --parallel has numeric value', () => {
      const result = parseArgs(['--parallel', '4', 'source.js'])
      expect(result.sourceFile).toContain('source.js')
      expect(result).not.toHaveProperty('error')
    })
  })

  describe('--json flag', () => {
    it('returns true when --json is used without a path', () => {
      const result = parseArgs(['--all', '--json'])
      expect(result.jsonOutput).toBe(true)
    })

    it('returns the path when --json is followed by a non-flag argument', () => {
      const result = parseArgs(['--all', '--json', 'reports/out.json'])
      expect(result.jsonOutput).toBe('reports/out.json')
    })

    it('returns true when --json is followed by another flag', () => {
      const result = parseArgs(['--all', '--json', '--dry-run'])
      expect(result.jsonOutput).toBe(true)
    })

    it('returns false when --json is absent', () => {
      const result = parseArgs(['--all'])
      expect(result.jsonOutput).toBe(false)
    })

    it('parses --json with path in incremental mode', () => {
      const result = parseArgs(['--incremental', '--json', 'output.json'])
      expect(result.jsonOutput).toBe('output.json')
    })

    it('returns true when --json is last arg in source file mode', () => {
      const result = parseArgs(['source.js', '--json'])
      expect(result.jsonOutput).toBe(true)
    })

    it('parses --json with path in source file mode', () => {
      const result = parseArgs(['source.js', '--json', 'output.json'])
      expect(result.jsonOutput).toBe('output.json')
    })

    it('does not consume --json path as source file', () => {
      const result = parseArgs(['source.js', '--json', 'output.json'])
      expect(result.sourceFile).toContain('source.js')
      expect(result.sourceFile).not.toContain('output.json')
    })

    it('does not consume --json path as source file when --json precedes source', () => {
      const result = parseArgs(['--json', 'report.json', 'source.js'])
      expect(result.sourceFile).toContain('source.js')
      expect(result.sourceFile).not.toContain('report.json')
      expect(result.jsonOutput).toBe('report.json')
    })

    it('does not skip a following flag when --json has no path in source-file mode', () => {
      const result = parseArgs(['source.js', '--json', '--line', '5'])
      expect(result.targetLine).toBe(5)
    })
  })

  describe('--quiet flag', () => {
    it('parses --quiet in --all mode', () => {
      const result = parseArgs(['--all', '--quiet'])
      expect(result.quiet).toBe(true)
    })

    it('parses --quiet in --incremental mode', () => {
      const result = parseArgs(['--incremental', '--quiet'])
      expect(result.quiet).toBe(true)
    })

    it('parses --quiet in source file mode', () => {
      const result = parseArgs(['source.js', '--quiet'])
      expect(result.quiet).toBe(true)
    })

    it('defaults quiet to false when absent', () => {
      const result = parseArgs(['--all'])
      expect(result.quiet).toBeFalsy()
    })

    it('combines with --json', () => {
      const result = parseArgs(['--all', '--quiet', '--json'])
      expect(result.quiet).toBe(true)
      expect(result.jsonOutput).toBe(true)
    })
  })

  describe('--survivors-only flag', () => {
    it('parses --survivors-only in --all mode', () => {
      const result = parseArgs(['--all', '--survivors-only'])
      expect(result.survivorsOnly).toBe(true)
    })

    it('parses --survivors-only in --incremental mode', () => {
      const result = parseArgs(['--incremental', '--survivors-only'])
      expect(result.survivorsOnly).toBe(true)
    })

    it('parses --survivors-only in source file mode', () => {
      const result = parseArgs(['source.js', '--survivors-only'])
      expect(result.survivorsOnly).toBe(true)
    })

    it('returns falsy survivorsOnly when flag is absent', () => {
      const result = parseArgs(['--all'])
      expect(result.survivorsOnly).toBeFalsy()
    })

    it('does not treat --survivors-only as a positional arg', () => {
      const result = parseArgs(['source.js', '--survivors-only'])
      expect(result.sourceFile).toContain('source.js')
      expect(result).not.toHaveProperty('error')
    })

    it('composes with --json and other flags', () => {
      const result = parseArgs(['--all', '--json', '--survivors-only', '--timeout', '5000'])
      expect(result.survivorsOnly).toBe(true)
      expect(result.jsonOutput).toBe(true)
      expect(result.timeout).toBe(5000)
    })
  })

  describe('--min-score flag', () => {
    it('parses --min-score in --all mode', () => {
      const result = parseArgs(['--all', '--min-score', '95'])
      expect(result.minScore).toBe(95)
    })

    it('parses --min-score in --incremental mode', () => {
      const result = parseArgs(['--incremental', '--min-score', '80'])
      expect(result.minScore).toBe(80)
    })

    it('parses --min-score in source file mode', () => {
      const result = parseArgs(['source.js', '--min-score', '70'])
      expect(result.minScore).toBe(70)
    })

    it('returns undefined when --min-score is absent', () => {
      const result = parseArgs(['--all'])
      expect(result.minScore).toBeUndefined()
    })

    it('returns error when --min-score has no value', () =>
      expectErrorResult('--all', '--min-score'))

    it('omits "positive" from --min-score error message', () => {
      const result = parseArgs(['--all', '--min-score', 'abc'])
      expect(result.error).not.toContain('positive')
      expect(result.error).toContain('numeric value')
    })

    it('returns error when --min-score value is non-numeric', () =>
      expectErrorResult('--all', '--min-score', 'abc'))

    it('returns error when --min-score value is non-numeric (source file)', () =>
      expectErrorResult('source.js', '--min-score', 'abc'))

    it('returns error when --min-score value is non-numeric (incremental)', () =>
      expectErrorResult('--incremental', '--min-score', 'abc'))

    it('returns error when --min-score value is negative', () =>
      expectErrorResult('--all', '--min-score', '-1'))

    it('accepts --min-score 0 as valid', () => {
      const result = parseArgs(['--all', '--min-score', '0'])
      expect(result.minScore).toBe(0)
      expect(result).not.toHaveProperty('error')
    })

    it('accepts --min-score 100 as valid', () => {
      const result = parseArgs(['--all', '--min-score', '100'])
      expect(result.minScore).toBe(100)
    })

    it('composes with other flags', () => {
      const result = parseArgs(['--all', '--min-score', '90', '--json', '--timeout', '5000'])
      expect(result.minScore).toBe(90)
      expect(result.jsonOutput).toBe(true)
      expect(result.timeout).toBe(5000)
    })

    it('is not available in --diff mode', () => {
      const result = parseArgs(['--diff', 'before.json', 'after.json'])
      expect(result.minScore).toBeUndefined()
    })
  })

  describe('--changed flag', () => {
    it('parses --changed in --all mode', () => {
      const result = parseArgs(['--all', '--changed'])
      expect(result.changed).toBe(true)
    })

    it('parses --changed in --incremental mode', () => {
      const result = parseArgs(['--incremental', '--changed'])
      expect(result.changed).toBe(true)
    })

    it('defaults changed to false when absent in --all mode', () => {
      const result = parseArgs(['--all'])
      expect(result.changed).toBeFalsy()
    })

    it('defaults changed to false when absent in --incremental mode', () => {
      const result = parseArgs(['--incremental'])
      expect(result.changed).toBeFalsy()
    })

    it('composes with --parallel and --json', () => {
      const result = parseArgs(['--all', '--changed', '--parallel', '4', '--json'])
      expect(result.changed).toBe(true)
      expect(result.parallel).toBe(4)
      expect(result.jsonOutput).toBe(true)
    })

    it('is not available in --diff mode', () => {
      const result = parseArgs(['--diff', 'before.json', 'after.json'])
      expect(result.changed).toBeUndefined()
    })

    it('is not recognized in single-file mode (no effect)', () => {
      const result = parseArgs(['source.js', '--changed'])
      expect(result).not.toHaveProperty('error')
    })
  })

  describe('--progress flag', () => {
    it('parses --progress in --all mode', () => {
      const result = parseArgs(['--all', '--progress'])
      expect(result.progress).toBe(true)
    })

    it('parses --progress in --incremental mode', () => {
      const result = parseArgs(['--incremental', '--progress'])
      expect(result.progress).toBe(true)
    })

    it('parses --progress in source file mode', () => {
      const result = parseArgs(['source.js', '--progress'])
      expect(result.progress).toBe(true)
    })

    it('parses --progress in --retest mode', () => {
      const result = parseArgs(['--retest', 'report.json', '--progress'])
      expect(result.progress).toBe(true)
    })

    it('defaults progress to false when absent', () => {
      const result = parseArgs(['--all'])
      expect(result.progress).toBeFalsy()
    })

    it('composes with --quiet and --json', () => {
      const result = parseArgs(['--all', '--progress', '--quiet', '--json'])
      expect(result.progress).toBe(true)
      expect(result.quiet).toBe(true)
      expect(result.jsonOutput).toBe(true)
    })

    it('appears in help text', () => {
      const result = parseArgs(['--help'])
      expect(result.help).toContain('--progress')
    })
  })

  describe('--min-score at index 0', () => {
    it('parses --min-score when it appears first in argv', () => {
      const result = parseArgs(['--min-score', '80', '--all'])
      expect(result.minScore).toBe(80)
    })
  })

  describe('--timeout at index 0', () => {
    it('parses --timeout when it appears first in argv', () => {
      const result = parseArgs(['--timeout', '5000', '--incremental'])
      expect(result.timeout).toBe(5000)
    })

    it('returns error when --timeout is 0 (incremental)', () =>
      expectErrorResult('--incremental', '--timeout', '0'))

    it('returns error when --timeout is 0 (source file)', () =>
      expectErrorResult('source.js', '--timeout', '0'))
  })
})

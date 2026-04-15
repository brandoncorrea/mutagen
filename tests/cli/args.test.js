import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../src/cli/args.js'

function expectErrorResult(...args) {
  const result = parseArgs(args)
  expect(result).toHaveProperty('error')
}

describe('parseArgs', () => {
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

    it('returns error when --timeout value is non-numeric', () =>
      expectErrorResult('--incremental', '--timeout', 'abc'))

    it('returns error when --timeout value is negative', () =>
      expectErrorResult('--incremental', '--timeout', '-1'))
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
  })

  describe('default argv from process.argv', () => {
    it('uses process.argv.slice(2) when no argv argument provided', () => {
      const original = process.argv
      try {
        process.argv = ['node', 'script.js', '--incremental', '--json']
        const result = parseArgs()
        expect(result.incrementalMode).toBe(true)
        expect(result.jsonOutput).toBe(true)
      } finally {
        process.argv = original
      }
    })
  })

  describe('--parallel flag', () => {
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

  describe('--timeout at index 0', () => {
    it('parses --timeout when it appears first in argv', () => {
      const result = parseArgs(['--timeout', '5000', '--incremental'])
      expect(result.timeout).toBe(5000)
    })

    it('accepts --timeout 0 as valid', () => {
      const result = parseArgs(['--incremental', '--timeout', '0'])
      expect(result.timeout).toBe(0)
      expect(result).not.toHaveProperty('error')
    })

    it('accepts --timeout 0 in source file mode', () => {
      const result = parseArgs(['source.js', '--timeout', '0'])
      expect(result.timeout).toBe(0)
      expect(result).not.toHaveProperty('error')
    })
  })
})

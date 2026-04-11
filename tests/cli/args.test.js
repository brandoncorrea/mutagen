import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../cli/args.js'

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
  })
})

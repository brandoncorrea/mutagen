import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../cli/args.js'

describe('parseArgs', () => {
  describe('--diff mode', () => {
    it('returns error when only one file provided after --diff', () => {
      const result = parseArgs(['--diff', 'before.json'])
      expect(result).toHaveProperty('error')
    })

    it('returns error when no files provided after --diff', () => {
      const result = parseArgs(['--diff'])
      expect(result).toHaveProperty('error')
    })

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
  })
})

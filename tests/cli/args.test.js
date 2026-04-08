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
})

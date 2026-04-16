import { describe, it, expect } from 'vitest'
import { isString } from '../../src/cli/runner/shared.js'

describe('isString', () => {
  it('returns true for string values', () => {
    expect(isString('hello')).toBe(true)
    expect(isString('')).toBe(true)
  })

  it('returns false for non-string values', () => {
    expect(isString(true)).toBe(false)
    expect(isString(42)).toBe(false)
    expect(isString(null)).toBe(false)
    expect(isString(undefined)).toBe(false)
    expect(isString({})).toBe(false)
  })
})

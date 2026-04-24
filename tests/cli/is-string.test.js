import { describe, it, expect, vi } from 'vitest'
import { isString, defaultOut, parallelWorkerCount } from '../../src/cli/shared.js'

describe('defaultOut', () => {
  it('returns an object with log and error functions', () => {
    const out = defaultOut()
    expect(typeof out.log).toBe('function')
    expect(typeof out.error).toBe('function')
  })

  it('log delegates to console.log', () => {
    const out = defaultOut()
    expect(out.log).toBe(console.log)
  })

  it('error delegates to process.stderr.write', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const out = defaultOut()
    out.error('test\n')
    expect(spy).toHaveBeenCalledWith('test\n')
    spy.mockRestore()
  })
})

describe('parallelWorkerCount', () => {
  it('returns the number when parallel is a number', () => {
    expect(parallelWorkerCount(4)).toBe(4)
  })

  it('returns default worker count when parallel is not a number', () => {
    expect(parallelWorkerCount(true)).toBe(2)
    expect(parallelWorkerCount(undefined)).toBe(2)
  })
})

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

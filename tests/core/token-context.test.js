import { describe, it, expect } from 'vitest'
import {
  getTokenContextAt,
  isInJsxTag,
  isArrowOperator
} from '../../src/core/token-context.js'

describe('getTokenContextAt', () => {
  it('returns code for a position inside code tokens', () => {
    expect(getTokenContextAt('const x = 1', 0)).toBe('code')
  })

  it('returns string for a position inside a string literal', () => {
    const line = "const s = 'hello'"
    const idx = line.indexOf("'hello'")
    expect(getTokenContextAt(line, idx)).toBe('string')
  })

  it('returns string for a position inside a template literal', () => {
    const line = 'const s = `hello`'
    const idx = line.indexOf('`hello`')
    expect(getTokenContextAt(line, idx)).toBe('string')
  })

  it('returns string for template head and code for interpolated expression', () => {
    const line = 'const s = `hello ${name} world`'
    const headIdx = line.indexOf('`hello')
    expect(getTokenContextAt(line, headIdx)).toBe('string')
    const nameIdx = line.indexOf('name')
    expect(getTokenContextAt(line, nameIdx)).toBe('code')
  })

  it('returns comment for a position inside a single-line comment', () => {
    expect(getTokenContextAt('// comment', 3)).toBe('comment')
  })

  it('returns comment for a position inside a block comment', () => {
    expect(getTokenContextAt('/* block */', 3)).toBe('comment')
  })

  it('returns code for whitespace positions (whitespace treated as code)', () => {
    expect(getTokenContextAt('const x', 5)).toBe('code')
  })

  it('returns code when position is past end of line content', () => {
    expect(getTokenContextAt('x', 100)).toBe('code')
  })
})

describe('isInJsxTag', () => {
  it('returns true when position is after < with no closing >', () => {
    const line = '<div className'
    expect(isInJsxTag(line, 5)).toBeTruthy()
  })

  it('returns false when position is after a closed tag >', () => {
    const line = '<div> content'
    expect(isInJsxTag(line, 6)).toBeFalsy()
  })

  it('returns false when no angle brackets precede position', () => {
    const line = 'const x = 1'
    expect(isInJsxTag(line, 5)).toBeFalsy()
  })

  it('returns false when only code tokens exist', () => {
    expect(isInJsxTag('abc def', 4)).toBeFalsy()
  })

  it('skips whitespace spans when scanning backwards', () => {
    const line = '<   div'
    expect(isInJsxTag(line, 5)).toBeTruthy()
  })

  it('returns false when > appears before < scanning backwards', () => {
    const line = '<div> <span> text'
    expect(isInJsxTag(line, 13)).toBeFalsy()
  })
})

describe('isArrowOperator', () => {
  it('returns true for => at the correct position', () => {
    const line = 'x => y'
    expect(isArrowOperator(line, 3)).toBeTruthy()
  })

  it('returns false when position is 0 (cannot check position - 1)', () => {
    expect(isArrowOperator('=>', 0)).toBeFalsy()
  })

  it('returns false when char at position is not >', () => {
    expect(isArrowOperator('a = b', 2)).toBeFalsy()
  })

  it('returns false when char before position is not =', () => {
    const line = 'a > b'
    expect(isArrowOperator(line, 2)).toBeFalsy()
  })

  it('returns false for >= (not an arrow)', () => {
    const line = 'a >= b'
    expect(isArrowOperator(line, 2)).toBeFalsy()
  })

  it('returns true when arrow operator starts at position 1', () => {
    expect(isArrowOperator('=>', 1)).toBe(true)
  })
})

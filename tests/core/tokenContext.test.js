import { describe, it, expect } from 'vitest'
import {
  tokenizeLine,
  getTokenContextAt,
  isInJsxTag,
  isArrowOperator
} from '../../core/tokenContext.js'

describe('tokenizeLine', () => {
  it('tokenizes a single identifier', () => {
    const spans = tokenizeLine('x')
    expect(spans).toHaveLength(1)
    expect(spans[0].type).toBe('code')
    expect(spans[0].value).toBe('x')
  })

  it('tokenizes plain code', () => {
    const spans = tokenizeLine('const x = 1')
    expect(spans.length).toBeGreaterThan(0)
    expect(spans.every(s => ['code', 'whitespace'].includes(s.type))).toBe(true)
  })

  it('classifies string literals as string', () => {
    const spans = tokenizeLine("const s = 'hello'")
    const stringSpan = spans.find(s => s.type === 'string')
    expect(stringSpan).toBeDefined()
    expect(stringSpan.value).toBe("'hello'")
  })

  it('classifies template literals as string', () => {
    const spans = tokenizeLine('const s = `hello`')
    const stringSpan = spans.find(s => s.type === 'string')
    expect(stringSpan).toBeDefined()
    expect(stringSpan.value).toBe('`hello`')
  })

  it('classifies single-line comments as comment', () => {
    const spans = tokenizeLine('// this is a comment')
    const commentSpan = spans.find(s => s.type === 'comment')
    expect(commentSpan).toBeDefined()
    expect(commentSpan.value).toContain('// this is a comment')
  })

  it('classifies block comments as comment', () => {
    const spans = tokenizeLine('/* block */')
    const commentSpan = spans.find(s => s.type === 'comment')
    expect(commentSpan).toBeDefined()
  })

  it('classifies whitespace as whitespace', () => {
    const spans = tokenizeLine('a  b')
    const wsSpan = spans.find(s => s.type === 'whitespace')
    expect(wsSpan).toBeDefined()
  })

  it('records correct start and end positions', () => {
    const spans = tokenizeLine('ab')
    const firstSpan = spans[0]
    expect(firstSpan.start).toBe(0)
    expect(firstSpan.end).toBe(2)
    expect(firstSpan.value).toBe('ab')
  })
})

describe('getTokenContextAt', () => {
  it('returns code for a position inside code tokens', () => {
    expect(getTokenContextAt('const x = 1', 0)).toBe('code')
  })

  it('returns string for a position inside a string literal', () => {
    const line = "const s = 'hello'"
    const idx = line.indexOf("'hello'")
    expect(getTokenContextAt(line, idx)).toBe('string')
  })

  it('returns comment for a position inside a comment', () => {
    expect(getTokenContextAt('// comment', 3)).toBe('comment')
  })

  it('returns code for whitespace positions (whitespace treated as code)', () => {
    // position at the space between const and x
    expect(getTokenContextAt('const x', 5)).toBe('code')
  })

  it('returns code when position is past end of line content (line 51 fallback)', () => {
    // Position well beyond the line — no span covers it, falls through loop
    expect(getTokenContextAt('x', 100)).toBe('code')
  })
})

describe('isInJsxTag', () => {
  it('returns true when position is after < with no closing >', () => {
    const line = '<div className'
    expect(isInJsxTag(line, 5)).toBe(true)
  })

  it('returns false when position is after a closed tag >', () => {
    const line = '<div> content'
    expect(isInJsxTag(line, 6)).toBe(false)
  })

  it('returns false when no angle brackets precede position (line 62 fallback)', () => {
    const line = 'const x = 1'
    expect(isInJsxTag(line, 5)).toBe(false)
  })

  it('returns false when only code tokens exist (line 62 fallback)', () => {
    // No angle brackets at all — loop exhausts all spans, returns false
    expect(isInJsxTag('abc def', 4)).toBe(false)
  })

  it('skips whitespace spans when scanning backwards', () => {
    // Whitespace between < and position should be continued over
    const line = '<   div'
    expect(isInJsxTag(line, 5)).toBe(true)
  })

  it('returns false when > appears before < scanning backwards', () => {
    const line = '<div> <span> text'
    // Position 13 is after '> ' — the nearest non-whitespace is ' ' then the second >
    // Actually let's check: at position after the closing > of <span>
    // '<div> <span> text'
    //  0123456789...
    // position 12 is the space after <span>, but `>` at 11 would be encountered first
    expect(isInJsxTag(line, 13)).toBe(false)
  })
})

describe('isArrowOperator', () => {
  it('returns true for => at the correct position', () => {
    const line = 'x => y'
    // '>' is at index 3, '=' at index 2
    expect(isArrowOperator(line, 3)).toBe(true)
  })

  it('returns false when position is 0 (cannot check position - 1)', () => {
    expect(isArrowOperator('=>', 0)).toBe(false)
  })

  it('returns false when char at position is not >', () => {
    expect(isArrowOperator('a = b', 2)).toBe(false)
  })

  it('returns false when char before position is not =', () => {
    const line = 'a > b'
    expect(isArrowOperator(line, 2)).toBe(false)
  })

  it('returns false for >= (not an arrow)', () => {
    const line = 'a >= b'
    // '>' is at 2, '=' is at 3
    // isArrowOperator checks line[position-1]==='=' and line[position]==='>'
    // At position 2: line[1]=' ', line[2]='>' => false (no = before)
    expect(isArrowOperator(line, 2)).toBe(false)
  })
})

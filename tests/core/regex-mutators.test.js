import { describe, it, expect } from 'vitest'
import { regexMutations } from '../../src/core/mutators/regex.js'

function find(name) {
  const m = regexMutations.find(m => m.name === name)
  if (!m) throw new Error(`Mutator not found: ${name}`)
  return m
}

function regexNode(pattern, flags, start, end) {
  return {
    type: 'RegExpLiteral',
    pattern,
    flags: flags || '',
    start,
    end,
    loc: { start: { line: 1, column: start } }
  }
}

describe('regex mutators', () => {
  describe('structure', () => {
    it('exports a non-empty array', () => {
      expect(Array.isArray(regexMutations)).toBe(true)
      expect(regexMutations.length).toBeGreaterThan(0)
    })

    it('every mutator has required fields', () => {
      for (const m of regexMutations) {
        expect(typeof m.name).toBe('string')
        expect(Array.isArray(m.types)).toBe(true)
        expect(typeof m.test).toBe('function')
        expect(typeof m.mutate).toBe('function')
      }
    })

    it('mutator names are unique', () => {
      const names = regexMutations.map(m => m.name)
      const dupes = names.filter((n, i) => names.indexOf(n) !== i)
      expect(dupes).toHaveLength(0)
    })

    it('all mutators target RegExpLiteral', () => {
      for (const m of regexMutations) {
        expect(m.types).toContain('RegExpLiteral')
      }
    })
  })

  describe('^ → (removed)', () => {
    it('matches regex with ^ anchor', () => {
      const m = find('^ → (removed)')
      const node = regexNode('^foo', '', 0, 6)
      expect(m.test(node)).toBe(true)
    })

    it('does not match regex without ^ anchor', () => {
      const m = find('^ → (removed)')
      const node = regexNode('foo', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })

    it('removes ^ from the source', () => {
      const m = find('^ → (removed)')
      const source = 'const re = /^foo/'
      const node = regexNode('^foo', '', 11, 17)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 12, end: 13, replacement: '' })
    })

    it('skips escaped \\^', () => {
      const m = find('^ → (removed)')
      const node = regexNode('\\^foo', '', 0, 8)
      expect(m.test(node)).toBe(false)
    })

    it('skips ^ inside character class [^a]', () => {
      const m = find('^ → (removed)')
      const node = regexNode('[^a]', '', 0, 6)
      expect(m.test(node)).toBe(false)
    })
  })

  describe('$ → (removed)', () => {
    it('matches regex with $ anchor', () => {
      const m = find('$ → (removed)')
      const node = regexNode('foo$', '', 0, 6)
      expect(m.test(node)).toBe(true)
    })

    it('does not match regex without $ anchor', () => {
      const m = find('$ → (removed)')
      const node = regexNode('foo', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })

    it('removes $ from the source', () => {
      const m = find('$ → (removed)')
      const source = 'const re = /foo$/'
      const node = regexNode('foo$', '', 11, 17)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 15, end: 16, replacement: '' })
    })

    it('skips escaped \\$', () => {
      const m = find('$ → (removed)')
      const node = regexNode('foo\\$', '', 0, 8)
      expect(m.test(node)).toBe(false)
    })
  })

  describe('* → +', () => {
    it('matches regex with * quantifier', () => {
      const m = find('* → +')
      const node = regexNode('a*', '', 0, 4)
      expect(m.test(node)).toBe(true)
    })

    it('does not match regex without *', () => {
      const m = find('* → +')
      const node = regexNode('abc', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })

    it('replaces * with + in source', () => {
      const m = find('* → +')
      const source = 'const re = /a*b/'
      const node = regexNode('a*b', '', 11, 16)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 13, end: 14, replacement: '+' })
    })

    it('skips escaped \\*', () => {
      const m = find('* → +')
      const node = regexNode('a\\*', '', 0, 6)
      expect(m.test(node)).toBe(false)
    })
  })

  describe('+ → *', () => {
    it('matches regex with + quantifier', () => {
      const m = find('+ → *')
      const node = regexNode('a+', '', 0, 4)
      expect(m.test(node)).toBe(true)
    })

    it('does not match regex without +', () => {
      const m = find('+ → *')
      const node = regexNode('abc', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })

    it('replaces + with * in source', () => {
      const m = find('+ → *')
      const source = 'const re = /a+b/'
      const node = regexNode('a+b', '', 11, 16)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 13, end: 14, replacement: '*' })
    })

    it('skips escaped \\+', () => {
      const m = find('+ → *')
      const node = regexNode('a\\+', '', 0, 6)
      expect(m.test(node)).toBe(false)
    })
  })

  describe('. → x', () => {
    it('matches regex with . wildcard', () => {
      const m = find('. → x')
      const node = regexNode('a.b', '', 0, 5)
      expect(m.test(node)).toBe(true)
    })

    it('does not match regex without .', () => {
      const m = find('. → x')
      const node = regexNode('abc', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })

    it('replaces . with x in source', () => {
      const m = find('. → x')
      const source = 'const re = /a.b/'
      const node = regexNode('a.b', '', 11, 16)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 13, end: 14, replacement: 'x' })
    })

    it('skips escaped \\.', () => {
      const m = find('. → x')
      const node = regexNode('a\\.b', '', 0, 7)
      expect(m.test(node)).toBe(false)
    })

    it('skips . inside character class [.]', () => {
      const m = find('. → x')
      const node = regexNode('[.]', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })
  })
})

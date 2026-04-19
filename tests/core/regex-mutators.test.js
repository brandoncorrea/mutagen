import { describe, it, expect } from 'vitest'
import { regexMutations } from '../../src/core/mutators/regex.js'

function find(name) {
  const mutation = regexMutations.find(m => m.name === name)
  if (!mutation) throw new Error(`Mutator not found: ${name}`)
  return mutation
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
      for (const mutation of regexMutations) {
        expect(typeof mutation.name).toBe('string')
        expect(Array.isArray(mutation.types)).toBe(true)
        expect(typeof mutation.test).toBe('function')
        expect(typeof mutation.mutate).toBe('function')
      }
    })

    it('mutator names are unique', () => {
      const names = regexMutations.map(m => m.name)
      const dupes = names.filter((n, i) => names.indexOf(n) !== i)
      expect(dupes).toHaveLength(0)
    })

    it('all mutators target RegExpLiteral', () => {
      for (const mutation of regexMutations)
        expect(mutation.types).toContain('RegExpLiteral')
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

  describe('? → (removed)', () => {
    it('matches regex with ? quantifier', () => {
      const m = find('? → (removed)')
      const node = regexNode('a?b', '', 0, 5)
      expect(m.test(node)).toBe(true)
    })

    it('does not match regex without ?', () => {
      const m = find('? → (removed)')
      const node = regexNode('abc', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })

    it('removes ? from source', () => {
      const m = find('? → (removed)')
      const source = 'const re = /a?b/'
      const node = regexNode('a?b', '', 11, 16)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 13, end: 14, replacement: '' })
    })

    it('skips ? in non-capturing group (?:)', () => {
      const m = find('? → (removed)')
      const node = regexNode('(?:foo)', '', 0, 9)
      expect(m.test(node)).toBe(false)
    })

    it('skips ? in lookahead (?=)', () => {
      const m = find('? → (removed)')
      const node = regexNode('(?=foo)', '', 0, 9)
      expect(m.test(node)).toBe(false)
    })

    it('skips ? in negative lookahead (?!)', () => {
      const m = find('? → (removed)')
      const node = regexNode('(?!foo)', '', 0, 9)
      expect(m.test(node)).toBe(false)
    })

    it('matches non-greedy * modifier as ?', () => {
      const m = find('? → (removed)')
      const node = regexNode('a*?b', '', 0, 6)
      expect(m.test(node)).toBe(true)
    })

    it('skips escaped \\?', () => {
      const m = find('? → (removed)')
      const node = regexNode('a\\?', '', 0, 6)
      expect(m.test(node)).toBe(false)
    })

    it('skips ? inside character class [?]', () => {
      const m = find('? → (removed)')
      const node = regexNode('[?]', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })
  })

  describe('character class inversions', () => {
    it('\\d → \\D matches digit shorthand', () => {
      const m = find('\\d → \\D')
      const node = regexNode('\\d+', '', 0, 5)
      expect(m.test(node)).toBe(true)
    })

    it('\\d → \\D replaces d with D in source', () => {
      const m = find('\\d → \\D')
      const source = 'const re = /\\d+/'
      const node = regexNode('\\d+', '', 11, 16)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 13, end: 14, replacement: 'D' })
    })

    it('\\d → \\D does not match \\D', () => {
      const m = find('\\d → \\D')
      const node = regexNode('\\D+', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })

    it('\\D → \\d inverts non-digit to digit', () => {
      const m = find('\\D → \\d')
      const node = regexNode('\\D+', '', 0, 5)
      expect(m.test(node)).toBe(true)
      const source = 'const re = /\\D+/'
      const patch = m.mutate(node, source)
      expect(patch.replacement).toBe('d')
    })

    it('\\w → \\W inverts word to non-word', () => {
      const m = find('\\w → \\W')
      const node = regexNode('\\w+', '', 0, 5)
      expect(m.test(node)).toBe(true)
    })

    it('\\W → \\w inverts non-word to word', () => {
      const m = find('\\W → \\w')
      const node = regexNode('\\W+', '', 0, 5)
      expect(m.test(node)).toBe(true)
    })

    it('\\s → \\S inverts space to non-space', () => {
      const m = find('\\s → \\S')
      const node = regexNode('\\s+', '', 0, 5)
      expect(m.test(node)).toBe(true)
    })

    it('\\S → \\s inverts non-space to space', () => {
      const m = find('\\S → \\s')
      const node = regexNode('\\S+', '', 0, 5)
      expect(m.test(node)).toBe(true)
    })

    it('does not match escaped backslash followed by class char (\\\\d)', () => {
      const m = find('\\d → \\D')
      const node = regexNode('\\\\d', '', 0, 6)
      expect(m.test(node)).toBe(false)
    })
  })

  describe('regex flag removal', () => {
    it('/g → (removed) matches regex with g flag', () => {
      const m = find('/g → (removed)')
      const node = regexNode('foo', 'g', 0, 6)
      expect(m.test(node)).toBe(true)
    })

    it('/g → (removed) does not match regex without g flag', () => {
      const m = find('/g → (removed)')
      const node = regexNode('foo', 'i', 0, 6)
      expect(m.test(node)).toBe(false)
    })

    it('/g → (removed) removes g flag from source', () => {
      const m = find('/g → (removed)')
      const source = 'const re = /foo/gi'
      const node = regexNode('foo', 'gi', 11, 18)
      const patch = m.mutate(node, source)
      // /foo/ = 5 chars, flags start at 16, g is first flag
      expect(patch).toEqual({ start: 16, end: 17, replacement: '' })
    })

    it('/i → (removed) removes i flag', () => {
      const m = find('/i → (removed)')
      const node = regexNode('foo', 'i', 0, 6)
      expect(m.test(node)).toBe(true)
      const source = '/foo/i'
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 5, end: 6, replacement: '' })
    })

    it('/m → (removed) removes m flag', () => {
      const m = find('/m → (removed)')
      const node = regexNode('foo', 'gm', 0, 7)
      expect(m.test(node)).toBe(true)
      const source = '/foo/gm'
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 6, end: 7, replacement: '' })
    })

    it('/i → (removed) removes i from multi-flag regex', () => {
      const m = find('/i → (removed)')
      const source = '/foo/gi'
      const node = regexNode('foo', 'gi', 0, 7)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 6, end: 7, replacement: '' })
    })
  })

  describe('quantifier range mutation', () => {
    it('matches pattern with {n} quantifier', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('a{3}', '', 0, 6)
      expect(m.test(node)).toBe(true)
    })

    it('matches pattern with {n,m} quantifier', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('a{2,5}', '', 0, 8)
      expect(m.test(node)).toBe(true)
    })

    it('matches pattern with {n,} quantifier', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('a{1,}', '', 0, 7)
      expect(m.test(node)).toBe(true)
    })

    it('does not match {0} (cannot decrement below 0)', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('a{0}', '', 0, 6)
      expect(m.test(node)).toBe(false)
    })

    it('does not match {0,5}', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('a{0,5}', '', 0, 8)
      expect(m.test(node)).toBe(false)
    })

    it('decrements {3} to {2}', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const source = '/a{3}/'
      const node = regexNode('a{3}', '', 0, 6)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 2, end: 5, replacement: '{2}' })
    })

    it('decrements {2,5} to {1,5}', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const source = '/a{2,5}/'
      const node = regexNode('a{2,5}', '', 0, 8)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 2, end: 7, replacement: '{1,5}' })
    })

    it('decrements {1,} to {0,}', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const source = '/a{1,}/'
      const node = regexNode('a{1,}', '', 0, 7)
      const patch = m.mutate(node, source)
      expect(patch).toEqual({ start: 2, end: 6, replacement: '{0,}' })
    })

    it('does not match patterns without quantifier ranges', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('abc', '', 0, 5)
      expect(m.test(node)).toBe(false)
    })

    it('skips {n,m} inside character class', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('[{3}]', '', 0, 7)
      expect(m.test(node)).toBe(false)
    })

    it('skips escaped \\{ and finds real quantifier after it', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('\\{a{2}', '', 0, 8)
      expect(m.test(node)).toBe(true)
    })

    it('skips unclosed { without crashing', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('a{', '', 0, 4)
      expect(m.test(node)).toBe(false)
    })

    it('skips non-numeric brace content like {abc}', () => {
      const m = find('{n} → {n-1} (quantifier range)')
      const node = regexNode('a{abc}', '', 0, 8)
      expect(m.test(node)).toBe(false)
    })
  })

  describe('defensive guard', () => {
    it('mutate returns null when pattern has no unescaped target char', () => {
      const m = find('^ → (removed)')
      const node = regexNode('foo', '', 0, 5)
      expect(m.mutate(node, '/foo/')).toBeNull()
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

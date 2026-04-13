import { describe, it, expect } from 'vitest'
import { preparePatterns, generateMutations } from '../../core/engine.js'

const prepared = preparePatterns([
  { pattern: / === /g, replacement: ' !== ', name: '=== → !==' }
])

describe('preparePatterns', () => {
  it('ensures each pattern can find all occurrences in a line', () => {
    const result = preparePatterns([
      { pattern: / === /g, replacement: ' !== ', name: 'test' }
    ])
    expect(result[0].globalPattern.flags).toContain('g')
  })

  it('ensures each pattern can replace a single occurrence', () => {
    const result = preparePatterns([
      { pattern: / === /g, replacement: ' !== ', name: 'test' }
    ])
    expect(result[0].singlePattern.flags).not.toContain('g')
  })

  it('retains name, replacement, and guard from the input', () => {
    const result = preparePatterns([
      { pattern: / === /g, replacement: ' !== ', name: 'test', guard: /foo/ }
    ])
    expect(result[0].name).toBe('test')
    expect(result[0].replacement).toBe(' !== ')
    expect(result[0].guard).toEqual(/foo/)
  })

  it('normalizes patterns regardless of input global flag', () => {
    const result = preparePatterns([
      { pattern: / === /, replacement: ' !== ', name: 'test' }
    ])
    expect(result[0].globalPattern.flags).toContain('g')
    expect(result[0].singlePattern.flags).not.toContain('g')
  })
})

describe('generateMutations', () => {
  it('generates a mutation for a matching line', () => {
    const source = 'if (a === b) {}'
    const mutations = generateMutations(source, prepared)
    expect(mutations).toHaveLength(1)
    expect(mutations[0].name).toBe('=== → !==')
    expect(mutations[0].line).toBe(1)
    expect(mutations[0].mutated).toBe('if (a !== b) {}')
  })

  it('returns empty array when no matches', () => {
    const source = 'const x = 1'
    expect(generateMutations(source, prepared)).toHaveLength(0)
  })

  it('skips blank lines', () => {
    const source = '\nif (a === b) {}'
    const mutations = generateMutations(source, prepared)
    expect(mutations).toHaveLength(1)
    expect(mutations[0].line).toBe(2)
  })

  it('skips single-line comments', () => {
    const source = '// a === b'
    expect(generateMutations(source, prepared)).toHaveLength(0)
  })

  it('skips block comment opening lines', () => {
    const source = '/* a === b */'
    expect(generateMutations(source, prepared)).toHaveLength(0)
  })

  it('skips static import declarations', () => {
    const source = "import foo from 'bar'"
    const boolPatterns = preparePatterns([
      { pattern: /\btrue\b/g, replacement: 'false', name: 'true → false' }
    ])
    // import line should be skipped entirely
    expect(generateMutations(source, boolPatterns)).toHaveLength(0)
  })

  it('does not skip dynamic imports', () => {
    const source = "const mod = await import('bar')"
    const awaitPatterns = preparePatterns([
      { pattern: /\bawait /g, replacement: '', name: 'await → removed' }
    ])
    const mutations = generateMutations(source, awaitPatterns)
    expect(mutations.length).toBeGreaterThan(0)
  })

  it('restricts mutations to targetLine when specified', () => {
    const source = 'if (a === b) {}\nif (c === d) {}'
    const mutations = generateMutations(source, prepared, 2)
    expect(mutations).toHaveLength(1)
    expect(mutations[0].line).toBe(2)
  })

  it('produces correct mutated source with full file content', () => {
    const source = 'const x = 1\nif (a === b) {}\nconst y = 2'
    const mutations = generateMutations(source, prepared)
    expect(mutations).toHaveLength(1)
    expect(mutations[0].source).toBe('const x = 1\nif (a !== b) {}\nconst y = 2')
  })

  it('skips matches inside string literals', () => {
    const source = "const s = ' === '"
    expect(generateMutations(source, prepared)).toHaveLength(0)
  })

  it('skips matches inside inline comments', () => {
    const source = 'const x = 1 // a === b'
    expect(generateMutations(source, prepared)).toHaveLength(0)
  })

  it('generates multiple mutations on the same line', () => {
    const source = 'if (a === b && c === d) {}'
    const mutations = generateMutations(source, prepared)
    expect(mutations).toHaveLength(2)
    expect(mutations[0].name).toContain('match 1/2')
    expect(mutations[1].name).toContain('match 2/2')
  })

  it('respects guard patterns', () => {
    const patterns = preparePatterns([{
      pattern: /\btrue\b/g,
      replacement: 'false',
      name: 'true → false',
      guard: /return/
    }])
    const source = 'return true'
    expect(generateMutations(source, patterns)).toHaveLength(0)
  })

  it('respects nearGuard patterns', () => {
    const patterns = preparePatterns([{
      pattern: / > /g,
      replacement: ' < ',
      name: '> → <',
      nearGuard: /[=>]/
    }])
    // Arrow function context: `=>` has `=` adjacent to `>`
    const source = 'const fn = x => x + 1'
    // The `> ` here has `=` within 5 chars, so nearGuard should block it
    expect(generateMutations(source, patterns)).toHaveLength(0)
  })

  it('skips mutations where result equals original', () => {
    // If replacement produces the same string, no mutation should be emitted
    const patterns = preparePatterns([
      { pattern: /x/g, replacement: 'x', name: 'noop' }
    ])
    const source = 'const x = 1'
    expect(generateMutations(source, patterns)).toHaveLength(0)
  })

  it('skips > mutations inside JSX tags', () => {
    const patterns = preparePatterns([{
      pattern: / > /g,
      replacement: ' < ',
      name: '> → <',
      nearGuard: /[=>]/
    }])
    // In JSX, > closes a tag — should be skipped by isAngleBracketSyntax
    // But this only triggers when match[0].includes('>'), which it does for ` > `
    const source = 'return <div > content'
    const mutations = generateMutations(source, patterns)
    // The > after <div is inside a JSX tag — should be skipped
    expect(mutations).toHaveLength(0)
  })

  describe('nearGuard window boundaries', () => {
    const nearGuardPatterns = preparePatterns([{
      pattern: / > /g,
      replacement: ' < ',
      name: '> → <',
      nearGuard: /[@]/
    }])

    it('blocks when guard char is at position 0 and match is near line start', () => {
      // match.index=2, windowStart must clamp to 0 (not -3)
      // Kills: Math.max→Math.min, 0→1, +→- on window size
      const source = '@x > rest'
      expect(generateMutations(source, nearGuardPatterns)).toHaveLength(0)
    })

    it('blocks when guard char is exactly 5 chars before match', () => {
      // @ at index 5, match at index 10, windowStart=5 includes @
      const source = 'xxxxx@abcd > rest'
      expect(generateMutations(source, nearGuardPatterns)).toHaveLength(0)
    })

    it('does not block when guard char is 6 chars before match', () => {
      // @ at index 4, match at index 10, windowStart=5 excludes @
      const source = 'xxxx@xabcd > rest'
      expect(generateMutations(source, nearGuardPatterns)).toHaveLength(1)
    })

    it('blocks when guard char is exactly 5 chars after match end', () => {
      // match at 5 (len 3, ends at 8), windowEnd=13, @ at index 12 included
      const source = 'abcde > xxxx@xxxx'
      expect(generateMutations(source, nearGuardPatterns)).toHaveLength(0)
    })

    it('does not block when guard char is 6 chars after match end', () => {
      // match ends at 8, windowEnd=13, @ at index 13 excluded
      // Kills: Math.min→Math.max on windowEnd, .length+1
      const source = 'abcde > xxxxx@xxx'
      expect(generateMutations(source, nearGuardPatterns)).toHaveLength(1)
    })

    it('blocks when guard char is immediately after match end', () => {
      // @ at first position after match — kills slice boundary shifts
      const source = 'abcde > @rest'
      expect(generateMutations(source, nearGuardPatterns)).toHaveLength(0)
    })
  })
})

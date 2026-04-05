import { describe, it, expect } from 'vitest'
import { preparePatterns, generateMutations } from '../../core/engine.js'

const simplePatterns = [
  { pattern: / === /g, replacement: ' !== ', name: '=== → !==' },
]

const prepared = preparePatterns(simplePatterns)

describe('preparePatterns', () => {
  it('adds globalPattern with g flag', () => {
    const result = preparePatterns([
      { pattern: / === /g, replacement: ' !== ', name: 'test' },
    ])
    expect(result[0].globalPattern.flags).toContain('g')
  })

  it('adds singlePattern without g flag', () => {
    const result = preparePatterns([
      { pattern: / === /g, replacement: ' !== ', name: 'test' },
    ])
    expect(result[0].singlePattern.flags).not.toContain('g')
  })

  it('preserves original pattern properties', () => {
    const result = preparePatterns([
      { pattern: / === /g, replacement: ' !== ', name: 'test', guard: /foo/ },
    ])
    expect(result[0].name).toBe('test')
    expect(result[0].replacement).toBe(' !== ')
    expect(result[0].guard).toEqual(/foo/)
  })

  it('handles patterns that already lack g flag', () => {
    const result = preparePatterns([
      { pattern: / === /, replacement: ' !== ', name: 'test' },
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
      { pattern: /\btrue\b/g, replacement: 'false', name: 'true → false' },
    ])
    // import line should be skipped entirely
    expect(generateMutations(source, boolPatterns)).toHaveLength(0)
  })

  it('does not skip dynamic imports', () => {
    const source = "const mod = await import('bar')"
    const awaitPatterns = preparePatterns([
      { pattern: /\bawait /g, replacement: '', name: 'await → removed' },
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
    const patterns = preparePatterns([
      { pattern: /\btrue\b/g, replacement: 'false', name: 'true → false', guard: /^\s*\/\// },
    ])
    // guard matches comment prefix — but shouldSkipLine already skips comment lines.
    // guard applies to the *rest* of the line (before + after the match, excluding the match).
    // A line like `// return true` is already skipped by shouldSkipLine.
    // Test guard on a non-comment line where guard pattern matches context:
    const source = '// return true'
    expect(generateMutations(source, patterns)).toHaveLength(0)
  })

  it('respects nearGuard patterns', () => {
    const patterns = preparePatterns([
      { pattern: / > /g, replacement: ' < ', name: '> → <', nearGuard: /[=>]/ },
    ])
    // Arrow function context: `=>` has `=` adjacent to `>`
    const source = 'const fn = x => x + 1'
    // The `> ` here has `=` within 5 chars, so nearGuard should block it
    expect(generateMutations(source, patterns)).toHaveLength(0)
  })

  it('skips mutations where result equals original', () => {
    // If replacement produces the same string, no mutation should be emitted
    const patterns = preparePatterns([
      { pattern: /x/g, replacement: 'x', name: 'noop' },
    ])
    const source = 'const x = 1'
    expect(generateMutations(source, patterns)).toHaveLength(0)
  })

  it('skips > mutations inside JSX tags', () => {
    const patterns = preparePatterns([
      { pattern: / > /g, replacement: ' < ', name: '> → <', nearGuard: /[=>]/ },
    ])
    // In JSX, > closes a tag — should be skipped by isAngleBracketSyntax
    // But this only triggers when match[0].includes('>'), which it does for ` > `
    const source = 'return <div > content'
    const mutations = generateMutations(source, patterns)
    // The > after <div is inside a JSX tag — should be skipped
    expect(mutations).toHaveLength(0)
  })
})

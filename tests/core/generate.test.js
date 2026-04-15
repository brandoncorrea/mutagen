import { describe, it, expect } from 'vitest'
import { generateMutations, prepareMutationConfig } from '../../src/core/generate.js'

const equalityMutator = {
  name: '=== → !==',
  types: ['BinaryExpression'],
  test: node => node.operator === '===',
  mutate: (node, source) => {
    const idx = source.indexOf('===', node.left.end)
    if (idx === -1) return null
    return { start: idx, end: idx + 3, replacement: '!==' }
  }
}

const boolMutator = {
  name: 'true → false',
  types: ['BooleanLiteral'],
  test: node => node.value === true,
  mutate: node => ({ start: node.start, end: node.end, replacement: 'false' })
}

describe('generateMutations (unified)', () => {
  it('returns empty array when config has no mutators or patterns', () => {
    const result = generateMutations('const x = 1', {})
    expect(result).toEqual([])
  })

  it('generates mutations from AST mutators only', () => {
    const config = { mutators: [equalityMutator] }
    const mutations = generateMutations('if (a === b) {}', config)
    expect(mutations).toHaveLength(1)
    expect(mutations[0].name).toBe('=== → !==')
    expect(mutations[0].mutated).toBe('if (a !== b) {}')
  })

  it('generates mutations from regex patterns only', () => {
    const config = prepareMutationConfig({
      patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }]
    })
    const mutations = generateMutations('if (a === b) {}', config)
    expect(mutations).toHaveLength(1)
    expect(mutations[0].name).toBe('=== → !==')
  })

  it('combines AST mutators and regex patterns', () => {
    const config = prepareMutationConfig({
      mutators: [boolMutator],
      patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }]
    })
    const source = 'if (a === true) {}'
    const mutations = generateMutations(source, config)
    expect(mutations.length).toBeGreaterThanOrEqual(2)
    const names = mutations.map(m => m.name)
    expect(names).toContain('true → false')
    expect(names).toContain('=== → !==')
  })

  it('respects targetLine for both engines', () => {
    const config = {
      mutators: [equalityMutator],
      ...prepareMutationConfig({
        patterns: [{ pattern: /\btrue\b/g, replacement: 'false', name: 'true → false' }]
      })
    }
    const source = 'if (a === b) {}\nconst x = true'
    const mutations = generateMutations(source, config, 2)
    for (const m of mutations) {
      expect(m.line).toBe(2)
    }
  })

  it('returns all mutations in standard shape', () => {
    const config = { mutators: [equalityMutator] }
    const mutations = generateMutations('if (a === b) {}', config)
    expect(mutations[0]).toHaveProperty('line')
    expect(mutations[0]).toHaveProperty('original')
    expect(mutations[0]).toHaveProperty('mutated')
    expect(mutations[0]).toHaveProperty('name')
    expect(mutations[0]).toHaveProperty('source')
  })
})

describe('prepareMutationConfig', () => {
  it('returns empty mutators and prepared when given no options', () => {
    const config = prepareMutationConfig({})
    expect(config.mutators).toEqual([])
    expect(config.prepared).toEqual([])
  })

  it('passes through mutators as-is', () => {
    const config = prepareMutationConfig({ mutators: [equalityMutator] })
    expect(config.mutators).toEqual([equalityMutator])
  })

  it('prepares regex patterns into globalPattern and singlePattern', () => {
    const config = prepareMutationConfig({
      patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }]
    })
    expect(config.prepared).toHaveLength(1)
    expect(config.prepared[0]).toHaveProperty('globalPattern')
    expect(config.prepared[0]).toHaveProperty('singlePattern')
  })

  it('handles config with both mutators and patterns', () => {
    const config = prepareMutationConfig({
      mutators: [equalityMutator],
      patterns: [{ pattern: /\btrue\b/g, replacement: 'false', name: 'true → false' }]
    })
    expect(config.mutators).toHaveLength(1)
    expect(config.prepared).toHaveLength(1)
  })

  it('handles undefined input gracefully', () => {
    const config = prepareMutationConfig()
    expect(config.mutators).toEqual([])
    expect(config.prepared).toEqual([])
  })

  it('passes through skipNodes', () => {
    const skipNodes = [{ type: 'IfStatement' }]
    const config = prepareMutationConfig({ skipNodes })
    expect(config.skipNodes).toEqual(skipNodes)
  })

  it('defaults skipNodes to empty array', () => {
    const config = prepareMutationConfig({})
    expect(config.skipNodes).toEqual([])
  })
})

describe('generateMutations with skipNodes', () => {
  it('applies skipNodes to AST-generated mutations', () => {
    const config = prepareMutationConfig({
      mutators: [equalityMutator],
      skipNodes: [{ type: 'IfStatement' }]
    })
    const mutations = generateMutations('if (a === b) {}', config)
    expect(mutations).toEqual([])
  })

  it('does not skip mutations outside of matching nodes', () => {
    const config = prepareMutationConfig({
      mutators: [equalityMutator],
      skipNodes: [{ type: 'ForStatement' }]
    })
    const mutations = generateMutations('if (a === b) {}', config)
    expect(mutations).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import { generateMutations } from '../../src/core/ast-engine.js'

function findBetween(source, from, to, text) {
  const idx = source.indexOf(text, from)
  return idx !== -1 && idx + text.length <= to ? idx : -1
}

const equalityMutator = {
  name: '=== → !==',
  types: ['BinaryExpression'],
  test: (node) => node.operator === '===',
  mutate: (node, source) => {
    const idx = findBetween(source, node.left.end, node.right.start, '===')
    if (idx === -1) return null
    return { start: idx, end: idx + 3, replacement: '!==' }
  }
}

const inequalityMutator = {
  name: '!== → ===',
  types: ['BinaryExpression'],
  test: (node) => node.operator === '!==',
  mutate: (node, source) => {
    const idx = findBetween(source, node.left.end, node.right.start, '!==')
    if (idx === -1) return null
    return { start: idx, end: idx + 3, replacement: '===' }
  }
}

describe('ast-engine generateMutations', () => {
  it('returns an empty array when no mutators are provided', () => {
    const result = generateMutations('const x = 1', [])
    expect(result).toEqual([])
  })

  it('generates a mutation for a BinaryExpression operator', () => {
    const source = 'if (a === b) {}'
    const mutations = generateMutations(source, [equalityMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0]).toEqual({
      line: 1,
      original: 'if (a === b) {}',
      mutated: 'if (a !== b) {}',
      name: '=== → !==',
      source: 'if (a !== b) {}'
    })
  })

  it('produces correct mutated source in a multiline file', () => {
    const source = 'const x = 1\nif (a === b) {}\nconst y = 2'
    const mutations = generateMutations(source, [equalityMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].line).toBe(2)
    expect(mutations[0].original).toBe('if (a === b) {}')
    expect(mutations[0].mutated).toBe('if (a !== b) {}')
    expect(mutations[0].source).toBe('const x = 1\nif (a !== b) {}\nconst y = 2')
  })

  it('generates multiple mutations across different lines', () => {
    const source = 'if (a === b) {}\nif (c !== d) {}'
    const mutations = generateMutations(source, [equalityMutator, inequalityMutator])
    expect(mutations).toHaveLength(2)
    expect(mutations[0].name).toBe('=== → !==')
    expect(mutations[0].line).toBe(1)
    expect(mutations[1].name).toBe('!== → ===')
    expect(mutations[1].line).toBe(2)
  })

  it('restricts mutations to targetLine when specified', () => {
    const source = 'if (a === b) {}\nif (c === d) {}'
    const mutations = generateMutations(source, [equalityMutator], 2)
    expect(mutations).toHaveLength(1)
    expect(mutations[0].line).toBe(2)
  })

  it('returns empty array when no nodes match any mutator', () => {
    const source = 'const x = 1 + 2'
    const mutations = generateMutations(source, [equalityMutator])
    expect(mutations).toEqual([])
  })

  it('supports range-based mutations for non-operator nodes', () => {
    const boolMutator = {
      name: 'true → false',
      types: ['BooleanLiteral'],
      test: (node) => node.value === true,
      mutate: (node) => ({ start: node.start, end: node.end, replacement: 'false' })
    }
    const source = 'const x = true'
    const mutations = generateMutations(source, [boolMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0]).toEqual({
      line: 1,
      original: 'const x = true',
      mutated: 'const x = false',
      name: 'true → false',
      source: 'const x = false'
    })
  })

  it('supports multiple mutators for different node types', () => {
    const boolMutator = {
      name: 'true → false',
      types: ['BooleanLiteral'],
      test: (node) => node.value === true,
      mutate: (node) => ({ start: node.start, end: node.end, replacement: 'false' })
    }
    const source = 'if (a === true) {}'
    const mutations = generateMutations(source, [equalityMutator, boolMutator])
    expect(mutations).toHaveLength(2)
    const names = mutations.map(m => m.name)
    expect(names).toContain('=== → !==')
    expect(names).toContain('true → false')
  })

  it('supports LogicalExpression operator mutations', () => {
    const logicalMutator = {
      name: '&& → ||',
      types: ['LogicalExpression'],
      test: (node) => node.operator === '&&',
      mutate: (node, source) => {
        const idx = findBetween(source, node.left.end, node.right.start, '&&')
        if (idx === -1) return null
        return { start: idx, end: idx + 2, replacement: '||' }
      }
    }
    const source = 'if (a && b) {}'
    const mutations = generateMutations(source, [logicalMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('if (a || b) {}')
  })

  it('supports UpdateExpression mutations', () => {
    const updateMutator = {
      name: '++ → --',
      types: ['UpdateExpression'],
      test: (node) => node.operator === '++',
      mutate: (node) => {
        const op = node.prefix ? node.start : node.argument.end
        return { start: op, end: op + 2, replacement: '--' }
      }
    }
    const source = 'i++'
    const mutations = generateMutations(source, [updateMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('i--')
  })

  it('supports UnaryExpression mutations (negation removal)', () => {
    const unaryMutator = {
      name: '!x → x',
      types: ['UnaryExpression'],
      test: (node) => node.operator === '!' && node.prefix,
      mutate: (node) => ({ start: node.start, end: node.argument.start, replacement: '' })
    }
    const source = 'if (!ready) {}'
    const mutations = generateMutations(source, [unaryMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('if (ready) {}')
  })

  it('handles parse errors gracefully by returning empty array', () => {
    const source = 'if (a ===) {}'
    const mutations = generateMutations(source, [equalityMutator])
    expect(mutations).toEqual([])
  })

  it('trims whitespace from original and mutated fields', () => {
    const source = '  if (a === b) {}'
    const mutations = generateMutations(source, [equalityMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].original).toBe('if (a === b) {}')
    expect(mutations[0].mutated).toBe('if (a !== b) {}')
  })

  it('supports multiple mutators producing two mutations for one node type', () => {
    const gteLtMutator = {
      name: '>= → <',
      types: ['BinaryExpression'],
      test: (node) => node.operator === '>=',
      mutate: (node, source) => {
        const idx = findBetween(source, node.left.end, node.right.start, '>=')
        if (idx === -1) return null
        return { start: idx, end: idx + 2, replacement: '<' }
      }
    }
    const gteGtMutator = {
      name: '>= → >',
      types: ['BinaryExpression'],
      test: (node) => node.operator === '>=',
      mutate: (node, source) => {
        const idx = findBetween(source, node.left.end, node.right.start, '>=')
        if (idx === -1) return null
        return { start: idx, end: idx + 2, replacement: '>' }
      }
    }
    const source = 'if (a >= b) {}'
    const mutations = generateMutations(source, [gteLtMutator, gteGtMutator])
    expect(mutations).toHaveLength(2)
    expect(mutations[0].mutated).toBe('if (a < b) {}')
    expect(mutations[1].mutated).toBe('if (a > b) {}')
  })

  it('supports AssignmentExpression operator mutations', () => {
    const assignMutator = {
      name: '+= → -=',
      types: ['AssignmentExpression'],
      test: (node) => node.operator === '+=',
      mutate: (node, source) => {
        const idx = findBetween(source, node.left.end, node.right.start, '+=')
        if (idx === -1) return null
        return { start: idx, end: idx + 2, replacement: '-=' }
      }
    }
    const source = 'x += 1'
    const mutations = generateMutations(source, [assignMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('x -= 1')
  })

  it('supports CallExpression method name mutations', () => {
    const methodMutator = {
      name: 'push → pop',
      types: ['CallExpression'],
      test: (node) => node.callee.type === 'MemberExpression' && node.callee.property.name === 'push',
      mutate: (node) => {
        const prop = node.callee.property
        return { start: prop.start, end: prop.end, replacement: 'pop' }
      }
    }
    const source = 'arr.push(1)'
    const mutations = generateMutations(source, [methodMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('arr.pop(1)')
    expect(mutations[0].name).toBe('push → pop')
  })

  it('handles TypeScript source code', () => {
    const source = 'const x: boolean = true === false'
    const mutations = generateMutations(source, [equalityMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('const x: boolean = true !== false')
  })

  it('handles JSX source code', () => {
    const source = 'const el = <div>{a === b ? "yes" : "no"}</div>'
    const mutations = generateMutations(source, [equalityMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('const el = <div>{a !== b ? "yes" : "no"}</div>')
  })

  it('returns empty array when mutators list is empty', () => {
    expect(generateMutations('const x = 1', [])).toEqual([])
  })

  it('skips mutations when mutate returns null', () => {
    const nullMutator = {
      name: 'null mutator',
      types: ['BinaryExpression'],
      test: () => true,
      mutate: () => null
    }
    const mutations = generateMutations('if (a === b) {}', [nullMutator])
    expect(mutations).toHaveLength(0)
  })

  it('supports old-style mutators with singular type property', () => {
    const oldStyleMutator = {
      name: 'true → false',
      type: 'BooleanLiteral',
      mutate: (node) => ({ start: node.start, end: node.end, replacement: 'false' })
    }
    const mutations = generateMutations('const x = true', [oldStyleMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].name).toBe('true → false')
  })
})

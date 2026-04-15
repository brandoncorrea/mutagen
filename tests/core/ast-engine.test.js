import { describe, it, expect } from 'vitest'
import { generateMutations } from '../../core/ast-engine.js'

const equalityMutator = {
  type: 'BinaryExpression',
  mutate(node) {
    if (node.operator === '===') {
      return [{ operator: '!==', name: '=== → !==' }]
    }
    if (node.operator === '!==') {
      return [{ operator: '===', name: '!== → ===' }]
    }
    return []
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
    const mutations = generateMutations(source, [equalityMutator])
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
      type: 'BooleanLiteral',
      mutate(node) {
        if (node.value === true) {
          return [{ start: node.start, end: node.end, replacement: 'false', name: 'true → false' }]
        }
        return [{ start: node.start, end: node.end, replacement: 'true', name: 'false → true' }]
      }
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
      type: 'BooleanLiteral',
      mutate(node) {
        if (node.value === true) {
          return [{ start: node.start, end: node.end, replacement: 'false', name: 'true → false' }]
        }
        return []
      }
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
      type: 'LogicalExpression',
      mutate(node) {
        if (node.operator === '&&') {
          return [{ operator: '||', name: '&& → ||' }]
        }
        if (node.operator === '||') {
          return [{ operator: '&&', name: '|| → &&' }]
        }
        return []
      }
    }
    const source = 'if (a && b) {}'
    const mutations = generateMutations(source, [logicalMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('if (a || b) {}')
  })

  it('supports UpdateExpression mutations', () => {
    const updateMutator = {
      type: 'UpdateExpression',
      mutate(node) {
        if (node.operator === '++') {
          return [{ start: node.start, end: node.end, replacement: node.prefix ? '--' + node.argument.name : node.argument.name + '--', name: '++ → --' }]
        }
        return []
      }
    }
    const source = 'i++'
    const mutations = generateMutations(source, [updateMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('i--')
  })

  it('supports UnaryExpression mutations (negation removal)', () => {
    const unaryMutator = {
      type: 'UnaryExpression',
      mutate(node, source) {
        if (node.operator === '!' && node.prefix) {
          return [{ start: node.start, end: node.start + 1, replacement: '', name: '!x → x' }]
        }
        return []
      }
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

  it('supports a mutator returning multiple mutations for one node', () => {
    const comparisonMutator = {
      type: 'BinaryExpression',
      mutate(node) {
        if (node.operator === '>=') {
          return [
            { operator: '<', name: '>= → <' },
            { operator: '>', name: '>= → >' }
          ]
        }
        return []
      }
    }
    const source = 'if (a >= b) {}'
    const mutations = generateMutations(source, [comparisonMutator])
    expect(mutations).toHaveLength(2)
    expect(mutations[0].mutated).toBe('if (a < b) {}')
    expect(mutations[1].mutated).toBe('if (a > b) {}')
  })

  it('supports AssignmentExpression operator mutations', () => {
    const assignMutator = {
      type: 'AssignmentExpression',
      mutate(node) {
        if (node.operator === '+=') {
          return [{ operator: '-=', name: '+= → -=' }]
        }
        return []
      }
    }
    const source = 'x += 1'
    const mutations = generateMutations(source, [assignMutator])
    expect(mutations).toHaveLength(1)
    expect(mutations[0].mutated).toBe('x -= 1')
  })

  it('supports CallExpression method name mutations', () => {
    const methodMutator = {
      type: 'CallExpression',
      mutate(node, source) {
        if (node.callee.type !== 'MemberExpression') return []
        const prop = node.callee.property
        const name = prop.name
        if (name === 'push') {
          return [{ start: prop.start, end: prop.end, replacement: 'pop', name: 'push → pop' }]
        }
        return []
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
})

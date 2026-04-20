import { describe, it, expect } from 'vitest'
import { javascript } from '../../src/core/ast-mutators.js'

describe('ast-mutators', () => {
  describe('structure', () => {
    it('exports a non-empty array', () => {
      expect(Array.isArray(javascript)).toBe(true)
      expect(javascript.length).toBeGreaterThan(0)
    })

    it('every mutator has required fields with correct types', () => {
      for (const mutator of javascript) {
        expect(mutator.name, `missing name`).toBeDefined()
        expect(typeof mutator.name, `name should be string: ${mutator.name}`).toBe('string')
        expect(Array.isArray(mutator.types), `types should be array: ${mutator.name}`).toBe(true)
        expect(mutator.types.length, `types should be non-empty: ${mutator.name}`).toBeGreaterThan(0)
        expect(typeof mutator.test, `test should be function: ${mutator.name}`).toBe('function')
        expect(typeof mutator.mutate, `mutate should be function: ${mutator.name}`).toBe('function')
      }
    })

    it('mutator names are unique', () => {
      const names = javascript.map(mutator => mutator.name)
      const dupes = names.filter((n, i) => names.indexOf(n) !== i)
      expect(dupes, `duplicate names: ${dupes.join(', ')}`).toHaveLength(0)
    })

    it('all node types are valid ESTree/Babel types', () => {
      const valid = new Set([
        'BinaryExpression', 'LogicalExpression', 'UnaryExpression',
        'UpdateExpression', 'AssignmentExpression', 'CallExpression',
        'MemberExpression', 'OptionalMemberExpression',
        'ConditionalExpression', 'ReturnStatement', 'ThrowStatement',
        'AwaitExpression', 'SpreadElement', 'ArrayExpression',
        'Literal', 'BooleanLiteral', 'NumericLiteral', 'StringLiteral',
        'NullLiteral', 'RegExpLiteral', 'ChainExpression', 'ObjectExpression',
        'IfStatement', 'WhileStatement',
        'AssignmentPattern', 'NewExpression',
        'ArrowFunctionExpression', 'Identifier',
        'BreakStatement', 'ContinueStatement',
        'CatchClause', 'TryStatement',
        'ForInStatement', 'ForOfStatement',
        'YieldExpression', 'TemplateLiteral',
        'ForStatement', 'DoWhileStatement',
        'SwitchStatement', 'SwitchCase',
        'MethodDefinition', 'PropertyDefinition',
        'ClassMethod', 'ClassProperty'
      ])
      for (const mutator of javascript)
        for (const type of mutator.types)
          expect(valid.has(type), `${mutator.name}: unknown node type '${type}'`).toBe(true)
    })
  })
})

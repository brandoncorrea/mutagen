/**
 * Control-flow and statement-level AST mutators.
 * Conditionals, returns, throw, async, defaults, and constructor calls.
 */

export const conditionalExpressions = [
  {
    name: 'ternary → always truthy',
    types: ['ConditionalExpression'],
    test: () => true,
    mutate: node => ({
      start: node.consequent.start,
      end: node.consequent.start,
      replacement: 'true || '
    })
  },
  {
    name: 'ternary → always falsy',
    types: ['ConditionalExpression'],
    test: () => true,
    mutate: node => ({
      start: node.consequent.start,
      end: node.consequent.start,
      replacement: 'false && '
    })
  }
]

export const conditionalNegation = [
  {
    name: 'if (cond) → if (!cond)',
    types: ['IfStatement', 'WhileStatement'],
    test: node =>
      node.test.type !== 'UnaryExpression'
      || node.test.operator !== '!'
      || !node.test.prefix,
    mutate: node => ({
      start: node.test.start,
      end: node.test.start,
      replacement: '!'
    })
  }
]

export const blockStatements = [
  {
    name: 'return {} → Object.freeze (syntax break)',
    types: ['ReturnStatement'],
    test: node => node.argument?.type === 'ObjectExpression',
    mutate: node => ({
      start: node.argument.start,
      end: node.argument.start,
      replacement: 'Object.freeze('
    })
  },
  {
    name: 'return → void',
    types: ['ReturnStatement'],
    test: node =>
      node.argument != null
      && node.argument.type !== 'ObjectExpression'
      && node.argument.type !== 'ArrayExpression',
    mutate: (node, source) => {
      const idx = source.indexOf('return', node.start)
      if (idx === -1) return null
      return { start: idx, end: idx + 6, replacement: 'void' }
    }
  }
]

export const asyncMutations = [
  {
    name: 'await → (removed)',
    types: ['AwaitExpression'],
    test: () => true,
    mutate: node => ({
      start: node.start,
      end: node.argument.start,
      replacement: ''
    })
  }
]

export const throwRemoval = [
  {
    name: 'throw → return',
    types: ['ThrowStatement'],
    test: () => true,
    mutate: (node, source) => {
      const idx = source.indexOf('throw', node.start)
      if (idx === -1) return null
      return { start: idx, end: idx + 5, replacement: 'return' }
    }
  }
]

export const defaultParameterRemoval = [
  {
    name: 'param = value → param (remove default)',
    types: ['AssignmentPattern'],
    test: () => true,
    mutate: node => ({ start: node.left.end, end: node.end, replacement: '' })
  }
]

export const arrowShortCircuit = [
  {
    name: '() => expr → () => undefined',
    types: ['ArrowFunctionExpression'],
    test: node => node.expression === true,
    mutate: node => ({ start: node.body.start, end: node.body.end, replacement: 'undefined' })
  }
]

export const newKeywordRemoval = [
  {
    name: 'new X() → X()',
    types: ['NewExpression'],
    test: () => true,
    mutate: node => ({
      start: node.start,
      end: node.callee.start,
      replacement: ''
    })
  }
]

/**
 * Control-flow and statement-level AST mutators.
 * Conditionals, returns, throw, async, defaults, and constructor calls.
 */

export const conditionalExpressions = [
  {
    name: 'ternary → always truthy',
    types: ['ConditionalExpression'],
    test: () => true,
    mutate: ({ consequent }) => ({
      start: consequent.start,
      end: consequent.start,
      replacement: 'true || '
    })
  },
  {
    name: 'ternary → always falsy',
    types: ['ConditionalExpression'],
    test: () => true,
    mutate: ({ consequent }) => ({
      start: consequent.start,
      end: consequent.start,
      replacement: 'false && '
    })
  }
]

export const conditionalNegation = [
  {
    name: 'if (cond) → if (!cond)',
    types: ['IfStatement', 'WhileStatement'],
    test: ({ test }) =>
      test.type !== 'UnaryExpression'
      || test.operator !== '!'
      || !test.prefix,
    mutate: ({ test }) => ({
      start: test.start,
      end: test.start,
      replacement: '!'
    })
  }
]

export const blockStatements = [
  {
    name: 'return {} → Object.freeze (syntax break)',
    types: ['ReturnStatement'],
    test: node => node.argument?.type === 'ObjectExpression',
    mutate: ({ argument }) => ({
      start: argument.start,
      end: argument.start,
      replacement: 'Object.freeze('
    })
  },
  {
    name: 'return → void',
    types: ['ReturnStatement'],
    test: ({ argument }) =>
      argument != null
      && argument.type !== 'ObjectExpression'
      && argument.type !== 'ArrayExpression',
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
    mutate: ({ start, argument }) => ({
      start,
      end: argument.start,
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
    mutate: ({ left, end }) => ({
      start: left.end,
      end,
      replacement: ''
    })
  }
]

export const arrowShortCircuit = [
  {
    name: '() => expr → () => undefined',
    types: ['ArrowFunctionExpression'],
    test: node => node.expression === true,
    mutate: ({ body }) => ({
      start: body.start,
      end: body.end,
      replacement: 'undefined'
    })
  }
]

export const newKeywordRemoval = [
  {
    name: 'new X() → X()',
    types: ['NewExpression'],
    test: () => true,
    mutate: ({ start, callee }) => ({
      start,
      end: callee.start,
      replacement: ''
    })
  }
]

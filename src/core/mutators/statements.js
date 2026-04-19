/**
 * Control-flow and statement-level AST mutators.
 * Conditionals, returns, throw, async, defaults, and constructor calls.
 */

export const conditionalExpressions = [
  {
    name: 'cond → true (ternary)',
    types: ['ConditionalExpression'],
    test: () => true,
    mutate: ({ test }) => ({
      start: test.start,
      end: test.end,
      replacement: 'true'
    })
  },
  {
    name: 'cond → false (ternary)',
    types: ['ConditionalExpression'],
    test: () => true,
    mutate: ({ test }) => ({
      start: test.start,
      end: test.end,
      replacement: 'false'
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

export const breakRemoval = [
  {
    name: 'break → (removed)',
    types: ['BreakStatement'],
    test: () => true,
    mutate: ({ start, end }) => ({
      start,
      end,
      replacement: ''
    })
  }
]

export const continueRemoval = [
  {
    name: 'continue → (removed)',
    types: ['ContinueStatement'],
    test: () => true,
    mutate: ({ start, end }) => ({
      start,
      end,
      replacement: ''
    })
  }
]

export const catchBlockEmptying = [
  {
    name: 'catch body → {} (empty)',
    types: ['CatchClause'],
    test: ({ body }) => body.body.length > 0,
    mutate: ({ body }) => ({
      start: body.start,
      end: body.end,
      replacement: '{}'
    })
  }
]

export const finallyRemoval = [
  {
    name: 'finally → (removed)',
    types: ['TryStatement'],
    test: ({ handler, finalizer }) => handler != null && finalizer != null,
    mutate: ({ handler, finalizer }, source) => {
      const idx = source.indexOf('finally', handler.end)
      if (idx === -1) return null
      return { start: idx, end: finalizer.end, replacement: '' }
    }
  }
]

export const emptyReturnRemoval = [
  {
    name: 'return; → (removed)',
    types: ['ReturnStatement'],
    test: ({ argument }) => argument == null,
    mutate: ({ start, end }) => ({
      start,
      end,
      replacement: ''
    })
  }
]

export const forInOfSwap = [
  {
    name: 'for...in → for...of',
    types: ['ForInStatement'],
    test: () => true,
    mutate: ({ left }, source) => {
      const idx = source.indexOf('in', left.end)
      if (idx === -1) return null
      return { start: idx, end: idx + 2, replacement: 'of' }
    }
  },
  {
    name: 'for...of → for...in',
    types: ['ForOfStatement'],
    test: () => true,
    mutate: ({ left }, source) => {
      const idx = source.indexOf('of', left.end)
      if (idx === -1) return null
      return { start: idx, end: idx + 2, replacement: 'in' }
    }
  }
]

export const yieldRemoval = [
  {
    name: 'yield → (removed)',
    types: ['YieldExpression'],
    test: ({ argument }) => argument != null,
    mutate: ({ start, argument }) => ({
      start,
      end: argument.start,
      replacement: ''
    })
  }
]

export const deleteRemoval = [
  {
    name: 'delete obj.key → true',
    types: ['UnaryExpression'],
    test: ({ operator, prefix }) => operator === 'delete' && prefix,
    mutate: ({ start, end }) => ({
      start,
      end,
      replacement: 'true'
    })
  }
]

export const staticKeywordRemoval = [
  {
    name: 'static → (removed)',
    types: ['MethodDefinition', 'PropertyDefinition', 'ClassMethod', 'ClassProperty'],
    test: node => node.static === true,
    mutate: (node, source) => {
      const idx = source.indexOf('static', node.start)
      if (idx === -1) return null
      return { start: idx, end: idx + 7, replacement: '' }
    }
  }
]

export const errorTypeSwap = [
  {
    name: 'new Error → new TypeError',
    types: ['NewExpression'],
    test: ({ callee }) => callee?.type === 'Identifier' && callee.name === 'Error',
    mutate: ({ callee }) => ({
      start: callee.start,
      end: callee.end,
      replacement: 'TypeError'
    })
  },
  {
    name: 'new TypeError → new Error',
    types: ['NewExpression'],
    test: ({ callee }) => callee?.type === 'Identifier' && callee.name === 'TypeError',
    mutate: ({ callee }) => ({
      start: callee.start,
      end: callee.end,
      replacement: 'Error'
    })
  }
]

export const ifBlockEmptying = [
  {
    name: 'if body → {} (empty)',
    types: ['IfStatement'],
    test: ({ consequent }) =>
      consequent.type === 'BlockStatement' && consequent.body.length > 0,
    mutate: ({ consequent }) => ({
      start: consequent.start,
      end: consequent.end,
      replacement: '{}'
    })
  }
]

export const elseBlockRemoval = [
  {
    name: 'else → (removed)',
    types: ['IfStatement'],
    test: ({ alternate }) =>
      alternate != null
      && alternate.type === 'BlockStatement'
      && alternate.body.length > 0,
    mutate: ({ consequent, end }, source) => {
      const idx = source.indexOf('else', consequent.end)
      if (idx === -1) return null
      return { start: idx, end, replacement: '' }
    }
  }
]

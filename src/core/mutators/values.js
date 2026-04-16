/**
 * Value and literal AST mutators.
 * Boolean/string/numeric literals, conditionals, async, fallbacks, spread, and property access.
 */

import { isStringLiteral, isNumericLiteral } from './helpers.js'

export const booleanLiterals = [
  {
    name: 'true → false',
    types: ['Literal', 'BooleanLiteral'],
    test: node => node.value === true,
    mutate: node => ({ start: node.start, end: node.end, replacement: 'false' })
  },
  {
    name: 'false → true',
    types: ['Literal', 'BooleanLiteral'],
    test: node => node.value === false,
    mutate: node => ({ start: node.start, end: node.end, replacement: 'true' })
  }
]

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

export const stringLiterals = [
  {
    name: "return '' → return 'mutant'",
    types: ['ReturnStatement'],
    test: (node, source) => {
      const arg = node.argument
      return arg
        && isStringLiteral(arg)
        && !arg.value
        && source[arg.start] === "'"
    },
    mutate: node => ({
      start: node.argument.start,
      end: node.argument.end,
      replacement: "'mutant'"
    })
  },
  {
    name: 'return "" → return "mutant"',
    types: ['ReturnStatement'],
    test: (node, source) => {
      const arg = node.argument
      return arg
        && isStringLiteral(arg)
        && !arg.value
        && source[arg.start] === '"'
    },
    mutate: node => ({
      start: node.argument.start,
      end: node.argument.end,
      replacement: '"mutant"'
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

export const fallbackRemovals = [
  {
    name: '|| [] → (removed)',
    types: ['LogicalExpression'],
    test: node =>
      node.operator === '||'
      && node.right.type === 'ArrayExpression'
      && !node.right.elements.length,
    mutate: node => ({
      start: node.left.end,
      end: node.end,
      replacement: ''
    })
  },
  {
    name: "|| '' → (removed)",
    types: ['LogicalExpression'],
    test: node =>
      node.operator === '||' && isStringLiteral(node.right) && !node.right.value,
    mutate: node => ({
      start: node.left.end,
      end: node.end,
      replacement: ''
    })
  },
  {
    name: '|| 0 → (removed)',
    types: ['LogicalExpression'],
    test: node =>
      node.operator === '||' && isNumericLiteral(node.right) && !node.right.value,
    mutate: node => ({
      start: node.left.end,
      end: node.end,
      replacement: ''
    })
  }
]

export const numericBoundary = [
  {
    name: '0 → 1',
    types: ['Literal', 'NumericLiteral'],
    test: node => !node.value,
    mutate: (node, source) => {
      const raw = source.slice(node.start, node.end)
      if (/^0[xXoObB]/.test(raw) || raw.includes('.')) return null
      return { start: node.start, end: node.end, replacement: '1' }
    }
  },
  {
    name: '1 → 0',
    types: ['Literal', 'NumericLiteral'],
    test: node => node.value === 1,
    mutate: (node, source) => {
      const raw = source.slice(node.start, node.end)
      if (/^0[xXoObB]/.test(raw)) return null
      if (node.start && /[.\d]/.test(source[node.start - 1])) return null
      return { start: node.start, end: node.end, replacement: '0' }
    }
  },
  {
    name: '-1 → 0',
    types: ['UnaryExpression'],
    test: node =>
      node.operator === '-'
      && node.prefix
      && isNumericLiteral(node.argument)
      && node.argument.value === 1,
    mutate: node => ({
      start: node.start,
      end: node.end,
      replacement: '0'
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

export const spreadRemoval = [
  {
    name: '[...x] → x (remove copy)',
    types: ['ArrayExpression'],
    test: node =>
      node.elements.length === 1
      && node.elements[0]?.type === 'SpreadElement',
    mutate: (node, source) => ({
      start: node.start,
      end: node.end,
      replacement: source.slice(
        node.elements[0].argument.start,
        node.elements[0].argument.end
      )
    })
  },
  {
    name: '[...x, y] → [y] (remove spread)',
    types: ['ArrayExpression'],
    test: node =>
      node.elements.length >= 2
      && node.elements[0]?.type === 'SpreadElement',
    mutate: (node, _source) => ({
      start: node.start + 1,
      end: node.elements[1].start,
      replacement: ''
    })
  },
  {
    name: '{...obj} → obj (remove copy)',
    types: ['ObjectExpression'],
    test: node =>
      node.properties.length === 1
      && node.properties[0]?.type === 'SpreadElement',
    mutate: (node, source) => ({
      start: node.start,
      end: node.end,
      replacement: source.slice(
        node.properties[0].argument.start,
        node.properties[0].argument.end
      )
    })
  },
  {
    name: '{...obj, key: val} → {key: val} (remove spread)',
    types: ['ObjectExpression'],
    test: node =>
      node.properties.length >= 2
      && node.properties[0]?.type === 'SpreadElement',
    mutate: (node, _source) => ({
      start: node.start + 1,
      end: node.properties[1].start,
      replacement: ''
    })
  }
]

export const propertyAccessMutations = [
  {
    name: '.length → .length + 1',
    types: ['MemberExpression'],
    test: node => !node.computed && node.property?.name === 'length',
    mutate: node => ({
      start: node.end,
      end: node.end,
      replacement: ' + 1'
    })
  }
]

/**
 * Value and literal AST mutators.
 * Boolean/string/numeric literals, fallbacks, spread, and property access.
 */

import { isStringLiteral, isNumericLiteral } from './helpers.js'

export const booleanLiterals = [
  {
    name: 'true → false',
    types: ['Literal', 'BooleanLiteral'],
    test: node => node.value === true,
    mutate: ({ start, end }) => ({ start, end, replacement: 'false' })
  },
  {
    name: 'false → true',
    types: ['Literal', 'BooleanLiteral'],
    test: node => node.value === false,
    mutate: ({ start, end }) => ({ start, end, replacement: 'true' })
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
    mutate: ({ argument }) => ({
      start: argument.start,
      end: argument.end,
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
    mutate: ({ argument }) => ({
      start: argument.start,
      end: argument.end,
      replacement: '"mutant"'
    })
  }
]

export const fallbackRemovals = [
  {
    name: '|| [] → (removed)',
    types: ['LogicalExpression'],
    test: ({ operator, right }) =>
      operator === '||'
      && right.type === 'ArrayExpression'
      && !right.elements.length,
    mutate: ({ left, end }) => ({
      start: left.end,
      end,
      replacement: ''
    })
  },
  {
    name: "|| '' → (removed)",
    types: ['LogicalExpression'],
    test: ({ operator, right }) =>
      operator === '||' && isStringLiteral(right) && !right.value,
    mutate: ({ left, end }) => ({
      start: left.end,
      end,
      replacement: ''
    })
  },
  {
    name: '|| 0 → (removed)',
    types: ['LogicalExpression'],
    test: ({ operator, right }) =>
      operator === '||' && isNumericLiteral(right) && !right.value,
    mutate: ({ left, end }) => ({
      start: left.end,
      end,
      replacement: ''
    })
  }
]

export const numericBoundary = [
  {
    name: '0 → 1',
    types: ['Literal', 'NumericLiteral'],
    test: node => !node.value,
    mutate: ({ start, end }, source) => {
      const raw = source.slice(start, end)
      if (/^0[xXoObB]/.test(raw) || raw.includes('.')) return null
      return { start, end, replacement: '1' }
    }
  },
  {
    name: '1 → 0',
    types: ['Literal', 'NumericLiteral'],
    test: node => node.value === 1,
    mutate: ({ start, end }, source) => {
      const raw = source.slice(start, end)
      if (/^0[xXoObB]/.test(raw)) return null
      if (start && /[.\d]/.test(source[start - 1])) return null
      return { start, end, replacement: '0' }
    }
  },
  {
    name: '-1 → 0',
    types: ['UnaryExpression'],
    test: ({ operator, prefix, argument }) =>
      operator === '-'
      && prefix
      && isNumericLiteral(argument)
      && argument.value === 1,
    mutate: ({ start, end }) => ({ start, end, replacement: '0' })
  }
]

export const spreadRemoval = [
  {
    name: '[...x] → x (remove copy)',
    types: ['ArrayExpression'],
    test: ({ elements }) =>
      elements.length === 1
      && elements[0]?.type === 'SpreadElement',
    mutate: ({ start, end, elements }, source) => ({
      start,
      end,
      replacement: source.slice(
        elements[0].argument.start,
        elements[0].argument.end
      )
    })
  },
  {
    name: '[...x, y] → [y] (remove spread)',
    types: ['ArrayExpression'],
    test: ({ elements }) =>
      elements.length >= 2
      && elements[0]?.type === 'SpreadElement',
    mutate: ({ start, elements }, _source) => ({
      start: start + 1,
      end: elements[1].start,
      replacement: ''
    })
  },
  {
    name: '{...obj} → obj (remove copy)',
    types: ['ObjectExpression'],
    test: ({ properties }) =>
      properties.length === 1
      && properties[0]?.type === 'SpreadElement',
    mutate: ({ start, end, properties }, source) => ({
      start,
      end,
      replacement: source.slice(
        properties[0].argument.start,
        properties[0].argument.end
      )
    })
  },
  {
    name: '{...obj, key: val} → {key: val} (remove spread)',
    types: ['ObjectExpression'],
    test: ({ properties }) =>
      properties.length >= 2
      && properties[0]?.type === 'SpreadElement',
    mutate: ({ start, properties }, _source) => ({
      start: start + 1,
      end: properties[1].start,
      replacement: ''
    })
  }
]

export const propertyAccessMutations = [
  {
    name: '.length → .length + 1',
    types: ['MemberExpression'],
    test: node => !node.computed && node.property?.name === 'length',
    mutate: ({ end }) => ({
      start: end,
      end,
      replacement: ' + 1'
    })
  }
]

export const nullUndefinedSwap = [
  {
    name: 'null → undefined',
    types: ['Literal', 'NullLiteral'],
    test: node => node.type === 'NullLiteral' || node.raw === 'null',
    mutate: ({ start, end }) => ({ start, end, replacement: 'undefined' })
  },
  {
    name: 'undefined → null',
    types: ['Identifier'],
    test: node => node.name === 'undefined',
    mutate: ({ start, end }) => ({ start, end, replacement: 'null' })
  }
]

export const emptyArrayMutation = [
  {
    name: '[] → [undefined]',
    types: ['ArrayExpression'],
    test: ({ elements }) => elements.length === 0,
    mutate: ({ start, end }) => ({ start, end, replacement: '[undefined]' })
  }
]

export const templateLiteralMutation = [
  {
    name: '`${...}` → ``',
    types: ['TemplateLiteral'],
    test: ({ expressions }) => expressions.length > 0,
    mutate: ({ start, end }) => ({ start, end, replacement: '``' })
  }
]

export const stringLiteralsAnyContext = [
  {
    name: "'' → 'mutant' (any context)",
    types: ['Literal', 'StringLiteral'],
    test: (node, source, parent) =>
      isStringLiteral(node) && !node.value
      && source[node.start] === "'"
      && parent?.type !== 'ReturnStatement',
    mutate: ({ start, end }) => ({ start, end, replacement: "'mutant'" })
  },
  {
    name: '"" → "mutant" (any context)',
    types: ['Literal', 'StringLiteral'],
    test: (node, source, parent) =>
      isStringLiteral(node) && !node.value
      && source[node.start] === '"'
      && parent?.type !== 'ReturnStatement',
    mutate: ({ start, end }) => ({ start, end, replacement: '"mutant"' })
  }
]

export const numericOffByOne = [
  {
    name: 'n → n + 1',
    types: ['Literal', 'NumericLiteral'],
    test: node => isNumericLiteral(node) && Number.isInteger(node.value) && node.value > 1,
    mutate: ({ start, end, value }, source) => {
      const raw = source.slice(start, end)
      if (/^0[xXoObB]/.test(raw) || raw.includes('.')) return null
      return { start, end, replacement: String(value + 1) }
    }
  },
  {
    name: 'n → n - 1',
    types: ['Literal', 'NumericLiteral'],
    test: node => isNumericLiteral(node) && Number.isInteger(node.value) && node.value > 1,
    mutate: ({ start, end, value }, source) => {
      const raw = source.slice(start, end)
      if (/^0[xXoObB]/.test(raw) || raw.includes('.')) return null
      return { start, end, replacement: String(value - 1) }
    }
  }
]

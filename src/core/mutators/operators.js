/**
 * Operator-focused AST mutators.
 * Equality, logical, arithmetic, assignment, bitwise, update, unary, and void operators.
 */

import { binaryOpSwap, logicalOpSwap, assignmentOpSwap } from './helpers.js'

export const equalityOperators = [
  binaryOpSwap('=== → !==', '===', '!=='),
  binaryOpSwap('!== → ===', '!==', '==='),
  binaryOpSwap('>= → <', '>=', '<'),
  binaryOpSwap('<= → >', '<=', '>'),
  binaryOpSwap('> → <', '>', '<'),
  binaryOpSwap('< → >', '<', '>'),
  binaryOpSwap('> → >=', '>', '>='),
  binaryOpSwap('< → <=', '<', '<='),
  binaryOpSwap('>= → >', '>=', '>'),
  binaryOpSwap('<= → <', '<=', '<')
]

export const logicalOperators = [
  logicalOpSwap('&& → ||', '&&', '||'),
  logicalOpSwap('|| → &&', '||', '&&')
]

export const arithmeticOperators = [
  binaryOpSwap('+ → -', '+', '-'),
  binaryOpSwap('- → +', '-', '+'),
  binaryOpSwap('* → /', '*', '/'),
  binaryOpSwap('/ → *', '/', '*'),
  binaryOpSwap('% → +', '%', '+'),
  binaryOpSwap('** → *', '**', '*')
]

export const updateOperators = [
  {
    name: '++ → --',
    types: ['UpdateExpression'],
    test: node => node.operator === '++',
    mutate: ({ prefix, start, argument }) => {
      const op = prefix ? start : argument.end
      return { start: op, end: op + 2, replacement: '--' }
    }
  },
  {
    name: '-- → ++',
    types: ['UpdateExpression'],
    test: node => node.operator === '--',
    mutate: ({ prefix, start, argument }) => {
      const op = prefix ? start : argument.end
      return { start: op, end: op + 2, replacement: '++' }
    }
  }
]

export const assignmentMutations = [
  assignmentOpSwap('+= → -=', '+=', '-='),
  assignmentOpSwap('-= → +=', '-=', '+='),
  assignmentOpSwap('*= → /=', '*=', '/='),
  assignmentOpSwap('/= → *=', '/=', '*='),
  assignmentOpSwap('%= → +=', '%=', '+='),
  assignmentOpSwap('**= → *=', '**=', '*=')
]

export const bitwiseOperators = [
  binaryOpSwap('& → |', '&', '|'),
  binaryOpSwap('| → &', '|', '&'),
  binaryOpSwap('^ → &', '^', '&'),
  binaryOpSwap('<< → >>', '<<', '>>'),
  binaryOpSwap('>> → <<', '>>', '<<')
]

export const nullishCoalescing = [
  logicalOpSwap('?? → ||', '??', '||')
]

export const optionalChaining = [
  {
    name: '?. → .',
    types: ['MemberExpression', 'CallExpression'],
    test: node => node.optional === true,
    mutate: ({ object, callee, start }, source) => {
      const searchFrom = object?.end ?? callee?.end ?? start
      const idx = source.indexOf('?.', searchFrom)
      if (idx === -1) return null
      return { start: idx, end: idx + 2, replacement: '.' }
    }
  }
]

export const negationRemoval = [
  {
    name: '!var → var',
    types: ['UnaryExpression'],
    test: ({ operator, prefix }) => operator === '!' && prefix,
    mutate: ({ start, argument }) => ({
      start: start,
      end: argument.start,
      replacement: ''
    })
  }
]

export const unaryMinusRemoval = [
  {
    name: 'unary -x → x',
    types: ['UnaryExpression'],
    test: ({ operator, prefix, argument }) =>
      operator === '-'
      && prefix
      && argument.type === 'Identifier',
    mutate: ({ start, argument }) => ({
      start,
      end: argument.start,
      replacement: ''
    })
  }
]

export const voidRemoval = [
  {
    name: 'void expr → expr',
    types: ['UnaryExpression'],
    test: ({ operator, prefix }) => operator === 'void' && prefix,
    mutate: ({ start, argument }) => ({
      start,
      end: argument.start,
      replacement: ''
    })
  }
]

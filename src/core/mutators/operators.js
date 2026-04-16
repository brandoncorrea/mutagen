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
    mutate: node => {
      const op = node.prefix ? node.start : node.argument.end
      return { start: op, end: op + 2, replacement: '--' }
    }
  },
  {
    name: '-- → ++',
    types: ['UpdateExpression'],
    test: node => node.operator === '--',
    mutate: node => {
      const op = node.prefix ? node.start : node.argument.end
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
    mutate: (node, source) => {
      const searchFrom = node.object?.end ?? node.callee?.end ?? node.start
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
    test: node => node.operator === '!' && node.prefix,
    mutate: node => ({
      start: node.start,
      end: node.argument.start,
      replacement: ''
    })
  }
]

export const unaryMinusRemoval = [
  {
    name: 'unary -x → x',
    types: ['UnaryExpression'],
    test: node =>
      node.operator === '-'
      && node.prefix
      && node.argument.type === 'Identifier',
    mutate: node => ({
      start: node.start,
      end: node.argument.start,
      replacement: ''
    })
  }
]

export const voidRemoval = [
  {
    name: 'void expr → expr',
    types: ['UnaryExpression'],
    test: node => node.operator === 'void' && node.prefix,
    mutate: node => ({
      start: node.start,
      end: node.argument.start,
      replacement: ''
    })
  }
]

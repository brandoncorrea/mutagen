/**
 * Method and function call AST mutators.
 * String, math, array, object method swaps and call-expression mutations.
 */

import { isMemberCall, isStaticCall, methodNameSwap, staticMethodSwap, globalFnSwap } from './helpers.js'

export const methodExpressions = [
  methodNameSwap('toLowerCase → toUpperCase', 'toLowerCase', 'toUpperCase'),
  methodNameSwap('toUpperCase → toLowerCase', 'toUpperCase', 'toLowerCase'),
  {
    name: 'trim() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'trim') && !node.arguments.length,
    mutate: node => ({
      start: node.callee.object.end,
      end: node.end,
      replacement: ''
    })
  },
  {
    name: 'filter(predicate) → filter(true) (ignore predicate)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'filter') && node.arguments.length > 0,
    mutate: node => ({
      start: node.arguments[0].start,
      end: node.arguments[0].start,
      replacement: 'x => true, '
    })
  },
  {
    name: 'slice() → slice(1,',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'slice'),
    mutate: (node, source) => {
      const openParen = source.indexOf('(', node.callee.end)
      if (openParen === -1) return null
      return { start: openParen + 1, end: openParen + 1, replacement: '1,' }
    }
  }
]

export const stringMethodSwaps = [
  methodNameSwap('includes → indexOf', 'includes', 'indexOf'),
  methodNameSwap('startsWith → endsWith', 'startsWith', 'endsWith'),
  methodNameSwap('endsWith → startsWith', 'endsWith', 'startsWith')
]

export const mathMethodSwaps = [
  staticMethodSwap('Math.floor → Math.ceil', 'Math', 'floor', 'ceil'),
  staticMethodSwap('Math.ceil → Math.floor', 'Math', 'ceil', 'floor'),
  staticMethodSwap('Math.min → Math.max', 'Math', 'min', 'max'),
  staticMethodSwap('Math.max → Math.min', 'Math', 'max', 'min'),
  {
    name: 'Math.abs → (removed)',
    types: ['CallExpression'],
    test: node => isStaticCall(node, 'Math', 'abs'),
    mutate: node => ({
      start: node.callee.start,
      end: node.callee.end,
      replacement: ''
    })
  },
  staticMethodSwap('Math.round → Math.floor', 'Math', 'round', 'floor'),
  staticMethodSwap('Math.sqrt → Math.cbrt', 'Math', 'sqrt', 'cbrt')
]

export const arrayMethodSwaps = [
  methodNameSwap('some → every', 'some', 'every'),
  methodNameSwap('every → some', 'every', 'some'),
  methodNameSwap('map → filter', 'map', 'filter'),
  {
    name: 'Array.isArray → !Array.isArray',
    types: ['CallExpression'],
    test: node => isStaticCall(node, 'Array', 'isArray'),
    mutate: node => ({
      start: node.start,
      end: node.start,
      replacement: '!'
    })
  },
  methodNameSwap('push → pop', 'push', 'pop'),
  {
    name: 'shift → pop',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'shift') && !node.arguments.length,
    mutate: node => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: 'pop' }
    }
  },
  methodNameSwap('unshift → push', 'unshift', 'push'),
  methodNameSwap('find → findIndex', 'find', 'findIndex'),
  methodNameSwap('findIndex → find', 'findIndex', 'find'),
  {
    name: 'reverse() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'reverse') && !node.arguments.length,
    mutate: node => ({
      start: node.callee.object.end,
      end: node.end,
      replacement: ''
    })
  },
  methodNameSwap('splice → slice', 'splice', 'slice')
]

export const objectMethodSwaps = [
  {
    name: 'Object.keys → Object.values',
    types: ['CallExpression'],
    test: (node, _source, parent) =>
      isStaticCall(node, 'Object', 'keys')
      && !(parent?.type === 'MemberExpression' && parent.property?.name === 'length'),
    mutate: node => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: 'values' }
    }
  },
  {
    name: 'Object.values → Object.keys',
    types: ['CallExpression'],
    test: (node, _source, parent) =>
      isStaticCall(node, 'Object', 'values')
      && !(parent?.type === 'MemberExpression' && parent.property?.name === 'length'),
    mutate: node => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: 'keys' }
    }
  },
  staticMethodSwap('Object.entries → Object.keys', 'Object', 'entries', 'keys')
]

export const stringMethodMutations = [
  methodNameSwap('replace → toString (removed)', 'replace', 'toString')
]

export const typeConversions = [
  globalFnSwap('parseInt → parseFloat', 'parseInt', 'parseFloat'),
  globalFnSwap('parseFloat → parseInt', 'parseFloat', 'parseInt')
]

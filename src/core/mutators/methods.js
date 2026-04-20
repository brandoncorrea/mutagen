/**
 * Method and function call AST mutators.
 * String, math, array, object method swaps and call-expression mutations.
 */

import {
  isMemberCall, isStaticCall, methodNameSwap,
  staticMethodSwap, globalFnSwap
} from './helpers.js'

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
  methodNameSwap('endsWith → startsWith', 'endsWith', 'startsWith'),
  methodNameSwap('indexOf → lastIndexOf', 'indexOf', 'lastIndexOf'),
  methodNameSwap('lastIndexOf → indexOf', 'lastIndexOf', 'indexOf'),
  methodNameSwap('trimStart → trimEnd', 'trimStart', 'trimEnd'),
  methodNameSwap('trimEnd → trimStart', 'trimEnd', 'trimStart')
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
    mutate: ({ callee }) => ({
      start: callee.start,
      end: callee.end,
      replacement: ''
    })
  },
  staticMethodSwap('Math.round → Math.floor', 'Math', 'round', 'floor'),
  staticMethodSwap('Math.sqrt → Math.cbrt', 'Math', 'sqrt', 'cbrt'),
  staticMethodSwap('Math.trunc → Math.floor', 'Math', 'trunc', 'floor'),
  {
    name: 'Math.sign → (removed)',
    types: ['CallExpression'],
    test: node => isStaticCall(node, 'Math', 'sign'),
    mutate: ({ callee }) => ({
      start: callee.start,
      end: callee.end,
      replacement: ''
    })
  }
]

export const arrayMethodSwaps = [
  methodNameSwap('some → every', 'some', 'every'),
  methodNameSwap('every → some', 'every', 'some'),
  methodNameSwap('map → filter', 'map', 'filter'),
  {
    name: 'Array.isArray → !Array.isArray',
    types: ['CallExpression'],
    test: node => isStaticCall(node, 'Array', 'isArray'),
    mutate: ({ start }) => ({
      start,
      end: start,
      replacement: '!'
    })
  },
  methodNameSwap('push → pop', 'push', 'pop'),
  {
    name: 'shift → pop',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'shift') && !node.arguments.length,
    mutate: node => {
      const { start, end } = node.callee.property
      return { start, end, replacement: 'pop' }
    }
  },
  methodNameSwap('unshift → push', 'unshift', 'push'),
  methodNameSwap('find → findIndex', 'find', 'findIndex'),
  methodNameSwap('findIndex → find', 'findIndex', 'find'),
  {
    name: 'reverse() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'reverse') && !node.arguments.length,
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  },
  methodNameSwap('splice → slice', 'splice', 'slice'),
  {
    name: 'sort() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'sort'),
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  },
  methodNameSwap('reduce → reduceRight', 'reduce', 'reduceRight'),
  methodNameSwap('reduceRight → reduce', 'reduceRight', 'reduce'),
  {
    name: 'forEach() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'forEach'),
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  },
  {
    name: 'flat() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'flat'),
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  },
  methodNameSwap('flatMap → map', 'flatMap', 'map')
]

export const mapSetMethodSwaps = [
  methodNameSwap('.get → .has', 'get', 'has'),
  methodNameSwap('.has → .get', 'has', 'get'),
  methodNameSwap('.add → .delete', 'add', 'delete'),
  methodNameSwap('.delete → .add', 'delete', 'add')
]

export const miscMethodMutations = [
  {
    name: 'split() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'split'),
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  },
  {
    name: 'join() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'join'),
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  }
]

export const objectMethodSwaps = [
  {
    name: 'Object.keys → Object.values',
    types: ['CallExpression'],
    test: (node, _source, parent) =>
      isStaticCall(node, 'Object', 'keys')
      && !(parent?.type === 'MemberExpression'
        && parent.property?.name === 'length'),
    mutate: node => {
      const { start, end } = node.callee.property
      return { start, end, replacement: 'values' }
    }
  },
  {
    name: 'Object.values → Object.keys',
    types: ['CallExpression'],
    test: (node, _source, parent) =>
      isStaticCall(node, 'Object', 'values')
      && !(parent?.type === 'MemberExpression'
        && parent.property?.name === 'length'),
    mutate: node => {
      const { start, end } = node.callee.property
      return { start, end, replacement: 'keys' }
    }
  },
  staticMethodSwap(
    'Object.entries → Object.keys', 'Object', 'entries', 'keys'
  )
]

export const promiseMethodSwaps = [
  staticMethodSwap(
    'Promise.all → Promise.race',
    'Promise', 'all', 'race'
  ),
  staticMethodSwap(
    'Promise.race → Promise.all',
    'Promise', 'race', 'all'
  ),
  staticMethodSwap(
    'Promise.resolve → Promise.reject',
    'Promise', 'resolve', 'reject'
  ),
  staticMethodSwap(
    'Promise.reject → Promise.resolve',
    'Promise', 'reject', 'resolve'
  ),
  staticMethodSwap(
    'Promise.allSettled → Promise.any',
    'Promise', 'allSettled', 'any'
  ),
  staticMethodSwap(
    'Promise.any → Promise.allSettled',
    'Promise', 'any', 'allSettled'
  )
]

export const stringMethodMutations = [
  methodNameSwap('replace → toString (removed)', 'replace', 'toString'),
  methodNameSwap('replaceAll → replace', 'replaceAll', 'replace'),
  methodNameSwap('charAt → charCodeAt', 'charAt', 'charCodeAt'),
  methodNameSwap('charCodeAt → charAt', 'charCodeAt', 'charAt'),
  methodNameSwap('toString → valueOf', 'toString', 'valueOf'),
  methodNameSwap('valueOf → toString', 'valueOf', 'toString'),
  {
    name: 'toString() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'toString') && !node.arguments.length,
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  }
]

export const promiseChainMutations = [
  methodNameSwap('.then → .catch', 'then', 'catch'),
  methodNameSwap('.catch → .then', 'catch', 'then'),
  {
    name: '.catch() → (removed)',
    types: ['CallExpression'],
    test: node => isMemberCall(node, 'catch') && node.arguments.length > 0,
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  }
]

export const typeConversions = [
  globalFnSwap('parseInt → parseFloat', 'parseInt', 'parseFloat'),
  globalFnSwap('parseFloat → parseInt', 'parseFloat', 'parseInt'),
  globalFnSwap('Number → String', 'Number', 'String'),
  globalFnSwap('String → Number', 'String', 'Number'),
  globalFnSwap('Boolean → Number', 'Boolean', 'Number'),
  globalFnSwap(
    'encodeURIComponent → decodeURIComponent',
    'encodeURIComponent', 'decodeURIComponent'
  ),
  globalFnSwap(
    'decodeURIComponent → encodeURIComponent',
    'decodeURIComponent', 'encodeURIComponent'
  )
]

export const objectMutationRemovals = [
  {
    name: 'Object.freeze() → identity',
    types: ['CallExpression'],
    test: node =>
      isStaticCall(node, 'Object', 'freeze')
      && node.arguments.length === 1,
    mutate: (node, source) => ({
      start: node.start,
      end: node.end,
      replacement: source.slice(
        node.arguments[0].start, node.arguments[0].end
      )
    })
  },
  {
    name: 'Object.seal() → identity',
    types: ['CallExpression'],
    test: node =>
      isStaticCall(node, 'Object', 'seal')
      && node.arguments.length === 1,
    mutate: (node, source) => ({
      start: node.start,
      end: node.end,
      replacement: source.slice(
        node.arguments[0].start, node.arguments[0].end
      )
    })
  },
  {
    name: 'Array.from() → identity',
    types: ['CallExpression'],
    test: node =>
      isStaticCall(node, 'Array', 'from')
      && node.arguments.length >= 1,
    mutate: (node, source) => ({
      start: node.start,
      end: node.end,
      replacement: source.slice(
        node.arguments[0].start, node.arguments[0].end
      )
    })
  },
  {
    name: 'Object.assign() → identity',
    types: ['CallExpression'],
    test: node =>
      isStaticCall(node, 'Object', 'assign')
      && node.arguments.length >= 1,
    mutate: (node, source) => ({
      start: node.start,
      end: node.end,
      replacement: source.slice(
        node.arguments[0].start, node.arguments[0].end
      )
    })
  },
  {
    name: 'structuredClone() → identity',
    types: ['CallExpression'],
    test: node =>
      node.callee?.type === 'Identifier'
      && node.callee.name === 'structuredClone'
      && node.arguments.length >= 1,
    mutate: (node, source) => ({
      start: node.start,
      end: node.end,
      replacement: source.slice(node.arguments[0].start, node.arguments[0].end)
    })
  }
]

export const jsonMethodSwaps = [
  staticMethodSwap(
    'JSON.parse → JSON.stringify', 'JSON', 'parse', 'stringify'
  ),
  staticMethodSwap(
    'JSON.stringify → JSON.parse', 'JSON', 'stringify', 'parse'
  )
]

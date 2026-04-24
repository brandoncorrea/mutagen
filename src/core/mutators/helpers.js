/**
 * Shared helpers and factory functions for AST mutator definitions.
 */

export function findBetween(source, from, to, text) {
  const idx = source.indexOf(text, from)
  return idx !== -1 && idx + text.length <= to ? idx : -1
}

export function isStringLiteral({ type, value }) {
  return type === 'StringLiteral'
    || (type === 'Literal' && typeof value === 'string')
}

export function isNumericLiteral({ type, value }) {
  return type === 'NumericLiteral'
    || (type === 'Literal' && typeof value === 'number')
}

export function isMemberCall({ callee }, methodName) {
  return callee?.type === 'MemberExpression'
    && !callee.computed
    && callee.property?.name === methodName
}

export function isStaticCall({ callee }, objectName, methodName) {
  return callee?.type === 'MemberExpression'
    && !callee.computed
    && callee.object?.name === objectName
    && callee.property?.name === methodName
}

export function binaryOpSwap(name, from, replacement) {
  return {
    name,
    types: ['BinaryExpression'],
    test: node => node.operator === from,
    mutate: ({ left, right }, source) => {
      const idx = findBetween(source, left.end, right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement }
    }
  }
}

export function logicalOpSwap(name, from, replacement) {
  return {
    name,
    types: ['LogicalExpression'],
    test: node => node.operator === from,
    mutate: ({ left, right }, source) => {
      const idx = findBetween(source, left.end, right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement }
    }
  }
}

export function assignmentOpSwap(name, from, replacement) {
  return {
    name,
    types: ['AssignmentExpression'],
    test: node => node.operator === from,
    mutate: ({ left, right }, source) => {
      const idx = findBetween(source, left.end, right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement }
    }
  }
}

export function methodNameSwap(name, from, replacement) {
  return {
    name,
    types: ['CallExpression'],
    test: node => isMemberCall(node, from),
    mutate: node => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement }
    }
  }
}

export function staticMethodSwap(name, obj, from, replacement) {
  return {
    name,
    types: ['CallExpression'],
    test: node => isStaticCall(node, obj, from),
    mutate: node => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement }
    }
  }
}

export function memberCallRemoval(name, method, testArgs) {
  return {
    name,
    types: ['CallExpression'],
    test: node => isMemberCall(node, method)
      && (testArgs ? testArgs(node) : true),
    mutate: ({ callee, end }) => ({
      start: callee.object.end,
      end,
      replacement: ''
    })
  }
}

export function staticMethodRemoval(name, obj, method) {
  return {
    name,
    types: ['CallExpression'],
    test: node => isStaticCall(node, obj, method),
    mutate: ({ callee }) => ({
      start: callee.start,
      end: callee.end,
      replacement: ''
    })
  }
}

export function globalFnSwap(name, from, replacement) {
  return {
    name,
    types: ['CallExpression'],
    test: ({ callee }) => callee?.type === 'Identifier' && callee.name === from,
    mutate: ({ callee }) => ({
      start: callee.start,
      end: callee.end,
      replacement
    })
  }
}

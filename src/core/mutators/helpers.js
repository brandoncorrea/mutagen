/**
 * Shared helpers and factory functions for AST mutator definitions.
 */

export function findBetween(source, from, to, text) {
  const idx = source.indexOf(text, from)
  return idx !== -1 && idx + text.length <= to ? idx : -1
}

export function isStringLiteral(node) {
  return node.type === 'StringLiteral'
    || (node.type === 'Literal' && typeof node.value === 'string')
}

export function isNumericLiteral(node) {
  return node.type === 'NumericLiteral'
    || (node.type === 'Literal' && typeof node.value === 'number')
}

export function isMemberCall(node, methodName) {
  return node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && node.callee.property?.name === methodName
}

export function isStaticCall(node, objectName, methodName) {
  return node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && node.callee.object?.name === objectName
    && node.callee.property?.name === methodName
}

export function binaryOpSwap(name, from, to) {
  return {
    name,
    types: ['BinaryExpression'],
    test: node => node.operator === from,
    mutate: (node, source) => {
      const idx = findBetween(source, node.left.end, node.right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement: to }
    }
  }
}

export function logicalOpSwap(name, from, to) {
  return {
    name,
    types: ['LogicalExpression'],
    test: node => node.operator === from,
    mutate: (node, source) => {
      const idx = findBetween(source, node.left.end, node.right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement: to }
    }
  }
}

export function assignmentOpSwap(name, from, to) {
  return {
    name,
    types: ['AssignmentExpression'],
    test: node => node.operator === from,
    mutate: (node, source) => {
      const idx = findBetween(source, node.left.end, node.right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement: to }
    }
  }
}

export function methodNameSwap(name, from, to) {
  return {
    name,
    types: ['CallExpression'],
    test: node => isMemberCall(node, from),
    mutate: node => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: to }
    }
  }
}

export function staticMethodSwap(name, obj, from, to) {
  return {
    name,
    types: ['CallExpression'],
    test: node => isStaticCall(node, obj, from),
    mutate: node => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: to }
    }
  }
}

export function globalFnSwap(name, from, to) {
  return {
    name,
    types: ['CallExpression'],
    test: node => node.callee?.type === 'Identifier' && node.callee.name === from,
    mutate: node => ({ start: node.callee.start, end: node.callee.end, replacement: to })
  }
}

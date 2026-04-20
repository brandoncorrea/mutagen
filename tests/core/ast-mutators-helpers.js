import { javascript } from '../../src/core/ast-mutators.js'

export function find(name) {
  const m = javascript.find(mutator => mutator.name === name)
  if (!m) throw new Error(`Mutator not found: ${name}`)
  return m
}

export function binExpr(operator, leftStart, leftEnd, rightStart, rightEnd) {
  return {
    type: 'BinaryExpression', operator,
    left: { start: leftStart, end: leftEnd },
    right: { start: rightStart, end: rightEnd },
    start: leftStart, end: rightEnd
  }
}

export function logExpr(operator, leftStart, leftEnd, rightStart, rightEnd) {
  return {
    type: 'LogicalExpression', operator,
    left: { start: leftStart, end: leftEnd },
    right: { start: rightStart, end: rightEnd },
    start: leftStart, end: rightEnd
  }
}

export function assignExpr(operator, leftStart, leftEnd, rightStart, rightEnd) {
  return {
    type: 'AssignmentExpression', operator,
    left: { start: leftStart, end: leftEnd },
    right: { start: rightStart, end: rightEnd },
    start: leftStart, end: rightEnd
  }
}

export function callWithMethod(methodName, propStart, propEnd, nodeStart, nodeEnd) {
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      computed: false,
      property: { name: methodName, start: propStart, end: propEnd },
      object: { name: 's', start: 0, end: 1 },
      start: nodeStart, end: propEnd
    },
    arguments: [{ start: propEnd + 1, end: propEnd + 3 }],
    start: nodeStart, end: nodeEnd
  }
}

export function staticCall(objName, methodName, nodeStart, nodeEnd, propStart, propEnd) {
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      computed: false,
      object: { type: 'Identifier', name: objName, start: nodeStart, end: propStart - 1 },
      property: { name: methodName, start: propStart, end: propEnd },
      start: nodeStart, end: propEnd
    },
    arguments: [],
    start: nodeStart, end: nodeEnd
  }
}

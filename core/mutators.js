/**
 * Built-in AST mutators for JavaScript/TypeScript.
 * Each mutator targets a specific AST node type and returns
 * an array of possible mutations for that node.
 *
 * Mutator shape:
 *   { type: string, mutate(node, source) => Array<Mutation> }
 *
 * Mutation result shapes:
 *   Operator: { operator: string, name: string }
 *   Range:    { start: number, end: number, replacement: string, name: string }
 */

const equalityOps = {
  '===': '!==', '!==': '===',
  '>=': '<', '<=': '>',
  '>': '<=', '<': '>='
}

const arithmeticOps = {
  '+': '-', '-': '+',
  '*': '/', '/': '*',
  '%': '+', '**': '*'
}

const logicalOps = {
  '&&': '||', '||': '&&'
}

const assignmentOps = {
  '+=': '-=', '-=': '+='
}

function operatorMutator(type, opMap) {
  return {
    type,
    mutate(node) {
      const replacement = opMap[node.operator]
      if (!replacement) return []
      return [{ operator: replacement, name: `${node.operator} → ${replacement}` }]
    }
  }
}

const equalityMutator = operatorMutator('BinaryExpression', equalityOps)
const arithmeticMutator = operatorMutator('BinaryExpression', arithmeticOps)
const logicalMutator = operatorMutator('LogicalExpression', logicalOps)
const assignmentMutator = operatorMutator('AssignmentExpression', assignmentOps)

const booleanMutator = {
  type: 'BooleanLiteral',
  mutate(node) {
    const replacement = node.value ? 'false' : 'true'
    const name = node.value ? 'true → false' : 'false → true'
    return [{ start: node.start, end: node.end, replacement, name }]
  }
}

const updateMutator = {
  type: 'UpdateExpression',
  mutate(node) {
    const newOp = node.operator === '++' ? '--' : '++'
    const arg = node.argument.name
    const replacement = node.prefix ? newOp + arg : arg + newOp
    return [{ start: node.start, end: node.end, replacement, name: `${node.operator} → ${newOp}` }]
  }
}

const negationMutator = {
  type: 'UnaryExpression',
  mutate(node) {
    if (node.operator === '!' && node.prefix) {
      return [{ start: node.start, end: node.start + 1, replacement: '', name: '!x → x' }]
    }
    return []
  }
}

export const javascript = [
  equalityMutator,
  arithmeticMutator,
  logicalMutator,
  assignmentMutator,
  booleanMutator,
  updateMutator,
  negationMutator
]

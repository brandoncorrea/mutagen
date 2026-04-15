/**
 * AST-based mutation generation engine.
 * Parses source into an AST, walks the tree, and generates mutations
 * by node type. Returns the same shape as the regex engine.
 */

import { parse } from '@babel/parser'

export function generateMutations(source, mutators, targetLine) {
  if (!mutators.length) return []

  let ast
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      ranges: true
    })
  } catch {
    return []
  }

  const mutatorsByType = groupByType(mutators)
  const sourceLines = source.split('\n')
  const mutations = []

  walk(ast.program, (node) => {
    const handlers = mutatorsByType[node.type]
    if (!handlers) return

    for (const handler of handlers) {
      const results = handler.mutate(node, source)
      for (const result of results) {
        const line = node.loc.start.line
        if (targetLine && line !== targetLine) continue

        const mutatedSource = result.operator
          ? applyOperatorMutation(source, node, result.operator)
          : applyRangeMutation(source, result.start, result.end, result.replacement)
        const original = sourceLines[line - 1]
        const mutatedLines = mutatedSource.split('\n')
        const mutatedLine = mutatedLines[line - 1]

        mutations.push({
          line,
          original: original.trim(),
          mutated: mutatedLine.trim(),
          name: result.name,
          source: mutatedSource
        })
      }
    }
  })

  return mutations
}

function groupByType(mutators) {
  const map = {}
  for (const m of mutators) {
    if (!map[m.type]) map[m.type] = []
    map[m.type].push(m)
  }
  return map
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return
  /* v8 ignore next -- all Babel AST objects have type */
  if (node.type) visitor(node)

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const child = node[key]
    if (Array.isArray(child)) {
      child.forEach(c => walk(c, visitor))
    } else if (child && typeof child === 'object' && child.type) {
      walk(child, visitor)
    }
  }
}

function applyOperatorMutation(source, node, newOperator) {
  const opStr = node.operator
  const searchStart = node.left.end
  const searchEnd = node.right.start
  const between = source.slice(searchStart, searchEnd)
  const opIndex = between.indexOf(opStr)
  const absStart = searchStart + opIndex
  const absEnd = absStart + opStr.length
  return source.slice(0, absStart) + newOperator + source.slice(absEnd)
}

function applyRangeMutation(source, start, end, replacement) {
  return source.slice(0, start) + replacement + source.slice(end)
}

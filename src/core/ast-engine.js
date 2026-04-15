/**
 * AST-based mutation generation engine.
 * Parses source into an AST, walks the tree, and generates mutations
 * by node type. Returns the same shape as the regex engine.
 *
 * Mutator interface:
 *   { name, types: string[], test(node, source, parent) → boolean, mutate(node, source, parent) → patch|null }
 *   patch: { start, end, replacement }
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

  walk(ast.program, null, (node, parent) => {
    const handlers = mutatorsByType[node.type] || []
    for (const handler of handlers) {
      if (handler.test && !handler.test(node, source, parent)) continue

      const result = handler.mutate(node, source, parent)
      if (!result) continue

      const line = node.loc.start.line
      if (targetLine && line !== targetLine) continue

      const mutatedSource = applyRangeMutation(source, result.start, result.end, result.replacement)
      const original = sourceLines[line - 1]
      const mutatedLine = mutatedSource.split('\n')[line - 1]

      mutations.push({
        line,
        original: original.trim(),
        mutated: mutatedLine.trim(),
        name: handler.name || result.name,
        source: mutatedSource
      })
    }
  })

  return mutations
}

function groupByType(mutators) {
  const map = {}
  for (const mutator of mutators) {
    const types = mutator.types || [mutator.type]
    for (const type of types) {
      if (!map[type]) map[type] = []
      map[type].push(mutator)
    }
  }
  return map
}

function walk(node, parent, visitor) {
  if (!isObject(node)) return
  visitor(node, parent)

  for (const key of Object.keys(node).filter(walkableKey)) {
    const child = node[key]
    if (Array.isArray(child))
      child.forEach(c => walk(c, node, visitor))
    else if (isObject(child) && child.type)
      walk(child, node, visitor)
  }
}


const IGNORED_KEYS = new Set(['type', 'start', 'end', 'loc'])
function walkableKey(key) {
  return !IGNORED_KEYS.has(key)
}

function applyRangeMutation(source, start, end, replacement) {
  return source.slice(0, start) + replacement + source.slice(end)
}

function isObject(value) {
  return value && typeof value === 'object'
}

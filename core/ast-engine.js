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
    const handlers = mutatorsByType[node.type]
    if (!handlers) return

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
  for (const m of mutators) {
    const types = m.types || [m.type]
    for (const type of types) {
      if (!map[type]) map[type] = []
      map[type].push(m)
    }
  }
  return map
}

function walk(node, parent, visitor) {
  if (!node || typeof node !== 'object') return
  visitor(node, parent)

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const child = node[key]
    if (Array.isArray(child)) {
      child.forEach(c => walk(c, node, visitor))
    } else if (child && typeof child === 'object' && child.type) {
      walk(child, node, visitor)
    }
  }
}

function applyRangeMutation(source, start, end, replacement) {
  return source.slice(0, start) + replacement + source.slice(end)
}

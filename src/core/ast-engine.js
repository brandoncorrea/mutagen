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

export function generateMutations(source, mutators, targetLine, skipNodes) {
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

  const skipRanges = collectSkipRanges(ast, skipNodes)
  const mutatorsByType = groupByType(mutators)
  const sourceLines = source.split('\n')
  const mutations = []

  walk(ast.program, null, (node, parent) => {
    if (isInSkipRange(node, skipRanges)) return

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

const WALK_SKIP_KEYS = new Set(['type', 'start', 'end', 'loc'])

function walk(node, parent, visitor) {
  if (!isObject(node)) return
  visitor(node, parent)

  for (const key of Object.keys(node)) {
    if (WALK_SKIP_KEYS.has(key)) continue
    const child = node[key]
    if (Array.isArray(child))
      child.forEach(c => walk(c, node, visitor))
    else if (isObject(child) && child.type)
      walk(child, node, visitor)
  }
}

function applyRangeMutation(source, start, end, replacement) {
  return source.slice(0, start) + replacement + source.slice(end)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object'
}

function collectSkipRanges(ast, skipNodes) {
  if (!skipNodes?.length) return []
  const ranges = []
  walk(ast.program, null, node => {
    if (skipNodes.some(pattern => matchesPattern(node, pattern)))
      ranges.push([node.start, node.end])
  })
  return ranges
}

function isInSkipRange(node, ranges) {
  return ranges.some(([start, end]) =>
    node.start >= start && node.end <= end)
}

/**
 * Match an AST node against a pattern object.
 * Each key in the pattern is compared against the corresponding node property.
 * String values match either string properties or identifier names.
 * Object values are matched recursively.
 *
 * @param {Object} node - AST node to test
 * @param {Object} pattern - pattern to match (e.g. { type: 'CallExpression', callee: { name: 'foo' } })
 * @returns {boolean}
 */
export function matchesPattern(node, pattern) {
  return isObject(node) 
    && isObject(pattern)
    && Object.keys(pattern).every(key => matchesValue(node[key], pattern[key]))
}

function matchesValue(nodeVal, patternVal) {
  if (!nodeVal) return
  if (typeof patternVal === 'string')
    return matchesStringPattern(nodeVal, patternVal)
  if (isObject(patternVal))
    return matchesPattern(nodeVal, patternVal)
  return nodeVal === patternVal
}

function matchesStringPattern(nodeVal, patternVal) {
  if (typeof nodeVal === 'string')
    return nodeVal === patternVal
  if (isObject(nodeVal) && nodeVal.type)
    return nodeVal.name === patternVal
  return
}

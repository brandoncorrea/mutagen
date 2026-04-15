/**
 * Unified mutation generation.
 * Combines AST-based mutators and regex-based patterns into a single
 * mutation pipeline. Both engines return the same mutation shape.
 */

import { generateMutations as astGenerate } from './ast-engine.js'
import { generateMutations as regexGenerate, preparePatterns } from './engine.js'

/**
 * Generate mutations using AST mutators, regex patterns, or both.
 *
 * @param {string} source - source code to mutate
 * @param {Object} config - mutation config from prepareMutationConfig
 * @param {Array} [config.mutators] - AST visitor mutators
 * @param {Array} [config.prepared] - prepared regex patterns
 * @param {number} [targetLine] - optional line to restrict mutations to
 * @returns {Array} mutations in standard shape { line, original, mutated, name, source }
 */
export function generateMutations(source, config, targetLine) {
  // Backward compat: plain array is treated as prepared regex patterns
  if (Array.isArray(config))
    return regexGenerate(source, config, targetLine)

  const mutations = []

  if (config.mutators?.length)
    mutations.push(...astGenerate(source, config.mutators, targetLine, config.skipNodes))

  if (config.prepared?.length)
    mutations.push(...regexGenerate(source, config.prepared, targetLine))

  if (config.mutators?.length && config.prepared?.length) {
    const seen = new Set()
    return mutations.filter(m => {
      const key = m.line + ':' + m.mutated
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  return mutations
}

/**
 * Prepare a unified mutation config from user-facing options.
 *
 * @param {Object} options
 * @param {Array} [options.mutators] - AST visitor mutators ({ type, mutate })
 * @param {Array} [options.patterns] - regex patterns ({ pattern, replacement, name, ... })
 * @returns {Object} config for generateMutations
 */
export function prepareMutationConfig({ mutators, patterns, skipNodes } = {}) {
  return {
    mutators: mutators || [],
    prepared: patterns?.length ? preparePatterns(patterns) : [],
    skipNodes: skipNodes || []
  }
}

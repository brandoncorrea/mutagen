/**
 * Mutation generation.
 * Wraps the AST engine with configuration preparation.
 */

import { generateMutations as astGenerate } from './ast-engine.js'

/**
 * Generate mutations using AST mutators.
 *
 * @param {string} source - source code to mutate
 * @param {Object} config - mutation config from prepareMutationConfig
 * @param {Array} config.mutators - AST visitor mutators
 * @param {Array} [config.skipNodes] - AST node patterns to exclude
 * @param {number} [targetLine] - optional line to restrict mutations to
 * @returns {Array} mutations in standard shape { line, original, mutated, name, source }
 */
export function generateMutations(source, config, targetLine) {
  if (!config.mutators?.length) return []
  return astGenerate(source, config.mutators, targetLine, config.skipNodes)
}

/**
 * Prepare a mutation config from user-facing options.
 *
 * @param {Object} options
 * @param {Array} options.mutators - AST visitor mutators ({ name, types, test, mutate })
 * @param {Array} [options.skipNodes] - AST node patterns to exclude from mutation
 * @returns {Object} config for generateMutations
 */
export function prepareMutationConfig({ mutators, skipNodes } = {}) {
  return {
    mutators: mutators || [],
    skipNodes: skipNodes || []
  }
}

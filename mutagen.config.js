import { javascript as astMutators } from './src/core/ast-mutators.js'
import { javascript as regexPatterns } from './src/core/patterns.js'
import { createVitestRunner } from './src/runners/vitest.js'

export default {
  // AST mutators (primary mode) — built-in + custom visitors
  mutators: astMutators,

  // Regex patterns (secondary mode) — for quick pattern-based mutations
  patterns: regexPatterns,

  include: ['src/**/*.js'],
  createRunner: (sourceFile, opts = {}) => createVitestRunner(sourceFile, {
    config: 'vitest.config.js',
    ...opts
  }),
  timeout: 30000,
  reportDir: 'reports/mutation'
}

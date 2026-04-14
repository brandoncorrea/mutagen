import { javascript } from './core/patterns.js'
import { createVitestRunner } from './runners/vitest.js'

export default {
  patterns: javascript,
  exclude: [
    'tests/**/*',
    'node_modules/**/*',
    'coverage/**/*',
    '**/*.config.js'
  ],
  createRunner: sourceFile => createVitestRunner(sourceFile, {
    config: 'vitest.config.js'
  }),
  timeout: 30000,
  reportDir: 'reports/mutation'
}

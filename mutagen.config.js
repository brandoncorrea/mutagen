import { javascript } from './core/patterns.js'
import { createVitestRunner } from './runners/vitest.js'

export default {
  patterns: javascript,
  include: [
    'index.js',
    'bin/**/*.js',
    'core/**/*.js',
    'cli/**/*.js',
    'runners/**/*.js',
    'scripts/**/*.js',
    'stryker.js'
  ],
  exclude: ['**/*.config.js'],
  createRunner: sourceFile => createVitestRunner(sourceFile, {
    config: 'vitest.config.js'
  }),
  timeout: 30000,
  reportDir: 'reports/mutation'
}

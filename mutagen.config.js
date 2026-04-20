import { javascript } from './src/core/ast-mutators.js'
import { createVitestRunner } from './src/runners/vitest.js'

export default {
  mutators: javascript,
  include: ['src/**/*.js'],
  createRunner: (sourceFile, opts = {}) => createVitestRunner(sourceFile, {
    config: 'vitest.config.js',
    ...opts
  }),
  timeout: 15000,
  reportDir: 'reports/mutation'
}

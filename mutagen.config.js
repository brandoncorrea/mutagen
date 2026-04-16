import { javascript as astMutators } from './src/core/ast-mutators.js'
import { createVitestRunner } from './src/runners/vitest.js'

export default {
  mutators: astMutators,
  include: ['src/**/*.js'],
  createRunner: (sourceFile, opts = {}) => createVitestRunner(sourceFile, {
    config: 'vitest.config.js',
    ...opts
  }),
  timeout: 5000,
  reportDir: 'reports/mutation'
}

import { mutators, createVitestRunner } from './src/index.js'

export default {
  mutators: mutators.javascript,
  include: ['src/**/*.js'],
  testInclude: ['tests/**/*.test.js'],
  createRunner: (sourceFile, opts = {}) => createVitestRunner(sourceFile, {
    config: 'vitest.config.js',
    ...opts
  }),
  timeout: 15000,
  reportDir: 'reports/mutation'
}

// Mutation API
export { generateMutations, prepareMutationConfig } from './core/generate.js'

// AST node pattern matching (for skipNodes config)
export { matchesPattern } from './core/ast-engine.js'

// Built-in AST mutators
export * as mutators from './core/ast-mutators.js'

// Runners
export { createVitestRunner } from './runners/vitest.js'
export { createJestRunner } from './runners/jest.js'

// CLI harness
export { createManualRunner } from './cli/manual.js'

// Report utilities
export { mutationId } from './core/mutation-id.js'
export { combineReportData } from './core/report-data.js'
export { diffReports } from './cli/diff.js'

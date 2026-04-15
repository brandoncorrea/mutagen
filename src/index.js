// Mutation API
export { generateMutations, prepareMutationConfig } from './core/generate.js'

// AST node pattern matching (for skipNodes config)
export { matchesPattern } from './core/ast-engine.js'

// Built-in AST mutators
export * as mutators from './core/ast-mutators.js'

// Runner
export { createVitestRunner } from './runners/vitest.js'

// CLI harness
export { createManualRunner } from './cli/manual.js'

// Report utilities
export { combineReportData, mutationId } from './core/report-data.js'
export { diffReports } from './cli/diff.js'

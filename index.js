// Unified mutation API (AST + regex)
export { generateMutations, prepareMutationConfig } from './core/generate.js'

// Built-in AST mutators
export * as mutators from './core/mutators.js'

// Built-in regex pattern sets (secondary mode)
export * as patterns from './core/patterns.js'

// Legacy regex engine (for direct use)
export { generateMutations as generateRegexMutations, preparePatterns } from './core/engine.js'

// Runner
export { createVitestRunner } from './runners/vitest.js'

// CLI harness
export { createManualRunner } from './cli/manual.js'

// Report utilities
export { combineReportData } from './core/report-data.js'
export { diffReports } from './cli/diff.js'

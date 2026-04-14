// Core
export { generateMutations, preparePatterns } from './core/engine.js'

// Built-in pattern sets
export * as patterns from './core/patterns.js'

// Runner
export { createVitestRunner } from './runners/vitest.js'

// CLI harness
export { createManualRunner } from './cli/manual.js'

// Report utilities
export { combineReportData } from './core/report-data.js'
export { diffReports } from './cli/diff.js'

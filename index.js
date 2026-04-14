// Core
export { generateMutations, preparePatterns } from './core/engine.js'
export { tokenizeLine, getTokenContextAt, isInJsxTag, isArrowOperator } from './core/token-context.js'
export { createPool } from './core/pool.js'

// Built-in pattern sets
export * as patterns from './core/patterns.js'

// Runner
export { createVitestRunner } from './runners/vitest.js'
export { createMutantPlugin } from './runners/mutagen-plugin.js'

// CLI harness
export { createManualRunner } from './cli/manual.js'
export { runParallel } from './cli/runner/index.js'

// Report utilities
export { combineReportData } from './core/report-data.js'
export { printSummary, printRunReport } from './cli/report.js'
export { diffReports } from './cli/diff.js'


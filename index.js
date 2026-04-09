// Core
export { generateMutations, preparePatterns } from './core/engine.js'
export { tokenizeLine, getTokenContextAt, isInJsxTag, isArrowOperator } from './core/tokenContext.js'

// Built-in pattern sets
export * as patterns from './core/patterns/index.js'

// Runner
export { createVitestRunner } from './runners/vitest.js'

// CLI harness
export { createManualRunner } from './cli/manual.js'

// Report utilities
export { countStatuses, toJsonMutants } from './core/report-data.js'
export { printSummary, printRunReport } from './cli/report.js'
export { combineReportData, diffReports } from './cli/diff.js'

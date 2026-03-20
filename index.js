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
export { combineReportData, countStatuses, printSummary, toJsonMutants, printRunReport } from './cli/report.js'

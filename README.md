# @bwawan/mutagen

A lightweight, regex-based mutation testing engine for JavaScript/JSX projects.

Requires Node.js >= 20.11.0.

```bash
npm install @bwawan/mutagen
```

## Quick start

1. Create `mutagen.config.js` in your project root:

```js
import { patterns, createVitestRunner } from '@bwawan/mutagen'

export default {
  patterns: [...patterns.javascript],
  include: ['src/**/*.js'],
  exclude: ['**/*.test.js', '**/node_modules'],
  createRunner: sourceFile => createVitestRunner(sourceFile)
}
```

Or list source files explicitly:

```js
export default {
  patterns: [...patterns.javascript],
  sources: ['src/foo.js', 'src/bar.js'],
  createRunner: sourceFile => createVitestRunner(sourceFile)
}
```

2. Run mutations:

```bash
npx mutagen src/foo.js              # Single file
npx mutagen --all                   # All configured sources
npx mutagen --incremental           # Skip unchanged files
npx mutagen --parallel              # Parallel execution (default 2 workers)
npx mutagen --parallel 4            # Parallel with 4 workers
npx mutagen --diff a.json b.json    # Compare two reports
```

## Config file

The `mutagen.config.js` default export is passed directly to `createManualRunner`:

```js
export default {
  patterns: [...],            // Mutation patterns (see Pattern format)
  include: ['src/**/*.js'],   // Glob patterns for source files to mutate
  exclude: ['**/*.test.js'],  // Glob patterns to exclude (optional)
  sources: ['src/foo.js'],    // Explicit source files (takes precedence over include/exclude)
  cwd: process.cwd(),        // Base directory for glob resolution (default: cwd)
  testSources: [],            // Test files to track for incremental invalidation
  createRunner: async (sourceFile) => runner,  // Test runner factory
  reportDir: 'reports/mutation',               // Directory for JSON reports
  reportFile: 'manual-report.json',            // Report filename
  timeout: null               // Default per-mutation timeout in ms
}
```

Use `include`/`exclude` glob patterns to select source files dynamically. If `sources` is provided (non-empty), it takes precedence over `include`/`exclude`. Use `sources` when you need an explicit file list.

## Programmatic API

For custom scripts, use `createManualRunner` directly:

```js
import { createManualRunner, patterns, createVitestRunner } from '@bwawan/mutagen'

// With glob patterns
const runner = createManualRunner({
  patterns: [...patterns.javascript],
  include: ['src/**/*.js'],
  exclude: ['**/*.test.js'],
  createRunner: sourceFile => createVitestRunner(sourceFile)
})

runner.main()
```

Or with explicit sources:

```js
const runner = createManualRunner({
  patterns: [...patterns.javascript],
  sources: ['src/foo.js', 'src/bar.js'],
  createRunner: sourceFile => createVitestRunner(sourceFile)
})

runner.main()
```

## CLI flags

```
<source>                        Mutate a single file
<source> --line 42              Target a single line
<source> --dry-run              List mutations without running
<source> --json                 JSON report output
<source> --timeout 10000        10s timeout per mutation
--all                           Batch all sources
--all --dry-run                 Preview across all sources
--incremental                   Hash-based caching, skip unchanged
--incremental --json            Incremental + JSON report
--parallel                      Run mutations in parallel (default: 2 workers)
--parallel N                    Run with N parallel workers
--diff <before> <after>         Compare two JSON report files
```

`--json`, `--timeout`, and `--parallel` work across single-file, `--all`, and `--incremental` modes.

## Runner interface

The `createRunner` callback receives a source file path and returns a runner object. Two modes are supported:

**File-I/O mode** (basic — mutagen writes mutated source to disk):

```js
async function createRunner(sourceFile) {
  return {
    async run() { return { passed: true, killedBy: [] } },
    async close() {}
  }
}
```

**In-memory mode** (faster — no file I/O per mutation, required for `--parallel`):

```js
async function createRunner(sourceFile) {
  return {
    async run() { return { passed: true, killedBy: [] } },
    async close() {},
    setMutant(source) { /* swap source in memory */ },
    clearMutant() { /* restore original */ }
  }
}
```

If `setMutant` is present, mutagen uses in-memory switching automatically. The built-in Vitest runner supports both modes.

## Vitest runner

Built-in adapter for Vitest with warm/cold fallback, module-graph-based test narrowing, and in-memory mutant switching via a Vite plugin:

```js
import { createVitestRunner } from '@bwawan/mutagen/runners/vitest'

createVitestRunner(sourceFile)

// With options
createVitestRunner(sourceFile, {
  config: 'frontend/vitest.config.js',
  root: 'frontend',
  testFile: 'tests/specific.test.js',
  warm: true   // default: warm rerun, falls back to cold
})
```

## Parallel execution

The `--parallel` flag runs mutations concurrently using an in-process worker pool. Each worker holds its own runner instance with in-memory mutant switching — no file I/O during mutation.

```bash
npx mutagen src/foo.js --parallel       # 2 workers (default)
npx mutagen --all --parallel 8          # 8 workers across all sources
npx mutagen --incremental --parallel 4  # Incremental + parallel
```

For programmatic use:

```js
import { createPool, runParallel } from '@bwawan/mutagen'

// Low-level pool API
const pool = createPool({ workerCount: 4, createRunner })
const outcomes = await pool.run(mutations, { timeout, onResult })
await pool.close()

// High-level parallel runner (same interface as runSingle)
const result = await runParallel({ sourceFile, prepared, createRunner, workerCount: 4 })
```

## Pattern format

```js
{
  pattern: / === /g,        // Regex to match
  replacement: ' !== ',     // What to replace with
  name: '=== → !==',       // Human-readable name
  guard: /regex/,           // Skip if rest-of-line matches (optional)
  nearGuard: /regex/,       // Skip if nearby chars match (optional)
  inStrings: false          // Allow mutation inside string literals (optional)
}
```

The built-in `patterns.javascript` set covers equality, logical, arithmetic, boolean, method, string, array, object, bitwise, and control-flow operators.

## Incremental mode

Incremental mode tracks SHA-256 hashes of source and test files between runs. Only changed files (or files whose tests changed) are re-mutated. Cached results from the previous report carry forward.

```bash
npx mutagen --incremental --json    # Writes merged report with hashes
```

## Diff mode

Compare two JSON reports to find regressions, improvements, and new/removed mutants:

```bash
npx mutagen --diff before.json after.json
```

Returns exit code 1 if regressions are found.

## Stryker integration

Optional utilities for projects using Stryker alongside mutagen:

```js
import {
  cleanStaleSandboxes,
  clearIncrementalCache,
  runStrykerScope,
  mergeReports
} from '@bwawan/mutagen/stryker'

cleanStaleSandboxes()
clearIncrementalCache()
const reportFile = runStrykerScope('core', ['src/a.js', 'src/b.js'])
const survived = mergeReports([reportFile])
```

## License

MIT

# mutagen

A pluggable mutation testing engine for JavaScript/JSX projects.

Not yet published to npm — use as a git submodule:

```bash
git submodule add <repo-url> mutagen
```

## Usage

```js
import { createManualRunner, patterns, createVitestRunner } from './mutagen/index.js'

const runner = createManualRunner({
  patterns: [...patterns.javascript],
  sources: ['src/foo.js', 'src/bar.js'],
  createRunner: (sourceFile) => createVitestRunner(sourceFile, {
    config: 'vitest.config.js',  // optional: workspace config path
    root: '.',                    // optional: workspace root
  })
})

runner.main()
```

## CLI

```
node scripts/mutate.js <source>                        # Mutate a single file
node scripts/mutate.js <source> --line 42              # Target a single line
node scripts/mutate.js <source> --dry-run              # List mutations without running
node scripts/mutate.js <source> --json                 # JSON report output
node scripts/mutate.js <source> --timeout 10000        # 10s timeout per mutation
node scripts/mutate.js --all                           # Batch all sources
node scripts/mutate.js --all --dry-run                 # Dry-run across all sources
node scripts/mutate.js --incremental                   # Skip unchanged files (hash-based)
node scripts/mutate.js --incremental --json            # Incremental + JSON report
node scripts/mutate.js --diff before.json after.json   # Compare two report files
```

Flags `--json` and `--timeout` work across single-file, `--all`, and `--incremental` modes.

## Runner interface

The `createRunner` function receives a source file path and returns a runner:

```js
async function createRunner(sourceFile) {
  return {
    async run() {
      // Run the test suite. Return { passed: boolean }.
      // The suite should cover the source file — directly or transitively.
      return { passed: true }
    },
    async close() {
      // Clean up resources
    }
  }
}
```

## Vitest runner

Built-in adapter for vitest. Supports monorepo workspaces and automatic
warm/cold fallback for vitest v4 compatibility.

```js
import { createVitestRunner } from './mutagen/runners/vitest.js'

// Run entire test suite against mutations
createVitestRunner(sourceFile)

// With workspace options
createVitestRunner(sourceFile, {
  config: 'frontend/vitest.config.js',
  root: 'frontend',
  testFile: 'tests/specific.test.js',  // optional: restrict to one test file
  warm: true,                           // default: try warm rerun, fall back to cold
})
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

## Self-mutation

Mutagen can test itself using `scripts/self-mutate.js`. This runs mutagen's
own patterns against its source code, using a cold subprocess runner to avoid
corrupting the running process.

```
node scripts/self-mutate.js                    # All target modules
node scripts/self-mutate.js core/engine.js     # Single module
node scripts/self-mutate.js --dry-run          # Preview mutations only
node scripts/self-mutate.js --json             # JSON output
```

## Stryker integration (optional)

For projects that use Stryker alongside mutagen's own engine:

```js
import {
  cleanStaleSandboxes,
  clearIncrementalCache,
  runStrykerScope,
  mergeReports
} from './mutagen/stryker.js'

// Clean up leftover Stryker sandbox directories
cleanStaleSandboxes()

// Clear the incremental cache between scoped runs
clearIncrementalCache()

// Run Stryker on a subset of files
const reportFile = runStrykerScope('core', ['src/a.js', 'src/b.js'])

// Merge multiple scoped reports into one; returns survived count
const survived = mergeReports([reportFile, otherReportFile])
```

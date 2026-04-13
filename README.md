# @bwawan/mutagen

A lightweight, regex-based mutation testing engine for JavaScript/JSX projects.

```bash
npm install @bwawan/mutagen
```

## Quick start

Create a mutation runner script in your project:

```js
import { createManualRunner, patterns, createVitestRunner } from '@bwawan/mutagen'

const runner = createManualRunner({
  patterns: [...patterns.javascript],
  sources: ['src/foo.js', 'src/bar.js'],
  createRunner: sourceFile => createVitestRunner(sourceFile)
})

runner.main()
```

Then run it:

```bash
node mutate.js src/foo.js              # Single file
node mutate.js --all                   # All sources
node mutate.js --incremental           # Skip unchanged files
node mutate.js --diff a.json b.json    # Compare two reports
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
--diff <before> <after>         Compare two JSON report files
```

`--json` and `--timeout` work across single-file, `--all`, and `--incremental` modes.

## Runner interface

The `createRunner` callback receives a source file path and returns a runner object:

```js
async function createRunner(sourceFile) {
  return {
    async run() {
      // Run the test suite. Return { passed: boolean, killedBy?: string[] }.
      return { passed: true }
    },
    async close() {
      // Clean up resources
    }
  }
}
```

## Vitest runner

Built-in adapter for Vitest with warm/cold fallback and module-graph-based test narrowing:

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
node mutate.js --incremental --json    # Writes merged report with hashes
```

## Diff mode

Compare two JSON reports to find regressions, improvements, and new/removed mutants:

```bash
node mutate.js --diff before.json after.json
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

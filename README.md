# mutagen

A pluggable mutation testing engine for JavaScript/JSX projects.

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
node scripts/mutate.js <source>                  # Mutate a single file
node scripts/mutate.js <source> --dry-run        # List mutations without running
node scripts/mutate.js <source> --line 42        # Target a single line
node scripts/mutate.js --all --json              # Batch all sources + JSON report
node scripts/mutate.js --all --timeout 10000     # 10s timeout per mutation
```

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

## Stryker integration (optional)

```js
import { runStrykerScope, mergeReports } from './mutagen/stryker.js'
```

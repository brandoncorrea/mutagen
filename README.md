# mutagen

A pluggable mutation testing engine for JavaScript/JSX projects.

## Usage

```js
import { createManualRunner, patterns, createVitestRunner } from './mutagen/index.js'

const runner = createManualRunner({
  patterns: [...patterns.javascript, ...myProjectPatterns],
  targets: [
    { source: 'src/foo.js', test: 'tests/foo.test.js' }
  ],
  createRunner: createVitestRunner
})

runner.main()
```

## CLI

```
node scripts/mutate.js <source> <test>           # Single file
node scripts/mutate.js <source> --dry-run         # List mutations
node scripts/mutate.js --all --json               # Batch + JSON report
node scripts/mutate.js <source> <test> --line 42  # Single line
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

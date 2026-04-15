# @bwawan/mutagen

A lightweight mutation testing engine for JavaScript/TypeScript projects. AST-based mutations with automatic worktree isolation — original source files are never modified.

Requires Node.js >= 20.11.0.

```bash
npm install @bwawan/mutagen
```

## Quick start

1. Create `mutagen.config.js` in your project root:

```js
import { mutators, createVitestRunner } from '@bwawan/mutagen'

export default {
  mutators: [...mutators.javascript],
  include: ['src/**/*.js'],
  exclude: ['**/*.test.js'],
  createRunner: sourceFile => createVitestRunner(sourceFile)
}
```

2. Run mutations:

```bash
npx mutagen --all                   # All configured sources
npx mutagen src/foo.js              # Single file
npx mutagen --incremental           # Skip unchanged files
npx mutagen --all --parallel 4      # 4 parallel workers
npx mutagen --diff a.json b.json    # Compare two reports
```

## Agent usage

Mutagen is designed for agent consumption. Use `--quiet` and `--json` for machine-readable output:

```bash
# One-line summary to stderr, structured JSON to file
npx mutagen --all --quiet --json reports/mutation.json

# Only show surviving mutations (what to fix)
npx mutagen --all --quiet --survivors-only

# Incremental: only re-test changed files, JSON report
npx mutagen --incremental --quiet --json reports/mutation.json

# Only mutate files changed in git (pairs with --all or --incremental)
npx mutagen --all --changed --quiet --json reports/mutation.json

# Retest: re-run only previously-surviving mutations from a report
npx mutagen --retest reports/mutation.json --quiet --json reports/retest.json

# Fail if mutation score drops below 80%
npx mutagen --all --quiet --min-score 80

# Compare reports for regressions (exit code 1 = regressions found)
npx mutagen --diff before.json after.json --json
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All mutations killed |
| 1 | Surviving mutations or errors |
| 2 | Safety check failed (source may be corrupted) |

### JSON report schema

When `--json [path]` is used, a structured report is written:

```json
{
  "score": 85.7,
  "total": 14,
  "killed": 12,
  "survived": 2,
  "timedOut": 0,
  "files": {
    "src/foo.js": { "score": 100, "killed": 8, "total": 8 },
    "src/bar.js": { "score": 66.7, "killed": 4, "total": 6 }
  },
  "survivors": [
    {
      "file": "src/bar.js",
      "line": 42,
      "name": "=== → !==",
      "original": "if (a === b) {}",
      "mutated": "if (a !== b) {}"
    }
  ],
  "deltas": {
    "fixes": ["src/bar.js:10:+ → -"],
    "regressions": [],
    "rerunFiles": ["src/bar.js"],
    "cachedFiles": ["src/foo.js"]
  }
}
```

The `deltas` field is only present in incremental mode.

## Config file

The `mutagen.config.js` default export is passed directly to `createManualRunner`:

```js
export default {
  mutators: [...],            // AST mutators (primary — see Mutator format)
  patterns: [...],            // Regex patterns (secondary — see Pattern format)
  include: ['src/**/*.js'],   // Glob patterns for source files
  exclude: ['**/*.test.js'],  // Glob patterns to exclude (optional)
  sources: ['src/foo.js'],    // Explicit source files (takes precedence over include/exclude)
  cwd: process.cwd(),         // Base directory for glob resolution (default: cwd)
  testSources: [],             // Test files to track for incremental invalidation
  createRunner: async (sourceFile) => runner,  // Test runner factory
  reportDir: 'reports/mutation',               // Directory for JSON reports
  reportFile: 'manual-report.json',            // Report filename
  skipNodes: [],                 // AST node patterns to exclude from mutation (optional)
  timeout: null                  // Default per-mutation timeout in ms
}
```

Use `mutators` for AST-based mutations (recommended) and `patterns` for regex-based mutations. Both can be used together — AST mutations run first, then regex.

`skipNodes` accepts AST node pattern objects. Any node matching a pattern is excluded from mutation along with all its children. Example: skip all `console.log` calls:

```js
skipNodes: [{ type: 'CallExpression', callee: { object: { name: 'console' } } }]
```

## CLI flags

```
<source>                        Mutate a single file
<source> --line 42              Target a single line
<source> --dry-run              List mutations without running
<source> --json [path]          Structured JSON report (optional file path)
<source> --timeout 10000        10s timeout per mutation
--all                           Batch all configured sources
--all --dry-run                 Preview across all sources
--incremental                   Hash-based caching, skip unchanged
--incremental --json            Incremental + JSON report with deltas
--parallel                      Run mutations in parallel (default: 2 workers)
--parallel N                    Run with N parallel workers
--quiet                         Suppress verbose output, one-line summary to stderr
--survivors-only                Only report surviving mutations
--changed                       Only mutate files with uncommitted git changes
--min-score N                   Exit 1 if mutation score is below N%
--retest <report.json>          Re-run only previously-surviving mutations
--diff <before> <after>         Compare two JSON report files
--help, -h                      Show usage information
```

`--json`, `--timeout`, `--parallel`, `--quiet`, `--survivors-only`, and `--changed` work across single-file, `--all`, and `--incremental` modes.

## Programmatic API

```js
import { createManualRunner, mutators, createVitestRunner } from '@bwawan/mutagen'

const runner = createManualRunner({
  mutators: [...mutators.javascript],
  include: ['src/**/*.js'],
  createRunner: sourceFile => createVitestRunner(sourceFile)
})

runner.main()
```

## Runner interface

The `createRunner` callback receives a source file path and returns a runner object:

```js
async function createRunner(sourceFile) {
  return {
    async run() { return { passed: true, killedBy: [] } },
    async close() {}
  }
}
```

Mutagen creates a temporary worktree (project copy) and writes mutations there. Original source files are never modified. The runner receives the worktree path as `sourceFile` and an `options.root` pointing to the worktree root.

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

## Mutator format (AST)

AST mutators target specific node types in the parsed syntax tree:

```js
{
  name: '=== → !==',               // Human-readable name
  types: ['BinaryExpression'],      // ESTree/Babel node types to visit
  test(node, source, parent) {},    // Return true if this node should be mutated
  mutate(node, source, parent) {}   // Return { start, end, replacement } or null
}
```

The built-in `mutators.javascript` set covers equality, logical, arithmetic, boolean, conditional, method, string, array, object, bitwise, update, unary, async, optional chaining, nullish coalescing, spread, void, throw, and property access operators.

AST mutations are precise — they understand syntax structure, so they never accidentally mutate inside strings, comments, or JSX attributes.

## Pattern format (regex)

Regex patterns are available as a secondary mutation mode:

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

The built-in `patterns.javascript` and `patterns.typescript` sets are available for projects that prefer regex-based mutations.

## Parallel execution

The `--parallel` flag runs mutations concurrently using an in-process worker pool. Each worker operates in its own worktree for crash-safe isolation.

```bash
npx mutagen src/foo.js --parallel       # 2 workers (default)
npx mutagen --all --parallel 8          # 8 workers across all sources
npx mutagen --incremental --parallel 4  # Incremental + parallel
```

## Incremental mode

Incremental mode tracks SHA-256 hashes of source and test files between runs. Only changed files (or files whose tests changed) are re-mutated. Cached results carry forward. The JSON report includes `deltas` showing fixes and regressions since the last run.

```bash
npx mutagen --incremental --json reports/mutation.json
```

## Diff mode

Compare two JSON reports to find regressions, improvements, and new/removed mutants:

```bash
npx mutagen --diff before.json after.json
npx mutagen --diff before.json after.json --json   # Machine-readable diff
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

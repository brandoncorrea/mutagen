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
  createRunner: createVitestRunner
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

# JSON report to stdout (for piping)
npx mutagen --all --quiet --json - | jq '.survivors'

# Only show surviving mutations on stdout (what to fix)
npx mutagen --all --survivors-only
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All mutations killed |
| 1 | Surviving mutations or errors |

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
    "src/foo.js": {
      "score": 100, "killed": 8, "total": 8,
      "mutants": [
        { "id": "a1b2c3d4", "name": "=== → !==", "status": "killed", "line": 10,
          "original": "if (a === b) {}", "mutated": "if (a !== b) {}",
          "killedBy": ["tests/foo.test.js"] }
      ]
    },
    "src/bar.js": { "score": 66.7, "killed": 4, "total": 6, "mutants": [] }
  },
  "survivors": [
    {
      "id": "e5f6a7b8",
      "file": "src/bar.js",
      "line": 42,
      "name": "=== → !==",
      "original": "if (a === b) {}",
      "mutated": "if (a !== b) {}",
      "coveredBy": ["tests/bar.test.js"]
    }
  ],
  "deltas": {
    "fixes": [{ "file": "src/bar.js", "line": 10, "name": "+ → -" }],
    "regressions": [],
    "rerunFiles": ["src/bar.js"],
    "cachedFiles": ["src/foo.js"]
  }
}
```

Per-file entries include a `mutants` array with every individual mutant (id, name, status, line, original, mutated, killedBy/coveredBy). Survivors are collected into the top-level `survivors` array for quick access. The `deltas` field is only present in incremental mode.

## Config file

The `mutagen.config.js` default export is passed directly to `createManualRunner`:

```js
export default {
  mutators: [...],            // AST mutators (primary — see Mutator format)
  include: ['src/**/*.js'],   // Glob patterns for source files
  exclude: ['**/*.test.js'],  // Glob patterns to exclude (optional)
  sources: ['src/foo.js'],    // Explicit source files (takes precedence over include/exclude)
  cwd: process.cwd(),         // Base directory for glob resolution (default: cwd)
  testSources: [],             // Explicit test files for incremental invalidation
  testInclude: ['tests/**/*.test.js'],  // Glob patterns to discover test files
  testExclude: [],             // Glob patterns to exclude from test discovery
  createRunner: async (sourceFile, options) => runner,  // Test runner factory
  reportDir: 'reports/mutation',               // Directory for JSON reports
  reportFile: 'manual-report.json',            // Report filename
  skipNodes: [],                 // AST node patterns to exclude from mutation (optional)
  timeout: null                  // Default per-mutation timeout in ms
}
```

Use `mutators` for AST-based mutations. The built-in `mutators.javascript` set covers all common JavaScript operators and constructs.

`skipNodes` accepts AST node pattern objects. Any node matching a pattern is excluded from mutation along with all its children. Example: skip all `console.log` calls:

```js
skipNodes: [{ type: 'CallExpression', callee: { object: { name: 'console' } } }]
```

## CLI flags

```
<source>                        Mutate a single file
<source> --line 42              Target a single line
<source> --dry-run              List mutations without running
<source> --json [path]          Structured JSON report (file path, or - for stdout)
<source> --timeout 10000        10s timeout per mutation
--all                           Batch all configured sources
--all --dry-run                 Preview across all sources
--incremental                   Hash-based caching, skip unchanged
--incremental --json            Incremental + JSON report with deltas
--parallel [N]                  Run mutations in parallel (default: 2 workers, max 32)
--quiet                         Suppress verbose output, one-line summary to stderr
--survivors-only                Only report surviving mutations
--changed                       Only mutate files changed in git (--all and --incremental)
--progress                      Show compact per-file dot notation progress on stderr
--min-score N                   Exit 1 if mutation score is below N%
--retest <report.json>          Re-run only previously-surviving mutations
--diff <before> <after>         Compare two JSON report files
--version, -v                   Print version number
--help, -h                      Show usage information
```

`--json`, `--timeout`, `--parallel`, `--quiet`, `--progress`, and `--survivors-only` work across single-file, `--all`, and `--incremental` modes. `--changed` works with `--all` and `--incremental` only.

## Programmatic API

```js
import { createManualRunner, mutators, createVitestRunner } from '@bwawan/mutagen'

const runner = createManualRunner({
  mutators: [...mutators.javascript],
  include: ['src/**/*.js'],
  createRunner: createVitestRunner
})

runner.main()
```

For Jest projects:

```js
import { createManualRunner, mutators, createJestRunner } from '@bwawan/mutagen'

const runner = createManualRunner({
  mutators: [...mutators.javascript],
  include: ['src/**/*.js'],
  createRunner: (sourceFile, options) => createJestRunner(sourceFile, {
    ...options, config: 'jest.config.js'
  })
})

runner.main()
```

## Runner interface

The `createRunner` callback receives the source file path (inside the temporary worktree) and an options object, and returns a runner:

```js
async function createRunner(sourceFile, { root }) {
  return {
    async run() { return { passed: true, killedBy: [] } },
    async close() {}
  }
}
```

Mutagen creates a temporary worktree (project copy) and writes mutations there. Original source files are never modified. `sourceFile` points into the worktree and `root` is the worktree root directory.

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

## Jest runner

Built-in adapter for Jest (cold mode). Works with any Jest-compatible setup including `next/jest`:

```js
import { createJestRunner } from '@bwawan/mutagen'

createJestRunner(sourceFile)

// With options
createJestRunner(sourceFile, {
  config: 'jest.config.js',
  root: 'frontend'
})
```

### Next.js projects (next/jest)

```js
// mutagen.config.js
import { mutators, createJestRunner } from '@bwawan/mutagen'

export default {
  mutators: [...mutators.javascript],
  include: ['src/**/*.js', 'src/**/*.tsx'],
  exclude: ['**/*.test.*'],
  createRunner: (sourceFile, options) => createJestRunner(sourceFile, {
    ...options, config: 'jest.config.js'
  })
}
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

## License

MIT

# Testing Setup

Stack-specific testing conventions for mutagen. For general testing philosophy, see `/docs/testing-standards.md`.

## Framework

Vitest with ESM. Configuration in `vitest.config.js`.

```bash
npm run test              # Run entire suite
npm run test:coverage     # Run with coverage
npx vitest run <file>     # Run a single file
```

## File Organization

Tests live in a `tests/` directory that mirrors the `src/` structure:

```
src/
  core/
    ast-engine.js
    mutation-status.js
    report-data.js
    pool.js
  cli/
    args.js
    dispatch.js
    retest.js
    runner/
      single.js
      parallel.js
  runners/
    vitest.js
    jest.js
tests/
  core/
    ast-engine.test.js
    report-data.test.js
    pool.test.js
  cli/
    args.test.js
    shared.test.js
    retest.test.js
    helpers.js                  ← shared test utilities
    manual/
      batch.test.js             ← integration tests using createManualRunner
      dispatch-core.test.js
      helpers.js                ← manual-test-specific helpers
    runner/
      single.test.js
      parallel.test.js
  runners/
    jest.test.js
    vitest-warm.test.js
    vitest-cold.test.js
    vitest-helpers.js           ← vitest runner mock utilities
```

Not every source file needs a test file — see "Implicit Coverage Is Real Coverage" in `/docs/testing-standards.md`.

If a single test file grows too large, split it into smaller files. The `tests/cli/manual/` directory demonstrates this pattern — batch, dispatch, incremental, and retest tests are split by concern.

## Test Naming

```javascript
describe('generateMutations', () => {
  it('returns empty array when source has no mutable nodes', () => {
    // Arrange
    // Act
    // Assert
  })

  it('generates one mutation per mutable operator', () => {
    // ...
  })
})
```

Use `describe` for the unit under test and `it` with a plain string describing the behavior.

## Assertions

- Prefer truthiness checks when all you care about is truthy/falsy
- Use concrete expected values when the specific value is the behavior: `expect(stats.killed).toBe(3)`
- For mutation IDs, assert on shape: `expect(id).toMatch(/^[0-9a-f]{8}$/)`
- For report structure, use `toHaveProperty` and `toMatchObject` for partial matching

## Mocking

Mutagen tests mock at three boundaries:

### File system

Most CLI and runner tests mock `node:fs` to avoid real file I/O:

```javascript
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn()
  }
})
```

Use the shared `mockFs(readFileSync, files)` helper from `tests/cli/helpers.js` to set up file contents.

### Temp copies

Mock `createTempCopy` to avoid creating real temp directories:

```javascript
vi.mock('../../src/core/temp-copy.js')

import { createTempCopy } from '../../src/core/temp-copy.js'
import { fakeWorktree } from './helpers.js'

beforeEach(() => {
  createTempCopy.mockReturnValue(fakeWorktree())
})
```

### Runner pool

For parallel execution tests, mock `createPool`:

```javascript
vi.mock('../../src/core/pool.js')

import { createPool } from '../../src/core/pool.js'
import { setupPool } from './helpers.js'

const { poolRun } = setupPool(createPool, {
  killed: [mutation], survived: [], timedOut: []
})
```

### What NOT to mock

- The AST engine (`ast-engine.js`) — test it directly with real source strings
- Mutation status functions (`isKilled`, `isAlive`, `calculateScore`) — pure functions, no I/O
- Report data computation (`buildStructuredReport`) — pure functions, test with real data

## Shared Test Helpers

### `tests/cli/helpers.js`

| Export | Purpose |
|--------|---------|
| `testMutators` | Minimal AST mutator set (equality operator swap) |
| `sourceCode` | Simple source string: `'if (a === b) {}'` |
| `noop` | Silent output object: `{ log: () => {}, error: () => {} }` |
| `fakeRunner(results)` | Mock runner with queued `run()` results |
| `fakeWorktree(root)` | Mock temp copy with `resolve`, `mapPaths`, `cleanup` |
| `createTestRunner(config)` | Wraps `createManualRunner` with silent output |
| `mockFs(readFileSync, files)` | Sets up `readFileSync` mock to return file contents |
| `makeMutant(id, name, status, line)` | Creates a mutant object for report tests |
| `capture()` | Returns `{ out, lines }` for capturing log output |
| `hashOf(content)` | SHA-256 hash prefix for incremental mode tests |

### `tests/runners/vitest-helpers.js`

| Export | Purpose |
|--------|---------|
| `createMockVitest()` | Mock vitest instance with state, projects, module graph |
| `createMockModuleGraph()` | Mock vite module graph with `invalidateAll`, `getModuleById` |

## Running Tests

```bash
# Full suite
npm run test

# Single file
npx vitest run tests/core/ast-engine.test.js

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Only tests affected by uncommitted changes
npx vitest run --changed
```

# Testing Standards

Reference guide for test quality. Read this before writing any tests.

## Test Naming

Test names are specifications. They describe behavior, not implementation. They should read like documentation.

**Good:** `"returns empty array when source has no mutable nodes"`, `"exits 1 when survivors remain"`
**Bad:** `"test parse"`, `"test function 1"`, `"it works"`

Aim for the pattern: `<expected behavior> when <condition>` — but prioritize readability over rigid format.

## Test Structure

Every test follows Arrange → Act → Assert:

```
// Arrange — set up the preconditions
// Act — execute the behavior under test
// Assert — verify the outcome
```

Use `beforeEach`, `afterEach`, `beforeAll`, and `afterAll` hooks to extract shared setup and teardown. This keeps test bodies clean and eliminates duplication. When setup hooks handle the Arrange (and sometimes the Act), the test body can focus entirely on assertions — this is a good thing.

Keep tests readable. If you can't tell what a test does without reading three different hooks, the setup has been over-extracted.

## One Behavior Per Test

Each test verifies ONE logical behavior. Multiple assertions are fine if they all verify the same behavior from different angles. But if a test fails, you should immediately know WHAT broke without reading the test body.

**Good:** Two asserts checking that a report has the right score AND the right survivor count (one behavior: report generation)
**Bad:** One test that checks mutation generation, then checks runner execution, then checks report writing (three behaviors)

## Test Behavior, Not Implementation

Tests should describe WHAT the system does, not HOW it does it internally. Test from the outside in: call public functions, check return values and side effects — not the internal steps that produced them.

**Signs you're testing implementation:**
- Mocking private/internal functions
- Asserting on internal state that isn't part of the public contract
- Tests that break when you refactor without changing behavior
- Testing the exact sequence of internal function calls

**Signs you're testing behavior:**
- Tests use the public API (exported functions)
- Refactoring internals doesn't break tests
- Test names read as user-facing specifications
- Tests would still make sense if you rewrote the implementation from scratch

### Layers of "Outside-In"

Outside-in is not all-or-nothing. There are layers:

- The **CLI layer** (arg parsing, mode dispatch) is separate from the **runner layer** (mutation execution). These can and should be tested independently.
- The **AST engine** has its own contract (source in, mutations out) separate from the **report layer** that formats results.
- **Shared code** that is implicitly tested through its callers may deserve direct tests if it has grown into its own module with its own responsibilities. Promoting it to a directly testable unit means its dependents can fake it out, keeping their tests simpler.
- The question is: does this code have its own contract? If yes, test it directly. If it's a private helper that only exists to serve one caller, implicit coverage is fine.

## Test Independence

- No test may depend on another test's execution or state
- No test may depend on execution order
- Every test sets up its own state and tears it down (setup/teardown hooks count)
- Shared fixtures are fine, but shared MUTABLE state is not

## No Duplicate Tests

Before writing a new test, search the test suite for existing tests that cover the same behavior. Duplication creates noise, false confidence, and maintenance burden.

- If a test already exists for the behavior, **update it** if the behavior has changed
- If two tests cover the same behavior, **remove the weaker one** (less descriptive name, fewer edge cases, more coupled to implementation)
- If a behavior has been removed, **remove the test(s)** for that behavior

Duplicate tests often appear after refactoring when old tests are left behind. Clean these up proactively.

## Implicit Coverage Is Real Coverage

Code does not need its own dedicated test file to be considered tested. A helper function called by the AST engine is tested through the engine's tests. A formatting function used by the report module is tested through the report's tests.

Before declaring code "untested":
1. Trace the call sites
2. Check whether existing tests exercise the code path
3. Only write a new test if the behavior is genuinely uncovered

**Exception:** Shared code that has grown into its own module — with its own responsibilities and multiple consumers — should be promoted to a directly testable unit. This lets you test its contract in isolation and fake it out in dependent tests, keeping those tests simpler and more focused.

Write dedicated tests for shared utilities or complex logic that benefits from isolated edge-case testing. But do not create a test file for every source file as a goal unto itself.

## Dead Code

Dead code is a liability. It bloats the source, bloats the tests, and bloats the payload sent to the user. If a function, module, or branch has no call sites and no reason to exist:

1. Delete the dead code
2. Delete any tests that only covered the dead code
3. Verify the remaining test suite still passes

Do not keep dead code "just in case." Version control exists for that.

## Shared Test Data

Rather than rebuilding test data from scratch in every test file, define shared fixtures that the entire suite can reference.

### What to share

Mutagen tests commonly need:
- **Test mutators** — a small set of AST mutators for generating mutations in test source code
- **Source code strings** — simple JS snippets that produce known mutations (e.g., `'if (a === b) {}'`)
- **Fake runners** — mock runner objects with queued results (`{ passed: true }`, `{ passed: false }`)
- **Fake worktrees** — mock temp copies with `resolve`, `mapPaths`, `cleanup`
- **Report fixtures** — structured report objects with known scores, survivors, and mutants

These live in shared test helpers (`tests/cli/helpers.js`, `tests/runners/vitest-helpers.js`) so every test file can reference them.

### Guidelines

- Keep shared fixtures small and stable
- Tests that need unusual data (edge cases, specific error conditions) should build their own
- Never mutate shared fixtures in a way that leaks between tests

## What to Test

- **Happy path** — the expected, normal usage
- **Edge cases** — empty inputs, nulls, boundary values, off-by-one
- **Error cases** — invalid input, missing data, failure modes (missing files, parse errors, preflight failures)
- **Security boundaries** — see `/docs/security-checklist.md`

## What NOT to Test

- Things that already have tests (see "No Duplicate Tests")
- Framework internals or third-party library behavior (`@babel/parser` parsing, `vitest` runner internals)
- Implementation details that aren't part of the public contract
- Dead code (delete it instead)

## Assertion Style

- Prefer truthiness checks when all you care about is truthy/falsy. If `null` or `undefined` communicate the same thing as `false`, asserting strict `false` is testing implementation, not behavior.
- Use concrete expected values when the specific value is the behavior under test. If the system should return exactly 3 mutations, assert `3` — that's a behavioral claim.
- For random or generated values (like mutation IDs), assert on shape rather than exact values: `expect(id).toMatch(/^[0-9a-f]{8}$/)`.
- For collections, assert on specific contents when the values matter, and on length or emptiness when they don't.

The guiding question: **is the exact value part of the behavior contract, or am I just checking that something reasonable came back?** Let that answer drive the assertion.

## Coverage Philosophy

We value meaningful coverage of critical paths over chasing a percentage. A codebase with 60% coverage of the right things is better than 95% coverage padded with trivial tests.

Focus coverage on:
1. Mutation generation logic (AST engine, mutator definitions)
2. Runner adapters (vitest warm/cold, jest spawning)
3. Report data computation (scoring, survivors, deltas)
4. CLI argument parsing and mode dispatch
5. Error handling and failure modes

Do not write tests solely to increase a coverage number. Every test must protect against a real regression.

## Test Speed

- Unit tests must be fast. If a test hits the network or spawns real processes, it's an integration test — isolate it.
- Prefer in-memory fakes over mocks. Mocks verify interaction; fakes verify behavior.
- If you must mock, mock at the boundary (file system, child processes, vitest API) — never mock the module under test.
- Use `vi.mock('node:fs')` to avoid real file I/O in unit tests.

## Red → Green → Refactor Checklist

Before moving from GREEN to REFACTOR, ask:
- [ ] Is there duplication between the new test and existing tests? Extract shared setup or remove the duplicate.
- [ ] Can the test name be more descriptive?
- [ ] Is the test coupled to implementation details?

Before moving from REFACTOR to the next RED, ask:
- [ ] Are all tests still green?
- [ ] Is the production code as simple as it can be for the behaviors tested so far?
- [ ] Did I commit?

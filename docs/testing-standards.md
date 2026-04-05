# Testing Standards

Reference guide for test quality. Read this before writing any tests.

## Test Naming

Test names are specifications. They describe behavior, not implementation. They should read like documentation. Both stacks use BDD-style testing libraries where test names are plain strings.

**Good:** `"rejects expired tokens"`, `"returns empty list when no results found"`
**Bad:** `"test validate"`, `"test function 1"`, `"it works"`

Aim for the pattern: `<expected behavior> when <condition>` — but prioritize readability over rigid format.

## Test Structure

Every test follows Arrange → Act → Assert:

```
// Arrange — set up the preconditions
// Act — execute the behavior under test
// Assert — verify the outcome
```

Use `before`, `after`, `before-all`, and `after-all` hooks to extract shared setup and teardown. This keeps test bodies clean and eliminates duplication. When setup hooks handle the Arrange (and sometimes the Act), the test body can focus entirely on assertions — this is a good thing.

Keep tests readable. If you can't tell what a test does without reading three different hooks, the setup has been over-extracted.

## One Behavior Per Test

Each test verifies ONE logical behavior. Multiple assertions are fine if they all verify the same behavior from different angles. But if a test fails, you should immediately know WHAT broke without reading the test body.

**Good:** Two asserts checking that a created user has the right name AND email (one behavior: user creation)
**Bad:** One test that checks user creation, then checks login, then checks profile fetch (three behaviors)

## Test Behavior, Not Implementation

Tests should describe WHAT the system does, not HOW it does it internally. Test from the outside in: dispatch events, call public functions, render components, hit endpoints. Check the side effects and outputs — not the internal steps that produced them.

**Signs you're testing implementation:**
- Mocking private methods
- Asserting on internal state that isn't part of the public contract
- Tests that break when you refactor without changing behavior
- Testing the exact sequence of internal method calls
- Reaching into component internals instead of interacting through the rendered UI

**Signs you're testing behavior:**
- Tests use the public API or rendered output
- Refactoring internals doesn't break tests
- Test names read as user-facing specifications
- Tests would still make sense if you rewrote the implementation from scratch

### Layers of "Outside-In"

Outside-in is not all-or-nothing. There are layers:

- The **HTTP layer** (routing, middleware) is separate from the **business logic layer** of each handler. These can and should be tested independently.
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

Code does not need its own dedicated test file to be considered tested. A helper function called by a component is tested through that component's tests. A validation function used by an API handler is tested through the handler's tests.

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

Most applications have a core domain that shows up in nearly every test — users, accounts, projects, etc. Rather than rebuilding this data from scratch in every test file, define a shared set of well-known test entities that the entire suite can reference.

### Named Personas

Give test entities recognizable names and fixed roles. When someone reading a test sees "Jarvis," they should immediately know that's an admin user — not some throwaway string.

Build these personas into the in-memory database or test fixtures so they're available by default. Tests that need a user to already exist shouldn't have to create one first.

### Guidelines

- Define personas in your shared test helpers (`spec_helper`, `testHelpers`, etc.) so every test file can reference them
- Give each persona a clear, memorable identity: a name, a role, and any other attributes that matter to the domain. Document what each persona represents if it isn't obvious from the name.
- Keep the set small and stable — a handful of well-known personas is better than dozens of forgettable ones
- Tests that create, update, or delete entities can operate on these shared personas rather than building throwaway data
- Tests that need a truly unique or unusual entity (edge cases, specific error conditions) should still build their own — shared data is for the common cases
- Never mutate shared personas in a way that leaks between tests. Reset the in-memory database between tests, or treat shared personas as templates that each test copies from

### Why This Matters

Uniform test data makes the suite read like a cohesive story rather than a collection of isolated fragments. A new developer scanning test files picks up the cast of characters quickly: "Alice is a regular user, Jarvis is an admin, this org has three members." That familiarity reduces cognitive load and makes tests easier to write, read, and review.

## What to Test

- **Happy path** — the expected, normal usage
- **Edge cases** — empty inputs, nulls, boundary values, off-by-one
- **Error cases** — invalid input, missing data, failure modes
- **Component integration** — the scenario may work in isolation, but does it work when rendered with its parent?
- **Security boundaries** — see `/docs/security-checklist.md`

## What NOT to Test

- Things that already have tests (see "No Duplicate Tests")
- Framework internals or third-party library behavior
- Implementation details that aren't part of the public contract
- Dead code (delete it instead)

## Backend API Testing

Backend tests have two layers, and they should be tested separately:

**Handler tests** verify business logic — that given certain input, the handler produces the correct output and side effects. These call the handler function directly, which keeps them simpler and avoids the complexity of setting up the full HTTP stack for every test case.

**Route tests** verify the HTTP wiring — that the right methods and paths invoke the right handlers, and that middleware (auth, validation, error handling) is applied correctly. Route tests should **mock the handler** and verify it was invoked, rather than asserting on response bodies or status codes. This is one of the rare cases where mocks are preferred — you only care that the correct function was called for the correct method and path.

This separation means changes to handler logic only break handler tests, and changes to routing only break route tests. If route tests assert on response codes or bodies, a handler change breaks both layers — exactly the kind of coupling we want to avoid.

## Assertion Style

- Prefer truthiness checks when all you care about is truthy/falsy. If `null` or `undefined` communicate the same thing as `false`, asserting strict `false` is testing implementation, not behavior.
- Use concrete expected values when the specific value is the behavior under test. If the system should return exactly 3 results, assert `3` — that's a behavioral claim.
- For random or generated values, assert on boundaries or shape rather than exact values.
- For collections, assert on specific contents when the values matter, and on length or emptiness when they don't.

The guiding question: **is the exact value part of the behavior contract, or am I just checking that something reasonable came back?** Let that answer drive the assertion.

## Coverage Philosophy

We value meaningful coverage of critical paths over chasing a percentage. A codebase with 60% coverage of the right things is better than 95% coverage padded with trivial tests.

Focus coverage on:
1. Business logic and domain rules
2. Security and validation boundaries
3. Error handling and failure modes
4. Complex conditional logic

Do not write tests solely to increase a coverage number. Every test must protect against a real regression.

## Test Speed

- Unit tests must be fast. If a test hits the network, disk, or database, it's an integration test — isolate it.
- Prefer in-memory fakes over mocks. Mocks verify interaction; fakes verify behavior.
- If you must mock, mock at the boundary (I/O, network, clock) — never mock the class under test.

## Red → Green → Refactor Checklist

Before moving from GREEN to REFACTOR, ask:
- [ ] Is there duplication between the new test and existing tests? Extract shared setup or remove the duplicate.
- [ ] Can the test name be more descriptive?
- [ ] Is the test coupled to implementation details?

Before moving from REFACTOR to the next RED, ask:
- [ ] Are all tests still green?
- [ ] Is the production code as simple as it can be for the behaviors tested so far?
- [ ] Did I commit?

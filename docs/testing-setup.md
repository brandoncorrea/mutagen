# Testing Setup — React + Node (JavaScript)

Stack-specific testing conventions for React (frontend) and Node (backend) projects without TypeScript. For general testing philosophy, see `/docs/testing-standards.md`.

## Framework

Use whatever testing framework the project already has. If none is established:

- **Recommended:** Vitest (fast, ESM-native, compatible with Jest API)
- **Also fine:** Jest (widely used, mature ecosystem)
- **Component testing:** React Testing Library (`@testing-library/react`) — this is non-negotiable for React components. Never use Enzyme.

## File Organization

Tests live in a separate `tests` directory that mirrors the `src` structure. Test helpers also live under `tests`.

```
src/
  auth/
    authMiddleware.js
    tokenValidation.js
  users/
    userService.js
  components/
    LoginForm.jsx
    UserProfile.jsx
  shared/
    validators.js
tests/
  auth/
    authMiddleware.test.js
    tokenValidation.test.js       ← only if it has its own contract
  users/
    userService.test.js
  components/
    LoginForm.test.jsx
    UserProfile.test.jsx
  shared/
    validators.test.js            ← shared utilities deserve their own tests
  helpers/
    testHelpers.js                ← shared test utilities (factories, setup, etc.)
```

Not every source file needs a test file — see "Implicit Coverage Is Real Coverage" in `/docs/testing-standards.md`.

If a single test file grows too large, split it into smaller files under a directory named for the component under test:

```
tests/
  components/
    LoginForm/
      LoginForm.validation.test.jsx
      LoginForm.submission.test.jsx
```

## Test Naming

```javascript
describe('LoginForm', () => {
  it('displays validation errors when submitted with empty fields', () => {
    // Arrange
    // Act
    // Assert
  })

  it('calls onSubmit with email and password when form is valid', () => {
    // ...
  })
})
```

Use `describe` for the unit under test and `it` with a plain string describing the behavior. Use `beforeEach`, `afterEach`, `beforeAll`, and `afterAll` to extract shared setup and teardown.

## Assertions

- Prefer truthiness checks when all you care about is truthy/falsy — don't assert strict `false` when `null` or `undefined` communicate the same thing
- Use concrete expected values when the specific value is the behavior: `expect(items).toHaveLength(3)` when exactly 3 is the contract
- For random or generated values, assert on boundaries or shape rather than exact values
- For DOM assertions, use Testing Library matchers: `toBeInTheDocument()`, `toHaveTextContent()`, `toBeVisible()`

## React Component Testing

Always use React Testing Library. Test from the user's perspective — what they see and interact with.

```javascript
import { render, screen, fireEvent } from '@testing-library/react'
import LoginForm from '../../src/components/LoginForm'

it('displays error message when email is invalid', () => {
  // Arrange
  render(<LoginForm />)

  // Act
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'not-an-email' }
  })
  fireEvent.click(screen.getByRole('button', { name: /submit/i }))

  // Assert
  expect(screen.getByText(/valid email/i)).toBeInTheDocument()
})
```

### Do
- Query by role, label, placeholder, or text — how a user finds elements
- Fire events (click, change, submit) — how a user interacts
- Assert on visible output — what a user sees

### Don't
- Don't query by test ID unless no semantic query works
- Don't test `useState` values directly
- Don't assert on component instance methods or internal state
- Don't shallow render — render the real component

## Backend API Testing

Backend tests have two layers. See "Backend API Testing" in `/docs/testing-standards.md` for the rationale.

**Handler tests** call the handler function directly. This keeps them focused on business logic:

```javascript
import { createPost } from '../../src/posts/postHandler.js'

describe('createPost handler', () => {
  it('returns the created post with a generated ID', () => {
    const result = createPost({ title: 'Hello', body: 'World' }, mockUser)

    expect(result.status).toBe('created')
    expect(result.entity.id).toBeTruthy()
    expect(result.entity.authorId).toBe(mockUser.id)
  })

  it('rejects requests missing a title', () => {
    const result = createPost({ body: 'World' }, mockUser)

    expect(result.status).toBe('invalid')
    expect(result.errors.title).toBeTruthy()
  })
})
```

**Route tests** mock the handler and verify wiring only — that the correct HTTP method and path invoke the correct handler, and that middleware is applied. Route tests should **not** assert on response bodies or status codes that belong to the handler's contract. This way, changes to handler logic only break handler tests, and changes to routing only break route tests.

```javascript
import request from 'supertest'
import { createApp } from '../../src/app.js'
import * as postHandler from '../../src/posts/postHandler.js'

describe('POST /api/posts', () => {
  it('routes to the createPost handler', async () => {
    const spy = vi.spyOn(postHandler, 'createPost').mockReturnValue({ status: 'created' })
    const app = createApp(testConfig)

    await request(app)
      .post('/api/posts')
      .send({ title: 'Hello', body: 'World' })
      .set('Authorization', `Bearer ${validToken}`)

    expect(spy).toHaveBeenCalled()
  })

  it('rejects unauthenticated requests before reaching the handler', async () => {
    const spy = vi.spyOn(postHandler, 'createPost')
    const app = createApp(testConfig)

    await request(app)
      .post('/api/posts')
      .send({ title: 'Hello', body: 'World' })

    expect(spy).not.toHaveBeenCalled()
  })
})
```

## Mocking

- Mock at I/O boundaries: database calls, HTTP requests, file system, clock
- Use `vi.fn()` / `jest.fn()` for function spies at boundaries
- Never mock the module under test
- Prefer in-memory implementations over mocks when possible (e.g., an in-memory store instead of mocking the database client)
- For time: use `vi.useFakeTimers()` / `jest.useFakeTimers()`
- For HTTP: use `msw` (Mock Service Worker) for frontend network mocking
- For shared code promoted to a testable module, fake it in dependent tests rather than using the real implementation
- For route tests, mock the handler and verify invocation — route tests verify wiring, not logic

```javascript
// Good — mock the boundary
vi.mock('../../src/db/instance.js', () => ({
  findUserByEmail: vi.fn()
}))

// Bad — mock the function you're testing
vi.mock('../../src/userService.js') // NO
```

## Running Tests

Tests run in watch mode by default:

```bash
# Run entire suite
npm run test

# Run with coverage
npm run test:coverage

# Run a single file
npm run test tests/auth/authMiddleware.test.js
```

Ensure these commands are in `package.json` scripts and that the suite runs in CI.

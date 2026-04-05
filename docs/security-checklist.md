# Security Checklist

Audit guide for web applications. Work through this checklist for every feature or module you review.

## The Core Principle

**Never trust external input.** Not from the browser. Not from a mobile client. Not from an external API. Not from a webhook. Any data that crosses a trust boundary must be validated before use. The backend is the source of truth — everything else is untrusted until proven otherwise.

## 1. Input Validation

### The Frontend/Backend Contract
- [ ] The frontend submits **only user input** — not fully-formed entities
- [ ] The backend **builds the entity** from the submitted input, adding server-controlled fields (IDs, timestamps, ownership, status, computed values)
- [ ] The backend validates **all input fields** independently, regardless of what the frontend does
- [ ] Validation logic that can be shared between frontend and backend **is** shared (same language on both sides makes this possible — use it)
- [ ] Backend validations **extend** shared validations with server-only concerns (uniqueness checks, authorization, database constraints)
- [ ] Data from external services is validated the same way client data is — external APIs can return unexpected formats, missing fields, or malicious payloads

### What to Check
- [ ] No endpoint blindly saves a client-submitted object to the database
- [ ] All string inputs are bounded (max length) and trimmed
- [ ] Numeric inputs have range validation
- [ ] Enum fields are validated against allowed values on the backend
- [ ] Arrays and collections have size limits
- [ ] Nested objects are validated — not just the top-level fields
- [ ] File uploads are validated for type, size, and content (not just extension)
- [ ] Invalid types and formats are coerced where reasonable (e.g., string `"3"` to number `3`) — but keep coercion light; don't write exhaustive format-guessing logic

### Red Flag
If you see a route handler that does something like `db.save(req.body)` or the equivalent — that is a **critical finding**. An attacker can add any field they want: `role: "admin"`, `price: 0`, `verified: true`.

## 2. Authentication

- [ ] JWTs are validated on every protected request (signature, expiration, issuer)
- [ ] JWT secrets are not hardcoded in source — they come from environment/config
- [ ] Token expiration is set and enforced (short-lived access tokens, longer refresh tokens)
- [ ] Session cookies use `HttpOnly`, `Secure`, and `SameSite` flags
- [ ] Session invalidation works — logging out actually destroys the session server-side
- [ ] Password reset tokens are single-use and time-limited
- [ ] Authentication failures return generic messages (don't reveal whether a user exists)

## 3. Authorization

- [ ] Every endpoint checks that the authenticated user has permission to perform the action
- [ ] Users cannot access or modify other users' data by changing an ID in the URL or body
- [ ] Admin/elevated routes have role checks — not just authentication checks
- [ ] Authorization is checked on the **backend**, not just hidden in the frontend UI
- [ ] Bulk operations verify permission for each item, not just the first

### Red Flag
If authorization logic lives only in the frontend (hiding buttons, conditional rendering), any authenticated user can access any endpoint. Always verify server-side.

## 4. Injection

- [ ] SQL/database queries use parameterized queries or your ORM's built-in escaping — never string concatenation
- [ ] User input is never interpolated into shell commands
- [ ] HTML output escapes user-provided content (XSS prevention)
- [ ] URLs constructed from user input are validated (prevent open redirects, SSRF)
- [ ] JSON responses set `Content-Type: application/json` (prevents browser sniffing)

## 5. Data Exposure

- [ ] API responses do not include fields the requesting user shouldn't see (passwords, tokens, other users' private data)
- [ ] Error messages in production do not leak stack traces, SQL queries, or internal paths
- [ ] Sensitive data (passwords, tokens, keys) is never logged
- [ ] Database credentials and API keys are in environment variables, not in source code
- [ ] `.env` files and secrets are in `.gitignore`

## 6. Rate Limiting & Abuse

- [ ] Authentication endpoints (login, register, password reset) have rate limiting
- [ ] Expensive operations (search, file upload, export) have rate limiting
- [ ] APIs that return lists have pagination with enforced max page sizes

## 7. CSRF / Cross-Origin

- [ ] State-changing requests (POST, PUT, DELETE) have CSRF protection
- [ ] CORS is configured to allow only expected origins — not `*` in production
- [ ] Cookie-based auth uses `SameSite` attribute

## 8. Dependencies

- [ ] No known vulnerabilities in dependencies (run `npm audit` / check deps)
- [ ] Dependencies are pinned to specific versions or ranges
- [ ] Unused dependencies are removed

## Severity Levels

When reporting findings, classify them:

- **Critical** — Exploitable now with no authentication or trivial effort. Examples: unauthenticated admin endpoints, raw `db.save(req.body)`, SQL injection, hardcoded secrets in source.
- **High** — Exploitable by an authenticated attacker or requires some knowledge. Examples: missing authorization checks, IDOR vulnerabilities, missing input validation on sensitive fields.
- **Medium** — Defense-in-depth gaps. Examples: missing rate limiting, overly verbose error messages, missing security headers.
- **Low** — Best practice improvements. Examples: missing `SameSite` cookie flag, dependency version pinning, unused dependencies.

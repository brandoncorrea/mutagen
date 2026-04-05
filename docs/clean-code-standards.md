# Clean Code Standards — JavaScript (React + Node)

Clean code is a UX problem. Our users are other developers, coding agents, and our
future selves — we're creating a user experience for people who read our code.

Like art, code quality is almost always subjective, but you can tell good code from bad
code because the good code follows rules. This document defines those rules. Any of
them can be broken — but only with reason and intention. Breaking a rule because you
thought about it and decided the code is clearer without it is clean code. Breaking a
rule because you didn't know it existed is not.

## Naming

Names are the most important tool for readability. Invest time in them.

- **Variables** — describe what they hold, not their type. `remainingAttempts` not `num` or `int1`.
- **Functions** — describe what they do with a verb. `calculateDiscount` not `discount` or `doStuff`.
- **Booleans** — read as a yes/no question. `isExpired`, `hasPermission`, `shouldRetry`.
- **Constants** — describe the meaning, not the value. `MAX_LOGIN_ATTEMPTS` not `THREE`.
- **Avoid abbreviations** unless universally understood (`url`, `id`, `http` are fine; `usr`, `mgr`, `ctx` are not).
- **Avoid generic names** — `data`, `info`, `item`, `result`, `temp`, `value` almost always have a better name.
- **React components are PascalCase — always.** Functions that return JSX are components regardless of how they're invoked. Whether called via `.map()`, invoked directly, or rendered as `<Component />`, the invocation style is an implementation detail — the return type determines the convention.

If you need a comment to explain what a variable or function does, the name is wrong. Rename it.

### Framework Conventions Win

When a framework convention conflicts with a general clean-code heuristic, the
framework convention wins. React has PascalCase for components. CSS Modules have
camelCase for class names. These conventions aren't just style — they affect tooling
(React DevTools, Fast Refresh, linter rules), build behavior, and developer
expectations. A name that's "technically more readable" by general rules but breaks
framework expectations is not clean — it's wrong.

## Functions

### Do One Thing

A function does one thing if you cannot meaningfully extract another function from it. If you can describe it only with "and" or "then," split it.

### Keep Them Short

Aim for ~10 lines. This isn't a hard ceiling — some functions will be longer and that's
fine — but if a function exceeds 10 lines, look for extraction opportunities. If it
exceeds 20, it almost certainly does more than one thing.

### Limit Parameters

- 0-2 parameters: ideal
- 3 parameters: acceptable, consider a parameter object
- 4+ parameters: refactor into a parameter object or split the function

### Phantom Parameters

If a parameter always receives the same value at every call site, it's not a real
parameter — it's a phantom. Hard-code it into the function and remove it from the
signature. The parameter can always be reintroduced later if requirements actually
demand it. Until then, it's noise that every caller has to know about for no reason.

```javascript
// Every caller passes "utf-8" — it's not a real choice
readFile(path, "utf-8")
readFile(otherPath, "utf-8")

// Just hard-code it
function readFile(path) {
  return fs.readFileSync(path, "utf-8")
}
```

### No Flag Arguments

A boolean parameter that switches a function between two behaviors means the function
does two things. Split it.

```javascript
// Bad — what does `true` mean here?
processOrder(order, true, false)

// Good — two functions with clear names
shipOrder(order)
holdOrder(order)
```

If you see `fn(x, true)` or `fn(x, false)` and can't tell what the boolean controls
without reading the implementation, that's a flag argument. Extract it into separate
functions with descriptive names.

### Minimize Nesting

Maximum 2 levels of indentation inside a function. Deeper nesting obscures logic.

**Techniques to reduce nesting:**
- **Early returns / guard clauses** — handle the edge case and return immediately
- **Extract method** — pull the nested block into a named function
- **Invert the condition** — flip `if (condition) { ...long block... } else { return }` to `if (!condition) return`

### Extract Complex Conditions

When an `if` statement has a compound condition, extract it into a well-named function
or variable. The name should describe the *business meaning* of the condition, not its
mechanics.

```javascript
// Bad — the reader has to parse the logic to understand the intent
if (user.role === "admin" || (user.role === "editor" && post.authorId === user.id)) {
  // ...
}

// Good — the intent is immediately clear
const canEditPost = isAdmin(user) || isAuthor(user, post)
if (canEditPost) {
  // ...
}
```

This applies regardless of condition length. Even a two-part condition is worth
extracting if the business meaning isn't obvious from the raw expressions.

### No Side Effects

A function named `checkPassword` should not also initialize a session. If it has side
effects, the name must communicate them: `checkPasswordAndInitSession` — or better,
split it into two functions.

## No Unnecessary Ceremony

Write the simplest form that communicates the intent. Extra syntax that adds nothing
is noise.

**Arrow functions:** Drop braces and `return` when the body is a single expression.
Drop parentheses around a single parameter.

```javascript
// Noisy
const getName = (user) => { return user.name }
items.forEach((item) => { item.activate() })

// Clean
const getName = user => user.name
items.forEach(item => item.activate())
```

**Destructuring.** Use it to pull out what you need. It names things at the point of
use and avoids repetitive dot access.

```javascript
// Noisy
const name = props.name
const email = props.email

// Clean
const { name, email } = props
```

**Object shorthand:** Use property shorthand when variable names match keys.

```javascript
// Noisy
return { name: name, email: email, role: role }

// Clean
return { name, email, role }
```

**No trailing commas.** The last item in a list or the last property in an object does
not get a trailing comma. It's noise.

```javascript
// Noisy
const config = {
  host: "localhost",
  port: 3000,   // <-- unnecessary
}

// Clean
const config = {
  host: "localhost",
  port: 3000
}
```

**Hashmap / object formatting.** Expand vertically when there are 3+ key-value pairs.
One or two pairs can stay on one line. Use visual judgment — two pairs with long values
should expand; four pairs using object shorthand can stay inline. Be consistent within
a single object: either everything on one line or everything expanded. Never mix.

```javascript
// Fine — two short pairs
const point = { x: 10, y: 20 }

// Fine — four shorthand pairs, still scannable
const props = { name, email, role, active }

// Expand — three or more non-trivial pairs
const user = {
  name: "Alice",
  email: "alice@example.com",
  role: "admin"
}

// Bad — inconsistent. Pick one.
const user = { name: "Alice",
  email: "alice@example.com", role: "admin" }
```

**if/else braces.** Single-line branches don't need braces. But if *any* branch in an
if/else chain uses braces, add them to *all* branches for consistency.

```javascript
// Fine — all branches are one-liners, no braces needed
if (status === "active") doSomething()
else if (status === "pending") queueForReview()
else logUnknownStatus(status)

// Fine — one branch needs braces, so all get braces
if (status === "active") {
  doSomething()
} else if (status === "pending") {
  queueForReview()
  notifyAdmin()
} else {
  logUnknownStatus(status)
}

// Bad — inconsistent bracing
if (status === "active") doSomething()
else if (status === "pending") {
  queueForReview()
  notifyAdmin()
} else logUnknownStatus(status)
```

**Ternaries:** Use them for simple value selection. If the ternary is hard to read at
a glance, use an `if`.

**`===` over `==`.** Always use strict equality unless you have a documented reason
for loose comparison.

**Avoid `var`.** Use `const` by default. Use `let` only when reassignment is necessary.
If you reach for `let`, consider whether a different structure would avoid the
reassignment.

**Template literals over concatenation.** Use backtick strings when interpolating.
String concatenation with `+` is harder to read and easier to break.

```javascript
// Noisy
const msg = "Hello " + user.name + ", you have " + count + " items."

// Clean
const msg = `Hello ${user.name}, you have ${count} items.`
```

**`async/await` over `.then()` chains.** Flattens the code. Easier to read, easier to
debug, easier to add error handling.

This isn't about being clever or terse. It's about removing visual noise so the
reader's attention goes to what the code *does*, not how it's punctuated.

## React Components

**Early return from components.** If a React component has a loading or empty state,
handle it first and return early — don't nest the entire component body inside a
condition. If the main branch is substantial, extract it into its own component.

```jsx
// Noisy
function UserProfile({ user }) {
  if (user) {
    return (
      <div>
        {/* ...50 lines of JSX... */}
      </div>
    )
  } else {
    return <Spinner />
  }
}

// Better — early return
function UserProfile({ user }) {
  if (!user) return <Spinner />

  return (
    <div>
      {/* ...50 lines of JSX... */}
    </div>
  )
}

// Best — early return + extraction
function UserProfile({ user }) {
  if (!user) return <Spinner />

  return <UserProfileContent user={user} />
}
```

## Magic Values

Inline numbers and strings with no context are unreadable. Give them a name.

```javascript
// Bad — what is 86400000? What is 3?
setTimeout(reconnect, 86400000)
if (attempts > 3) lock(account)

// Good
const ONE_DAY_MS = 86400000
setTimeout(reconnect, ONE_DAY_MS)

const MAX_LOGIN_ATTEMPTS = 3
if (attempts > MAX_LOGIN_ATTEMPTS) lock(account)
```

Exceptions: `0`, `1`, `-1`, empty string, and `null` are usually self-evident in
context and don't need names. Use judgment — if the meaning is obvious, don't
over-name it.

## Comments

### When Comments Are Warranted

- **Why, not what.** Explain business reasons, tradeoffs, or non-obvious constraints.
- **Legal or regulatory requirements.**
- **TODOs with a bead ID** — `// TODO(bd-42): Handle rate limiting` ties the comment to tracked work.
- **Warnings** — `// WARNING: This is called from multiple threads`

### When Comments Are Code Smells

- Explaining what the code does → rename things instead
- Commented-out code → delete it. Git remembers.
- Journal comments or change logs → that's what git log is for
- Closing brace comments (`// end if`, `// end for`) → the function is too long, extract methods

## Dead Code

Dead code is a liability. It bloats the source, bloats the tests, bloats the payload,
and misleads anyone reading it into thinking it matters. If a function, module, branch,
or variable has no call sites and no reason to exist:

1. Delete the dead code
2. Delete any tests that only covered the dead code
3. Verify the remaining test suite still passes

Commented-out code is dead code. Delete it. Git remembers.

Unreachable branches (an `else` that can never trigger, a `case` that no value ever
hits) are dead code. Delete them.

Do not keep dead code "just in case." Version control exists for that.

## Error Handling

- **Prefer exceptions over error codes.**
- **Null is fine.** Returning `null` (or `undefined`) is often the cleanest signal that nothing was found. Don't wrap it in an empty collection unless the caller actually benefits from it. If the return is implicitly `undefined` (e.g., a function that falls through without a return), don't add an explicit `return null` — the implicit behavior is clear enough.
- **Don't pass null** as a function argument.
- **Catch specific exceptions**, not generic ones.
- **Error handling is one thing** — a function that handles errors should do little else. Extract the "happy path" logic from the error handling logic.

## Structure and Organization

### The Newspaper Metaphor

Read a file top to bottom like a newspaper article. High-level summary at the top
(public interface, component definition), details deeper down (private helpers, utility
functions). Callers above callees.

### Vertical Distance

Things that are related should be close together. If function A calls function B, they
should be near each other in the file. Don't make the reader jump around.

### Line Length

Keep lines under 80 characters. Long lines force horizontal scrolling, break side-by-side diffs, and make code harder to scan. If a line exceeds 80 characters, it's usually a sign that the expression is doing too much — extract a variable, break the chain across lines, or pull logic into a named function.

Exceptions where exceeding 80 characters is acceptable:
 - **Import statements** — a long package path or a destructured import with several names
 - **URLs in comments** — you can't break a URL across lines
 - **String literals** — error messages, template strings, or other content where breaking mid-sentence hurts readability more than the long line does
 - **Test names** — descriptive `it` and `describe` strings should read as one sentence

The common thread: content that is inherently one unit where breaking it creates more noise than the long line does.

### File Length

Aim for files under 100 lines. Files over 200 lines almost certainly have multiple
responsibilities and should be split. Files containing JSX/HTML templates are an
exception — the template markup can push line counts up. The 100-line target applies
primarily to the functional parts of the code (logic, handlers, services, utilities).

### Screaming Architecture

The project's directory structure should scream what the application *does*, not what
framework it uses. A glance at the top-level folders should tell you the domain —
users, posts, billing, campaigns — not the technical layers (controllers, models,
services, utils).

```
// Bad — screams "I'm a web framework"
controllers/
models/
services/
utils/

// Good — screams "I manage users and billing"
users/
billing/
campaigns/
shared/
```

Group by feature or domain concept. Put the handler, service, validation, and tests
for "users" in the `users/` directory — not scattered across four layer folders.

### The Boy Scout Rule

Leave every file cleaner than you found it. If you touch a file to make a change,
improve one small thing: a name, a comment, a simplification. Over time, the codebase
gets better instead of worse.

## DRY — But Not Prematurely

Duplication is acceptable when:
- You've only seen the pattern once (it might not actually be a pattern)
- The two instances might diverge as requirements evolve
- The abstraction would be harder to understand than the duplication

Extract a shared abstraction after you see the same pattern THREE times. At that point,
you understand what varies and what doesn't.

## SOLID at a Glance

- **Single Responsibility** — a class/module has one reason to change
- **Open/Closed** — extend behavior without modifying existing code
- **Liskov Substitution** — subtypes must be substitutable for their base types
- **Interface Segregation** — don't force clients to depend on methods they don't use
- **Dependency Inversion** — depend on abstractions, not concretions

You don't need to cite these principles by name. Just follow them. If a class has two
reasons to change, split it. If you're modifying a switch statement every time you add
a case, use polymorphism.

## Agent-Friendly Code

These rules are good practice for humans too, but coding agents benefit from them
disproportionately. Agents pattern-match aggressively, read code literally, and
struggle with indirection. The cleaner and more consistent the code, the better
agents work with it.

### Consistency Over Preference

If the codebase does something one way, do it that way everywhere — even if you prefer
another style. Three different patterns for the same thing (three ways to fetch data,
three error response shapes, three component structures) means an agent will pick one
arbitrarily or mix them. One pattern, used everywhere, means the agent learns it once
and applies it correctly.

When in doubt, grep for precedent before introducing a new pattern.

### Colocate Context

If understanding a function requires reading 5 other files, an agent has to load all of
them — and might not. Self-contained functions with minimal distant dependencies are
easier for agents to work with correctly. This reinforces screaming architecture:
keeping a feature's handler, validation, and tests in the same directory means the
agent doesn't have to hunt.

### No Clever Code

Agents take code literally. Obscure language tricks, overly dense one-liners, or
"smart" patterns that require deep language expertise to parse will trip them up more
than they'd trip a human. If a junior developer would need to stop and think about it,
an agent will probably misread it.

Write obvious code. Save your cleverness for the architecture.

### Avoid Dynamic Dispatch

`eval`, dynamic `require`, computed property names for method routing, metaprogramming —
agents can't statically trace any of these. They'll miss call sites, misunderstand
what's being invoked, and produce broken refactors. If you must use dynamic dispatch,
document it explicitly — but prefer static, traceable function calls.

### One Clear Export Per File

When a file exports one thing and the filename matches, agents can reason about the
dependency graph without opening every file. `userService.js` exports the user service.
`formatDate.js` exports `formatDate`. No guessing, no scanning, no surprises.

Files that export a grab bag of loosely related utilities (`utils.js`, `helpers.js`)
are hard for agents and humans alike. Prefer smaller, focused files with obvious names.

### Organized Imports

Keep imports sorted and grouped. Sorted imports are scannable, diffable, and make
duplicates obvious. An agent adding a new import to a sorted list will place it
correctly. An agent adding an import to an unsorted pile may put it anywhere.

Group imports into sections, separated by a blank line, in this order:

1. **Node built-ins** — `fs`, `path`, `http`, etc.
2. **External packages** — `react`, `express`, `lodash`, etc.
3. **Internal modules** — your own code, relative imports

Within each group, sort alphabetically by module path. This makes imports scannable,
keeps diffs clean, and makes duplicates obvious.

```javascript
import fs from "fs"
import path from "path"

import express from "express"
import jwt from "jsonwebtoken"

import { createUser } from "../users/userService.js"
import { validateEmail } from "../shared/validators.js"
```

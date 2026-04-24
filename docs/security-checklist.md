# Security Checklist

Audit guide for mutagen. Work through this checklist when reviewing changes that touch file I/O, process spawning, config loading, or dependency updates.

## The Core Principle

Mutagen is a CLI dev tool that runs in the developer's project directory with full filesystem access. It reads source files, spawns test processes, creates temp directories, and writes JSON reports. The trust boundary is the **config file** and **CLI arguments** — everything else is internal.

## 1. Config File Loading

The config file (`mutagen.config.js`) is loaded via dynamic `import()` and executed as JavaScript. This is intentional — the config defines mutators, runner factories, and glob patterns. But it means:

- [ ] Config path is resolved from cwd or `--config` flag — never from user input in a report or external source
- [ ] Config loading failures produce a clear error message without leaking system paths beyond the config path itself
- [ ] The config is loaded exactly once at startup — never re-evaluated during mutation runs

### What NOT to worry about

The config file runs arbitrary code by design. This is the same trust model as `jest.config.js`, `vite.config.js`, or any other JS config. The user controls their own config.

## 2. Child Process Spawning

The Jest runner spawns `npx jest` as a child process. This is the primary process-execution boundary.

- [ ] Arguments to `spawn` are passed as an array, not a shell string — no shell injection risk
- [ ] `stdio` is set to `['ignore', 'pipe', 'pipe']` — stdin is not passed through
- [ ] Output buffers are capped (`MAX_BUFFER`) to prevent memory exhaustion from malicious test output
- [ ] The `cwd` option, when set, comes from the config's `root` field — not from external input
- [ ] Active processes are tracked and killed on runner close

### Red Flag

If any code path interpolates user-provided strings into a shell command or passes untrusted input to `exec`/`execSync` without an args array — that is a **critical finding**.

## 3. Temporary File Isolation

Each mutation worker creates a temp copy of the project via `createTempCopy`. This is the crash-safety boundary — original source files are never modified.

- [ ] Temp directories are created in `os.tmpdir()` with `mkdtempSync` — unpredictable names
- [ ] `node_modules` is symlinked, not copied — no risk of modifying dependencies
- [ ] `.git` is excluded from the copy — no risk of corrupting git state
- [ ] Temp directories are cleaned up in `finally` blocks and signal handlers
- [ ] `rmSync` uses `{ recursive: true, force: true }` — cleanup doesn't throw on missing files

### Red Flag

If mutation source is ever written to the original project directory instead of the temp copy — that is a **critical finding**. The invariant is: `writeFileSync` for mutation source always targets `tempSourceFile` (inside the temp copy), never the original path.

## 4. Report File I/O

Mutagen reads previous reports (for incremental/retest/diff modes) and writes new reports (JSON).

- [ ] Report paths come from CLI args or config — not from report content
- [ ] `tryLoadJson` handles parse failures gracefully — no crashes on malformed JSON
- [ ] Report directories are created with `mkdirSync({ recursive: true })` — no symlink-following attacks in the report path
- [ ] Report content is serialized via `JSON.stringify` — no code execution from report data

## 5. Dependencies

Mutagen has two runtime dependencies:

| Package | Purpose | Risk |
|---------|---------|------|
| `@babel/parser` | AST parsing of source files | Parses untrusted source code — parser bugs could cause crashes but not code execution |
| `picomatch` | Glob pattern matching for source/test file discovery | Matches file paths against user-defined patterns — regex DoS is theoretically possible with pathological patterns |

- [ ] Run `npm audit` before each release
- [ ] Dependencies use semver ranges (`^`) — patch/minor updates are accepted automatically
- [ ] No unused dependencies in `package.json`
- [ ] `vitest` and `@vitest/coverage-v8` are devDependencies only — not shipped to users

## Severity Levels

When reporting findings, classify them:

- **Critical** — Code execution or file corruption outside the temp copy. Examples: shell injection in process spawning, writing mutations to original source files, executing code from report JSON.
- **High** — Data loss or denial of service. Examples: temp directory cleanup failure leaving gigabytes on disk, unbounded memory growth from test output, config loading from untrusted path.
- **Medium** — Defense-in-depth gaps. Examples: missing buffer caps on process output, verbose error messages leaking filesystem structure, missing signal handler cleanup.
- **Low** — Best practice improvements. Examples: dependency version pinning, temp directory naming predictability, missing error handling in edge cases.

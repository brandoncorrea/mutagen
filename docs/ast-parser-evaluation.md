# AST Parser Evaluation (mu-81cl)

Compared **@babel/parser**, **acorn**, and **oxc-parser** for the upcoming
AST-based mutation engine.

## Feature Matrix

| Feature             | @babel/parser 7.29 | acorn 8.16 (+acorn-jsx) | oxc-parser 0.125 |
|---------------------|--------------------|-------------------------|-------------------|
| JavaScript (ES2024) | ✅                 | ✅                      | ✅                |
| TypeScript          | ✅ (plugin)        | ❌                      | ✅ (native)       |
| JSX                 | ✅ (plugin)        | ✅ (acorn-jsx plugin)   | ✅ (native)       |
| TSX                 | ✅ (plugin)        | ❌                      | ✅ (native)       |
| Location info       | ✅ start/end/loc   | ✅ start/end/loc        | ✅ start/end      |
| Comment preservation| ✅ ast.comments    | ✅ onComment callback   | ✅ result.comments |
| Error recovery      | Limited (semantic) | ❌ (hard fail)          | ✅ (always partial)|
| AST standard        | Babel AST          | ESTree                  | ESTree            |
| Pure JavaScript     | ✅                 | ✅                      | ❌ (native addon) |

## Parse Speed (100 iterations, 200-function source ≈ 2000 LOC)

| Parser         | JS (ms/parse) | TS (ms/parse) | Relative |
|----------------|---------------|---------------|----------|
| @babel/parser  | ~14           | ~1.0          | 1x       |
| acorn          | ~11           | N/A           | 0.8x     |
| oxc-parser     | ~5            | ~0.03         | 0.3x     |

oxc-parser is **3x faster** for JS and **30-70x faster** for TS.

## Install Size (KB)

| Package                | Size  |
|------------------------|-------|
| @babel/parser          | 1972  |
| acorn + acorn-jsx      | 608   |
| oxc-parser             | 1468  |

## AST Shape Divergences

| Construct          | @babel/parser              | acorn / oxc-parser       |
|--------------------|----------------------------|--------------------------|
| Root node          | `File > Program`           | `Program`                |
| Optional chaining  | `OptionalMemberExpression` | `ChainExpression` (ESTree)|
| Optional call      | `OptionalCallExpression`   | `ChainExpression` (ESTree)|

For mutation testing, these divergences are minor — we use `start`/`end` byte
offsets for string splicing, not full code generation.

## Recommendation: @babel/parser

**Choose @babel/parser.** Rationale:

1. **Full language coverage**: JS, TS, JSX, TSX via plugins — no gaps.
2. **Stable API**: v7.29, mature, semver-stable. oxc-parser is v0.125 (pre-1.0).
3. **Pure JavaScript**: No native binary addon. Works everywhere Node runs without
   platform-specific binaries. oxc-parser requires native compilation per platform.
4. **Ecosystem**: Largest community, most documentation, widest adoption. Every
   major JS tool uses babel's parser (ESLint via @babel/eslint-parser, Prettier, etc).
5. **Sufficient speed**: Parsing is not the bottleneck in mutation testing — running
   tests is. We parse each file once; the 14ms/parse vs 5ms/parse difference is
   negligible compared to test execution time.
6. **Error recovery**: Limited but present. oxc is better here, but for mutation
   testing we expect valid source files (if it doesn't parse, we skip the file).

**Why not acorn**: No TypeScript support. This is a dealbreaker — TS is ubiquitous.

**Why not oxc-parser (yet)**: Pre-1.0 API instability + native binary dependency.
When oxc reaches 1.0, it would be a strong upgrade candidate for speed-sensitive
workloads. The AST is ESTree-compatible, so switching later would be straightforward.

## Integration Notes for AST Engine (mu-4vox)

- Use `@babel/parser` with `parse(source, { sourceType: 'module', plugins: [...] })`
- Enable plugins based on file extension: `.ts` → `['typescript']`, `.jsx` → `['jsx']`,
  `.tsx` → `['typescript', 'jsx']`
- Walk the AST to find mutable nodes (BinaryExpression, LogicalExpression,
  UnaryExpression, UpdateExpression, Literal, etc.)
- Use `node.start` / `node.end` byte offsets for string splicing — no code
  generation needed
- Access `ast.program.body` (babel wraps in `File` → `Program`)
- Skip nodes inside comments (use `ast.comments` ranges)

## Test Evidence

All evaluation tests in `tests/ast/parser-eval.test.js` (34 tests).

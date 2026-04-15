/**
 * @babel/parser validation for AST-based mutation testing.
 *
 * Verifies that @babel/parser (the chosen parser — see docs/ast-parser-evaluation.md)
 * handles all language variants and AST node types needed by the mutation engine.
 *
 * Bead: mu-81cl
 */
import { describe, it, expect } from 'vitest'
import { parse } from '@babel/parser'

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseJS(source) {
  return parse(source, { sourceType: 'module', plugins: [] })
}

function parseTS(source) {
  return parse(source, { sourceType: 'module', plugins: ['typescript'] })
}

function parseJSX(source) {
  return parse(source, { sourceType: 'module', plugins: ['jsx'] })
}

function parseTSX(source) {
  return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
}

// ── Language Support ────────────────────────────────────────────────────────

describe('@babel/parser: language support', () => {
  it('parses modern JavaScript (ES2024)', () => {
    const ast = parseJS(`
      function add(a, b) {
        if (a > 0 && b > 0) return a + b
        return a === b ? 0 : a - b
      }
      const greet = (name) => \`Hello, \${name}!\`
      class Calc { #value = 0; add(n) { this.#value += n; return this; } }
      const first = [1,2,3]?.[0] ?? -1
    `)
    expect(ast.type).toBe('File')
    expect(ast.program.body.length).toBeGreaterThan(0)
  })

  it('parses TypeScript', () => {
    const ast = parseTS(`
      interface User { id: number; name: string; email?: string; }
      type Result<T> = { ok: true; value: T } | { ok: false; error: string }
      function process(user: User): Result<string> {
        return { ok: true, value: user.name }
      }
      enum Status { Active = 'active', Inactive = 'inactive' }
      class Service<T extends User> {
        private users: T[] = []
        findById(id: number): T | undefined {
          return this.users.find(u => u.id === id)
        }
      }
    `)
    expect(ast.program.body.length).toBeGreaterThan(0)
  })

  it('parses JSX', () => {
    const ast = parseJSX(`
      function Greeting({ name, count }) {
        if (!name) return <div className="error">No name</div>
        return (
          <div>
            <h1>Hello, {name}!</h1>
            {count > 0 && <span>{count}</span>}
          </div>
        )
      }
    `)
    expect(ast.program.body.length).toBeGreaterThan(0)
  })

  it('parses TSX', () => {
    const ast = parseTSX(`
      interface Props { name: string; count?: number; }
      const Counter: React.FC<Props> = ({ name, count = 0 }) => {
        const positive: boolean = count > 0
        return (
          <div>
            <h2>{name}</h2>
            {positive && <span>+{count}</span>}
          </div>
        )
      }
    `)
    expect(ast.program.body.length).toBeGreaterThan(0)
  })
})

// ── AST Node Types for Mutation ─────────────────────────────────────────────

describe('@babel/parser: mutable node types', () => {
  it('BinaryExpression with location info', () => {
    const ast = parseJS('const x = a > b;')
    const expr = ast.program.body[0].declarations[0].init
    expect(expr.type).toBe('BinaryExpression')
    expect(expr.operator).toBe('>')
    expect(expr.start).toBeDefined()
    expect(expr.end).toBeDefined()
    expect(expr.loc).toBeDefined()
  })

  it('LogicalExpression', () => {
    const ast = parseJS('const x = a && b || c;')
    const expr = ast.program.body[0].declarations[0].init
    expect(expr.type).toBe('LogicalExpression')
    expect(expr.operator).toBe('||')
    expect(expr.left.type).toBe('LogicalExpression')
    expect(expr.left.operator).toBe('&&')
  })

  it('UnaryExpression', () => {
    const ast = parseJS('const x = -a; const y = !b;')
    const neg = ast.program.body[0].declarations[0].init
    expect(neg.type).toBe('UnaryExpression')
    expect(neg.operator).toBe('-')

    const not = ast.program.body[1].declarations[0].init
    expect(not.type).toBe('UnaryExpression')
    expect(not.operator).toBe('!')
  })

  it('UpdateExpression', () => {
    const ast = parseJS('let x = 0; x++; x--;')
    expect(ast.program.body[1].expression.type).toBe('UpdateExpression')
    expect(ast.program.body[1].expression.operator).toBe('++')
    expect(ast.program.body[2].expression.type).toBe('UpdateExpression')
    expect(ast.program.body[2].expression.operator).toBe('--')
  })

  it('AssignmentExpression', () => {
    const ast = parseJS('let x = 0; x += 1; x -= 2;')
    expect(ast.program.body[1].expression.type).toBe('AssignmentExpression')
    expect(ast.program.body[1].expression.operator).toBe('+=')
    expect(ast.program.body[2].expression.type).toBe('AssignmentExpression')
    expect(ast.program.body[2].expression.operator).toBe('-=')
  })

  it('ConditionalExpression (ternary)', () => {
    const ast = parseJS('const x = a ? b : c;')
    const expr = ast.program.body[0].declarations[0].init
    expect(expr.type).toBe('ConditionalExpression')
    expect(expr.test).toBeDefined()
    expect(expr.consequent).toBeDefined()
    expect(expr.alternate).toBeDefined()
  })

  it('BooleanLiteral', () => {
    const ast = parseJS('const x = true; const y = false;')
    const t = ast.program.body[0].declarations[0].init
    expect(t.type).toBe('BooleanLiteral')
    expect(t.value).toBe(true)

    const f = ast.program.body[1].declarations[0].init
    expect(f.type).toBe('BooleanLiteral')
    expect(f.value).toBe(false)
  })

  it('NumericLiteral', () => {
    const ast = parseJS('const x = 42; const y = 0; const z = -1;')
    const num = ast.program.body[0].declarations[0].init
    expect(num.type).toBe('NumericLiteral')
    expect(num.value).toBe(42)
  })

  it('StringLiteral', () => {
    const ast = parseJS("const x = 'hello'; const y = \"\";")
    const str = ast.program.body[0].declarations[0].init
    expect(str.type).toBe('StringLiteral')
    expect(str.value).toBe('hello')
  })

  it('OptionalMemberExpression (?.)', () => {
    const ast = parseJS('const x = a?.b;')
    const expr = ast.program.body[0].declarations[0].init
    expect(expr.type).toBe('OptionalMemberExpression')
    expect(expr.optional).toBe(true)
  })

  it('NullishCoalescing (??)', () => {
    const ast = parseJS('const x = a ?? b;')
    const expr = ast.program.body[0].declarations[0].init
    expect(expr.type).toBe('LogicalExpression')
    expect(expr.operator).toBe('??')
  })

  it('ReturnStatement', () => {
    const ast = parseJS('function f() { return 42; }')
    const body = ast.program.body[0].body.body
    expect(body[0].type).toBe('ReturnStatement')
    expect(body[0].argument).toBeDefined()
  })

  it('ThrowStatement', () => {
    const ast = parseJS("function f() { throw new Error('x'); }")
    const body = ast.program.body[0].body.body
    expect(body[0].type).toBe('ThrowStatement')
  })

  it('AwaitExpression', () => {
    const ast = parseJS('async function f() { const x = await fetch(); }')
    const decl = ast.program.body[0].body.body[0].declarations[0].init
    expect(decl.type).toBe('AwaitExpression')
  })

  it('SpreadElement', () => {
    const ast = parseJS('const x = [...a, ...b];')
    const arr = ast.program.body[0].declarations[0].init
    expect(arr.elements[0].type).toBe('SpreadElement')
  })

  it('CallExpression for method mutations', () => {
    const ast = parseJS("const x = 'hello'.toUpperCase().trim();")
    const expr = ast.program.body[0].declarations[0].init
    expect(expr.type).toBe('CallExpression')
    expect(expr.callee.property.name).toBe('trim')
  })
})

// ── Location Accuracy ───────────────────────────────────────────────────────

describe('@babel/parser: location accuracy for string splicing', () => {
  it('start/end byte offsets enable precise replacement', () => {
    const source = 'const x = a === b;'
    const ast = parse(source, { sourceType: 'module' })
    const expr = ast.program.body[0].declarations[0].init

    // Verify we can use offsets to extract the original text
    const original = source.slice(expr.start, expr.end)
    expect(original).toBe('a === b')

    // Verify operator position allows targeted replacement
    const left = source.slice(expr.left.start, expr.left.end)
    const right = source.slice(expr.right.start, expr.right.end)
    expect(left).toBe('a')
    expect(right).toBe('b')
  })

  it('works for nested expressions', () => {
    const source = 'const x = a > 0 && b < 10;'
    const ast = parse(source, { sourceType: 'module' })
    const expr = ast.program.body[0].declarations[0].init

    expect(source.slice(expr.start, expr.end)).toBe('a > 0 && b < 10')
    expect(source.slice(expr.left.start, expr.left.end)).toBe('a > 0')
    expect(source.slice(expr.right.start, expr.right.end)).toBe('b < 10')
  })

  it('works for multiline code', () => {
    const source = 'function f(a, b) {\n  return a + b;\n}'
    const ast = parse(source, { sourceType: 'module' })
    const ret = ast.program.body[0].body.body[0]
    const addition = source.slice(ret.argument.start, ret.argument.end)
    expect(addition).toBe('a + b')
  })
})

// ── Comment Preservation ────────────────────────────────────────────────────

describe('@babel/parser: comment preservation', () => {
  it('captures line and block comments', () => {
    const source = '// line\nconst x = 1; /* block */'
    const ast = parse(source, { sourceType: 'module' })
    expect(ast.comments).toHaveLength(2)
    expect(ast.comments[0].type).toBe('CommentLine')
    expect(ast.comments[1].type).toBe('CommentBlock')
  })

  it('comment ranges can be used to skip mutations', () => {
    const source = '/* skip this */ const x = a + b; // also skip'
    const ast = parse(source, { sourceType: 'module' })

    const commentRanges = ast.comments.map(c => [c.start, c.end])
    const expr = ast.program.body[0].declarations[0].init

    // The binary expression is NOT inside any comment
    const inComment = commentRanges.some(
      ([start, end]) => expr.start >= start && expr.end <= end
    )
    expect(inComment).toBe(false)
  })
})

// ── Error Recovery ──────────────────────────────────────────────────────────

describe('@babel/parser: error handling', () => {
  it('throws on invalid syntax by default', () => {
    expect(() => parseJS('const x = ;')).toThrow()
  })

  it('errorRecovery handles semantic errors', () => {
    const ast = parse('class Foo { #x = 1; #x = 2; }', {
      sourceType: 'module',
      errorRecovery: true
    })
    expect(ast.errors.length).toBeGreaterThan(0)
    expect(ast.program).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { find, binExpr } from './ast-mutators-helpers.js'

describe('ast-mutators: statements', () => {
  describe('conditional expression', () => {
    it('cond → true (ternary) replaces condition with true', () => {
      const mutator = find('cond → true (ternary)')
      const node = {
        type: 'ConditionalExpression',
        test: { start: 0, end: 4 },
        consequent: { start: 7, end: 8 },
        start: 0, end: 12
      }
      expect(mutator.test(node)).toBe(true)
      const patch = mutator.mutate(node, 'cond ? b : c')
      expect(patch).toEqual({ start: 0, end: 4, replacement: 'true' })
    })

    it('cond → false (ternary) replaces condition with false', () => {
      const mutator = find('cond → false (ternary)')
      const node = {
        type: 'ConditionalExpression',
        test: { start: 0, end: 4 },
        consequent: { start: 7, end: 8 },
        start: 0, end: 12
      }
      expect(mutator.test(node)).toBe(true)
      const patch = mutator.mutate(node, 'cond ? b : c')
      expect(patch).toEqual({ start: 0, end: 4, replacement: 'false' })
    })
  })

  describe('throw removal', () => {
    it('throw → return replaces throw keyword', () => {
      const m = find('throw → return')
      const node = { type: 'ThrowStatement', start: 2, end: 22 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '  throw new Error()')
      expect(patch.replacement).toBe('return')
    })
  })

  describe('property access', () => {
    it('.length → .length + 1 appends + 1', () => {
      const m = find('.length → .length + 1')
      const node = {
        type: 'MemberExpression', computed: false,
        property: { name: 'length' },
        start: 0, end: 10
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'arr.length')
      expect(patch).toEqual({ start: 10, end: 10, replacement: ' + 1' })
    })
  })

  describe('conditional negation insertion', () => {
    it('if (cond) → if (!cond) inserts negation into if-statement test', () => {
      const m = find('if (cond) → if (!cond)')
      const node = {
        type: 'IfStatement',
        test: { type: 'Identifier', name: 'ready', start: 4, end: 9 },
        start: 0, end: 20
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'if (ready) { go() }')
      expect(patch).toEqual({ start: 4, end: 4, replacement: '!' })
    })

    it('while (cond) → while (!cond) inserts negation into while-statement test', () => {
      const m = find('if (cond) → if (!cond)')
      const node = {
        type: 'WhileStatement',
        test: { type: 'Identifier', name: 'running', start: 7, end: 14 },
        start: 0, end: 25
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'while (running) { tick() }')
      expect(patch).toEqual({ start: 7, end: 7, replacement: '!' })
    })

    it('skips when test is already negated (!cond)', () => {
      const m = find('if (cond) → if (!cond)')
      const node = {
        type: 'IfStatement',
        test: { type: 'UnaryExpression', operator: '!', prefix: true, start: 4, end: 10 },
        start: 0, end: 20
      }
      expect(m.test(node)).toBe(false)
    })

    it('matches non-! unary expressions (typeof, -, ~)', () => {
      const m = find('if (cond) → if (!cond)')
      const node = {
        type: 'IfStatement',
        test: { type: 'UnaryExpression', operator: 'typeof', prefix: true, start: 4, end: 16 },
        start: 0, end: 30
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'if (typeof x === "string") {}')
      expect(patch).toEqual({ start: 4, end: 4, replacement: '!' })
    })

    it('matches when test is a call expression', () => {
      const m = find('if (cond) → if (!cond)')
      const node = {
        type: 'IfStatement',
        test: { type: 'CallExpression', start: 4, end: 14 },
        start: 0, end: 25
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'if (isReady()) { go() }')
      expect(patch).toEqual({ start: 4, end: 4, replacement: '!' })
    })
  })

  describe('block statements', () => {
    it('return {} → Object.freeze prepends Object.freeze(', () => {
      const m = find('return {} → Object.freeze (syntax break)')
      const node = {
        type: 'ReturnStatement',
        argument: { type: 'ObjectExpression', start: 7, end: 9 },
        start: 0, end: 9
      }
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('Object.freeze(')
    })

    it('return → void replaces return keyword', () => {
      const m = find('return → void')
      const node = {
        type: 'ReturnStatement',
        argument: { type: 'Identifier', start: 7, end: 8 },
        start: 0, end: 8
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'return x')
      expect(patch.replacement).toBe('void')
    })
  })

  describe('default parameter removal', () => {
    it('param = value → param removes default value', () => {
      const m = find('param = value → param (remove default)')
      const node = {
        type: 'AssignmentPattern',
        left: { type: 'Identifier', name: 'x', start: 13, end: 14 },
        right: { type: 'NumericLiteral', value: 42, start: 17, end: 19 },
        start: 13, end: 19
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 14, end: 19, replacement: '' })
    })

    it('matches destructured defaults', () => {
      const m = find('param = value → param (remove default)')
      const node = {
        type: 'AssignmentPattern',
        left: { type: 'ObjectPattern', start: 13, end: 20 },
        right: { type: 'ObjectExpression', start: 23, end: 25 },
        start: 13, end: 25
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 20, end: 25, replacement: '' })
    })
  })

  describe('new keyword removal', () => {
    it('new X() → X() matches NewExpression', () => {
      const m = find('new X() → X()')
      const node = {
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Foo', start: 4, end: 7 },
        arguments: [],
        start: 0, end: 9
      }
      expect(m.test(node)).toBe(true)
    })

    it('new X() → X() removes new keyword prefix', () => {
      const m = find('new X() → X()')
      const node = {
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Foo', start: 4, end: 7 },
        arguments: [],
        start: 0, end: 9
      }
      const patch = m.mutate(node, 'new Foo()')
      expect(patch).toEqual({ start: 0, end: 4, replacement: '' })
    })

    it('new X() → X() works with member expression callee', () => {
      const m = find('new X() → X()')
      const node = {
        type: 'NewExpression',
        callee: { type: 'MemberExpression', start: 4, end: 11 },
        arguments: [{ start: 12, end: 14 }],
        start: 0, end: 15
      }
      const patch = m.mutate(node, 'new Foo.Bar(42)')
      expect(patch).toEqual({ start: 0, end: 4, replacement: '' })
    })
  })

  describe('break removal', () => {
    it('break → (removed) removes break statement', () => {
      const m = find('break → (removed)')
      const node = { type: 'BreakStatement', start: 4, end: 10 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '    break;')
      expect(patch).toEqual({ start: 4, end: 10, replacement: '' })
    })
  })

  describe('continue removal', () => {
    it('continue → (removed) removes continue statement', () => {
      const m = find('continue → (removed)')
      const node = { type: 'ContinueStatement', start: 4, end: 13 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '    continue;')
      expect(patch).toEqual({ start: 4, end: 13, replacement: '' })
    })
  })

  describe('catch block emptying', () => {
    it('catch body → {} empties catch block', () => {
      const m = find('catch body → {} (empty)')
      const node = {
        type: 'CatchClause',
        body: {
          type: 'BlockStatement',
          body: [{ type: 'ExpressionStatement' }],
          start: 14, end: 30
        },
        start: 2, end: 30
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 14, end: 30, replacement: '{}' })
    })

    it('skips already-empty catch blocks', () => {
      const m = find('catch body → {} (empty)')
      const node = {
        type: 'CatchClause',
        body: { type: 'BlockStatement', body: [], start: 14, end: 16 },
        start: 2, end: 16
      }
      expect(m.test(node)).toBe(false)
    })
  })

  describe('finally removal', () => {
    it('finally → (removed) removes finally block when catch exists', () => {
      const m = find('finally → (removed)')
      const source = 'try {} catch(e) {} finally { x() }'
      const node = {
        type: 'TryStatement',
        block: { start: 4, end: 6 },
        handler: { start: 7, end: 18 },
        finalizer: { start: 27, end: 34 },
        start: 0, end: 34
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, source)
      expect(patch.replacement).toBe('')
      expect(source.slice(patch.start, patch.start + 7)).toBe('finally')
      expect(patch.end).toBe(34)
    })

    it('skips when there is no catch handler', () => {
      const m = find('finally → (removed)')
      const node = {
        type: 'TryStatement',
        block: { start: 4, end: 20 },
        handler: null,
        finalizer: { start: 29, end: 42 },
        start: 0, end: 42
      }
      expect(m.test(node)).toBe(false)
    })

    it('returns null when finally keyword not found in source', () => {
      const m = find('finally → (removed)')
      const node = {
        type: 'TryStatement',
        block: { start: 0, end: 5 },
        handler: { start: 5, end: 10 },
        finalizer: { start: 15, end: 20 },
        start: 0, end: 20
      }
      expect(m.mutate(node, 'try {} catch {}  {}')).toBeNull()
    })
  })

  describe('empty return removal', () => {
    it('return; → (removed) removes bare return', () => {
      const m = find('return; → (removed)')
      const node = {
        type: 'ReturnStatement',
        argument: null,
        start: 2, end: 9
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '  return;')
      expect(patch).toEqual({ start: 2, end: 9, replacement: '' })
    })

    it('skips return with argument', () => {
      const m = find('return; → (removed)')
      const node = {
        type: 'ReturnStatement',
        argument: { type: 'Identifier', start: 7, end: 12 },
        start: 0, end: 12
      }
      expect(m.test(node)).toBe(false)
    })
  })

  describe('for...in / for...of swap', () => {
    it('for...in → for...of swaps keyword', () => {
      const m = find('for...in → for...of')
      const node = {
        type: 'ForInStatement',
        left: { start: 5, end: 12 },
        right: { start: 16, end: 19 },
        start: 0, end: 25
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'for (const x in obj) {}')
      expect(patch.replacement).toBe('of')
    })

    it('for...of → for...in swaps keyword', () => {
      const m = find('for...of → for...in')
      const node = {
        type: 'ForOfStatement',
        left: { start: 5, end: 12 },
        right: { start: 16, end: 19 },
        start: 0, end: 25
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'for (const x of arr) {}')
      expect(patch.replacement).toBe('in')
    })

    it('for...of returns null when keyword not found', () => {
      const m = find('for...of → for...in')
      const node = {
        type: 'ForOfStatement',
        left: { start: 5, end: 12 },
        right: { start: 13, end: 16 },
        start: 0, end: 20
      }
      expect(m.mutate(node, 'for (const x arr) {}')).toBeNull()
    })

    it('for...in returns null when keyword not found', () => {
      const m = find('for...in → for...of')
      const node = {
        type: 'ForInStatement',
        left: { start: 5, end: 12 },
        right: { start: 13, end: 16 },
        start: 0, end: 20
      }
      expect(m.mutate(node, 'for (const x obj) {}')).toBeNull()
    })
  })

  describe('yield removal', () => {
    it('yield → (removed) removes yield keyword', () => {
      const m = find('yield → (removed)')
      const node = {
        type: 'YieldExpression',
        argument: { start: 6, end: 11 },
        delegate: false,
        start: 0, end: 11
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'yield value')
      expect(patch).toEqual({ start: 0, end: 6, replacement: '' })
    })

    it('yield → (removed) handles yield* delegation', () => {
      const m = find('yield → (removed)')
      const node = {
        type: 'YieldExpression',
        argument: { start: 7, end: 15 },
        delegate: true,
        start: 0, end: 15
      }
      const patch = m.mutate(node, 'yield* iterable')
      expect(patch).toEqual({ start: 0, end: 7, replacement: '' })
    })

    it('skips yield without argument', () => {
      const m = find('yield → (removed)')
      const node = {
        type: 'YieldExpression',
        argument: null,
        delegate: false,
        start: 0, end: 5
      }
      expect(m.test(node)).toBe(false)
    })
  })

  describe('if-block emptying', () => {
    it('if body → {} empties the consequent block', () => {
      const m = find('if body → {} (empty)')
      const node = {
        type: 'IfStatement',
        test: { start: 4, end: 8 },
        consequent: {
          type: 'BlockStatement',
          body: [{ type: 'ExpressionStatement' }],
          start: 10, end: 24
        },
        start: 0, end: 24
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'if (cond) { doStuff() }')
      expect(patch).toEqual({ start: 10, end: 24, replacement: '{}' })
    })

    it('skips already-empty if blocks', () => {
      const m = find('if body → {} (empty)')
      const node = {
        type: 'IfStatement',
        test: { start: 4, end: 8 },
        consequent: { type: 'BlockStatement', body: [], start: 10, end: 12 },
        start: 0, end: 12
      }
      expect(m.test(node)).toBe(false)
    })

    it('skips non-block consequents (single statement)', () => {
      const m = find('if body → {} (empty)')
      const node = {
        type: 'IfStatement',
        test: { start: 4, end: 8 },
        consequent: { type: 'ExpressionStatement', start: 10, end: 20 },
        start: 0, end: 20
      }
      expect(m.test(node)).toBe(false)
    })
  })

  describe('else-block removal', () => {
    it('else → (removed) removes the else block', () => {
      const m = find('else → (removed)')
      const source = 'if (x) { a() } else { b() }'
      const node = {
        type: 'IfStatement',
        test: { start: 4, end: 5 },
        consequent: { type: 'BlockStatement', body: [{}], start: 7, end: 14 },
        alternate: { type: 'BlockStatement', body: [{}], start: 20, end: 28 },
        start: 0, end: 28
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, source)
      expect(patch.replacement).toBe('')
      expect(source.slice(patch.start, patch.start + 4)).toBe('else')
      expect(patch.end).toBe(28)
    })

    it('skips when there is no alternate', () => {
      const m = find('else → (removed)')
      const node = {
        type: 'IfStatement',
        test: { start: 4, end: 5 },
        consequent: { type: 'BlockStatement', body: [{}], start: 7, end: 14 },
        alternate: null,
        start: 0, end: 14
      }
      expect(m.test(node)).toBe(false)
    })

    it('skips else-if chains (alternate is IfStatement)', () => {
      const m = find('else → (removed)')
      const node = {
        type: 'IfStatement',
        test: { start: 4, end: 5 },
        consequent: { type: 'BlockStatement', body: [{}], start: 7, end: 14 },
        alternate: { type: 'IfStatement', start: 20, end: 40 },
        start: 0, end: 40
      }
      expect(m.test(node)).toBe(false)
    })

    it('skips empty else blocks', () => {
      const m = find('else → (removed)')
      const node = {
        type: 'IfStatement',
        test: { start: 4, end: 5 },
        consequent: { type: 'BlockStatement', body: [{}], start: 7, end: 14 },
        alternate: { type: 'BlockStatement', body: [], start: 20, end: 22 },
        start: 0, end: 22
      }
      expect(m.test(node)).toBe(false)
    })

    it('returns null when else keyword not found', () => {
      const m = find('else → (removed)')
      const node = {
        type: 'IfStatement',
        test: { start: 4, end: 5 },
        consequent: { type: 'BlockStatement', body: [{}], start: 7, end: 14 },
        alternate: { type: 'BlockStatement', body: [{}], start: 16, end: 20 },
        start: 0, end: 20
      }
      expect(m.mutate(node, 'if (x) { a() } { b() }')).toBeNull()
    })
  })

  describe('loop body emptying', () => {
    it('for body → {} empties for-loop body', () => {
      const m = find('for body → {} (empty)')
      const node = {
        type: 'ForStatement',
        body: {
          type: 'BlockStatement',
          body: [{ type: 'ExpressionStatement' }],
          start: 21, end: 35
        },
        start: 0, end: 35
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 21, end: 35, replacement: '{}' })
    })

    it('for body skips empty blocks', () => {
      const m = find('for body → {} (empty)')
      const node = {
        type: 'ForStatement',
        body: { type: 'BlockStatement', body: [], start: 21, end: 23 },
        start: 0, end: 23
      }
      expect(m.test(node)).toBe(false)
    })

    it('while body → {} empties while-loop body', () => {
      const m = find('while body → {} (empty)')
      const node = {
        type: 'WhileStatement',
        test: { start: 7, end: 11 },
        body: {
          type: 'BlockStatement',
          body: [{ type: 'ExpressionStatement' }],
          start: 13, end: 25
        },
        start: 0, end: 25
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 13, end: 25, replacement: '{}' })
    })

    it('while body skips empty blocks', () => {
      const m = find('while body → {} (empty)')
      const node = {
        type: 'WhileStatement',
        test: { start: 7, end: 11 },
        body: { type: 'BlockStatement', body: [], start: 13, end: 15 },
        start: 0, end: 15
      }
      expect(m.test(node)).toBe(false)
    })

    it('do...while body → {} empties do-while body', () => {
      const m = find('do...while body → {} (empty)')
      const node = {
        type: 'DoWhileStatement',
        body: {
          type: 'BlockStatement',
          body: [{ type: 'ExpressionStatement' }],
          start: 3, end: 18
        },
        test: { start: 26, end: 30 },
        start: 0, end: 31
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 3, end: 18, replacement: '{}' })
    })

    it('do...while body skips empty blocks', () => {
      const m = find('do...while body → {} (empty)')
      const node = {
        type: 'DoWhileStatement',
        body: { type: 'BlockStatement', body: [], start: 3, end: 5 },
        test: { start: 13, end: 17 },
        start: 0, end: 18
      }
      expect(m.test(node)).toBe(false)
    })
  })

  describe('switch mutations', () => {
    it('switch(expr) → switch(true) replaces discriminant', () => {
      const m = find('switch(expr) → switch(true)')
      const node = {
        type: 'SwitchStatement',
        discriminant: { start: 7, end: 13 },
        cases: [],
        start: 0, end: 30
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'switch(action) { case "a": break; }')
      expect(patch).toEqual({ start: 7, end: 13, replacement: 'true' })
    })

    it('case body → break empties case consequent', () => {
      const m = find('case body → break (empty)')
      const node = {
        type: 'SwitchCase',
        test: { type: 'Literal', value: 1, start: 5, end: 6 },
        consequent: [
          { type: 'ExpressionStatement', start: 8, end: 16 },
          { type: 'BreakStatement', start: 17, end: 23 }
        ],
        start: 0, end: 23
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 8, end: 23, replacement: 'break;' })
    })

    it('case body skips empty cases', () => {
      const m = find('case body → break (empty)')
      const node = {
        type: 'SwitchCase',
        test: { type: 'Literal', value: 1, start: 5, end: 6 },
        consequent: [],
        start: 0, end: 7
      }
      expect(m.test(node)).toBe(false)
    })

    it('case body works with default case', () => {
      const m = find('case body → break (empty)')
      const node = {
        type: 'SwitchCase',
        test: null,
        consequent: [
          { type: 'ExpressionStatement', start: 9, end: 20 }
        ],
        start: 0, end: 20
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 9, end: 20, replacement: 'break;' })
    })
  })

  describe('error type swap', () => {
    it('new Error → new TypeError swaps error constructor', () => {
      const m = find('new Error → new TypeError')
      const node = {
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Error', start: 4, end: 9 },
        start: 0, end: 20
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 4, end: 9, replacement: 'TypeError' })
    })

    it('new TypeError → new Error swaps back', () => {
      const m = find('new TypeError → new Error')
      const node = {
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'TypeError', start: 4, end: 13 },
        start: 0, end: 24
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 4, end: 13, replacement: 'Error' })
    })

    it('does not match non-error constructors', () => {
      const m = find('new Error → new TypeError')
      const node = {
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Map', start: 4, end: 7 },
        start: 0, end: 10
      }
      expect(m.test(node)).toBe(false)
    })
  })
})

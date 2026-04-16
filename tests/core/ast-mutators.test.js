import { describe, it, expect } from 'vitest'
import { javascript } from '../../src/core/ast-mutators.js'

describe('ast-mutators', () => {
  describe('structure', () => {
    it('exports a non-empty array', () => {
      expect(Array.isArray(javascript)).toBe(true)
      expect(javascript.length).toBeGreaterThan(0)
    })

    it('every mutator has required fields with correct types', () => {
      for (const m of javascript) {
        expect(m.name, `missing name`).toBeDefined()
        expect(typeof m.name, `name should be string: ${m.name}`).toBe('string')
        expect(Array.isArray(m.types), `types should be array: ${m.name}`).toBe(true)
        expect(m.types.length, `types should be non-empty: ${m.name}`).toBeGreaterThan(0)
        expect(typeof m.test, `test should be function: ${m.name}`).toBe('function')
        expect(typeof m.mutate, `mutate should be function: ${m.name}`).toBe('function')
      }
    })

    it('mutator names are unique', () => {
      const names = javascript.map(m => m.name)
      const dupes = names.filter((n, i) => names.indexOf(n) !== i)
      expect(dupes, `duplicate names: ${dupes.join(', ')}`).toHaveLength(0)
    })

    it('all node types are valid ESTree/Babel types', () => {
      const valid = new Set([
        'BinaryExpression', 'LogicalExpression', 'UnaryExpression',
        'UpdateExpression', 'AssignmentExpression', 'CallExpression',
        'MemberExpression', 'OptionalMemberExpression',
        'ConditionalExpression', 'ReturnStatement', 'ThrowStatement',
        'AwaitExpression', 'SpreadElement', 'ArrayExpression',
        'Literal', 'BooleanLiteral', 'NumericLiteral', 'StringLiteral',
        'ChainExpression', 'ObjectExpression',
        'IfStatement', 'WhileStatement'
      ])
      for (const m of javascript) {
        for (const t of m.types) {
          expect(valid.has(t), `${m.name}: unknown node type '${t}'`).toBe(true)
        }
      }
    })
  })

  describe('equality operators', () => {
    it('=== → !== matches BinaryExpression with ===', () => {
      const m = find('=== → !==')
      const node = binExpr('===', 4, 5, 10, 11)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'if (a === b) {}')
      expect(patch.replacement).toBe('!==')
    })

    it('=== → !== does not match !==', () => {
      const m = find('=== → !==')
      expect(m.test(binExpr('!==', 4, 5, 10, 11))).toBe(false)
    })

    it('>= → < matches BinaryExpression with >=', () => {
      const m = find('>= → <')
      expect(m.test(binExpr('>=', 4, 5, 9, 10))).toBe(true)
      const patch = m.mutate(binExpr('>=', 4, 5, 9, 10), 'if (a >= b) {}')
      expect(patch.replacement).toBe('<')
    })
  })

  describe('logical operators', () => {
    it('&& → || matches LogicalExpression', () => {
      const m = find('&& → ||')
      const node = logExpr('&&', 4, 5, 10, 11)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'if (a && b) {}')
      expect(patch.replacement).toBe('||')
    })
  })

  describe('arithmetic operators', () => {
    it('+ → - produces correct patch', () => {
      const m = find('+ → -')
      const source = 'const x = a + b'
      const node = binExpr('+', 10, 11, 14, 15)
      const patch = m.mutate(node, source)
      expect(patch.replacement).toBe('-')
      expect(source.slice(0, patch.start) + patch.replacement + source.slice(patch.end))
        .toBe('const x = a - b')
    })

    it('** → * matches exponentiation', () => {
      const m = find('** → *')
      expect(m.test(binExpr('**', 10, 11, 16, 17))).toBe(true)
      expect(m.test(binExpr('*', 10, 11, 14, 15))).toBe(false)
    })
  })

  describe('boolean literals', () => {
    it('true → false matches boolean true', () => {
      const m = find('true → false')
      expect(m.test({ type: 'Literal', value: true, start: 10, end: 14 })).toBe(true)
      expect(m.test({ type: 'BooleanLiteral', value: true, start: 10, end: 14 })).toBe(true)
      expect(m.test({ type: 'Literal', value: false, start: 10, end: 15 })).toBe(false)
    })

    it('true → false produces correct replacement', () => {
      const m = find('true → false')
      const node = { type: 'Literal', value: true, start: 10, end: 14 }
      const patch = m.mutate(node, 'const x = true')
      expect(patch).toEqual({ start: 10, end: 14, replacement: 'false' })
    })
  })

  describe('conditional expression', () => {
    it('ternary → always truthy inserts true || before consequent', () => {
      const m = find('ternary → always truthy')
      const node = {
        type: 'ConditionalExpression',
        consequent: { start: 6, end: 7 },
        start: 0, end: 12
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'cond ? b : c')
      expect(patch).toEqual({ start: 6, end: 6, replacement: 'true || ' })
    })
  })

  describe('method expressions', () => {
    it('toLowerCase → toUpperCase swaps method name', () => {
      const m = find('toLowerCase → toUpperCase')
      const node = callWithMethod('toLowerCase', 2, 13, 0, 15)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 's.toLowerCase()')
      expect(patch.replacement).toBe('toUpperCase')
    })

    it('trim() → (removed) removes .trim()', () => {
      const m = find('trim() → (removed)')
      const node = callWithMethod('trim', 2, 6, 0, 8)
      node.arguments = []
      node.callee.object = { end: 1 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 's.trim()')
      expect(patch).toEqual({ start: 1, end: 8, replacement: '' })
    })
  })

  describe('update operators', () => {
    it('++ → -- for postfix', () => {
      const m = find('++ → --')
      const node = { type: 'UpdateExpression', operator: '++', prefix: false, argument: { start: 0, end: 1 }, start: 0, end: 3 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'i++')
      expect(patch).toEqual({ start: 1, end: 3, replacement: '--' })
    })

    it('++ → -- for prefix', () => {
      const m = find('++ → --')
      const node = { type: 'UpdateExpression', operator: '++', prefix: true, argument: { start: 2, end: 3 }, start: 0, end: 3 }
      const patch = m.mutate(node, '++i')
      expect(patch).toEqual({ start: 0, end: 2, replacement: '--' })
    })
  })

  describe('optional chaining', () => {
    it('?. → . replaces optional chaining', () => {
      const m = find('?. → .')
      const node = {
        type: 'MemberExpression', optional: true,
        object: { end: 3 }, property: { start: 5 },
        start: 0, end: 9
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'obj?.prop')
      expect(patch.replacement).toBe('.')
      expect(patch.end - patch.start).toBe(2)
    })
  })

  describe('negation removal', () => {
    it('!var → var removes negation', () => {
      const m = find('!var → var')
      const node = {
        type: 'UnaryExpression', operator: '!', prefix: true,
        argument: { type: 'Identifier', start: 1, end: 6 },
        start: 0, end: 6
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '!ready')
      expect(patch).toEqual({ start: 0, end: 1, replacement: '' })
    })
  })

  describe('assignment operators', () => {
    it('+= → -= swaps assignment operator', () => {
      const m = find('+= → -=')
      const node = assignExpr('+=', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x += 1')
      expect(patch.replacement).toBe('-=')
    })
  })

  describe('numeric boundary', () => {
    it('0 → 1 matches numeric zero', () => {
      const m = find('0 → 1')
      const node = { type: 'Literal', value: 0, start: 10, end: 11 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = 0')
      expect(patch).toEqual({ start: 10, end: 11, replacement: '1' })
    })

    it('0 → 1 skips hex literals', () => {
      const m = find('0 → 1')
      const node = { type: 'Literal', value: 0, start: 10, end: 14 }
      const patch = m.mutate(node, 'const x = 0xFF')
      expect(patch).toBeNull()
    })

    it('-1 → 0 matches UnaryExpression -1', () => {
      const m = find('-1 → 0')
      const node = {
        type: 'UnaryExpression', operator: '-', prefix: true,
        argument: { type: 'NumericLiteral', value: 1, start: 11, end: 12 },
        start: 10, end: 12
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = -1')
      expect(patch).toEqual({ start: 10, end: 12, replacement: '0' })
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

  describe('math method swaps', () => {
    it('Math.floor → Math.ceil swaps method', () => {
      const m = find('Math.floor → Math.ceil')
      const node = staticCall('Math', 'floor', 0, 10, 5, 10)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch.replacement).toBe('ceil')
    })

    it('Math.abs → (removed) removes Math.abs callee', () => {
      const m = find('Math.abs → (removed)')
      const node = staticCall('Math', 'abs', 0, 12, 5, 8)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 0, end: 8, replacement: '' })
    })
  })

  describe('array method swaps', () => {
    it('Array.isArray → !Array.isArray inserts negation', () => {
      const m = find('Array.isArray → !Array.isArray')
      const node = staticCall('Array', 'isArray', 0, 16, 6, 13)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 0, end: 0, replacement: '!' })
    })

    it('reverse() → (removed) removes .reverse()', () => {
      const m = find('reverse() → (removed)')
      const node = callWithMethod('reverse', 4, 11, 0, 13)
      node.arguments = []
      node.callee.object = { end: 3 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'arr.reverse()')
      expect(patch).toEqual({ start: 3, end: 13, replacement: '' })
    })
  })

  describe('object method swaps', () => {
    it('Object.keys → Object.values does not mutate when parent is .length', () => {
      const m = find('Object.keys → Object.values')
      const node = staticCall('Object', 'keys', 0, 16, 7, 11)
      const parent = { type: 'MemberExpression', property: { name: 'length' } }
      expect(m.test(node, '', parent)).toBe(false)
    })

    it('Object.keys → Object.values mutates when no .length parent', () => {
      const m = find('Object.keys → Object.values')
      const node = staticCall('Object', 'keys', 0, 16, 7, 11)
      expect(m.test(node, '')).toBe(true)
      expect(m.mutate(node).replacement).toBe('values')
    })
  })

  describe('spread removal', () => {
    it('[...x] → x removes array copy', () => {
      const m = find('[...x] → x (remove copy)')
      const node = {
        type: 'ArrayExpression',
        elements: [{
          type: 'SpreadElement',
          argument: { type: 'Identifier', name: 'arr', start: 4, end: 7 },
          start: 1, end: 7
        }],
        start: 0, end: 8
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '[...arr]')
      expect(patch).toEqual({ start: 0, end: 8, replacement: 'arr' })
    })
  })

  describe('void removal', () => {
    it('void expr → expr removes void operator', () => {
      const m = find('void expr → expr')
      const node = {
        type: 'UnaryExpression', operator: 'void', prefix: true,
        argument: { start: 5, end: 15 },
        start: 0, end: 15
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'void callback()')
      expect(patch).toEqual({ start: 0, end: 5, replacement: '' })
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

  describe('await removal', () => {
    it('await → (removed) removes await keyword', () => {
      const m = find('await → (removed)')
      const node = {
        type: 'AwaitExpression',
        argument: { start: 6, end: 16 },
        start: 0, end: 16
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'await fetch(url)')
      expect(patch).toEqual({ start: 0, end: 6, replacement: '' })
    })
  })

  describe('fallback removal', () => {
    it('|| [] → (removed) removes empty array fallback', () => {
      const m = find('|| [] → (removed)')
      const node = {
        type: 'LogicalExpression', operator: '||',
        left: { end: 3 },
        right: { type: 'ArrayExpression', elements: [] },
        start: 0, end: 10
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 3, end: 10, replacement: '' })
    })
  })

  describe('bitwise operators', () => {
    it('& → | swaps bitwise AND to OR', () => {
      const m = find('& → |')
      const source = 'const x = a & b'
      const node = binExpr('&', 10, 11, 14, 15)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, source)
      expect(patch.replacement).toBe('|')
    })
  })

  describe('type conversions', () => {
    it('parseInt → parseFloat swaps global function', () => {
      const m = find('parseInt → parseFloat')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'parseInt', start: 0, end: 8 },
        start: 0, end: 13
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 0, end: 8, replacement: 'parseFloat' })
    })
  })

  describe('string method mutations', () => {
    it('replace → toString swaps method name', () => {
      const m = find('replace → toString (removed)')
      const node = callWithMethod('replace', 2, 9, 0, 20)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch.replacement).toBe('toString')
    })
  })

  describe('unary minus removal', () => {
    it('unary -x → x removes negation on identifiers', () => {
      const m = find('unary -x → x')
      const node = {
        type: 'UnaryExpression', operator: '-', prefix: true,
        argument: { type: 'Identifier', name: 'x', start: 1, end: 2 },
        start: 0, end: 2
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '-x')
      expect(patch).toEqual({ start: 0, end: 1, replacement: '' })
    })
  })

  // ── Defensive findBetween branches ──

  describe('defensive null returns', () => {
    it('assignmentOpSwap returns null when operator not found between nodes', () => {
      const m = find('+= → -=')
      // Source doesn't contain += between left.end and right.start
      const node = assignExpr('+=', 0, 1, 2, 3)
      expect(m.mutate(node, 'x 1')).toBeNull()
    })

    it('optional chaining returns null when ?. not found in source', () => {
      const m = find('?. → .')
      const node = {
        type: 'MemberExpression', optional: true,
        object: { end: 3 }, property: { start: 5 },
        start: 0, end: 9
      }
      expect(m.mutate(node, 'obj.prop!')).toBeNull()
    })

    it('optional chaining uses callee.end when object is missing', () => {
      const m = find('?. → .')
      const node = {
        type: 'CallExpression', optional: true,
        callee: { end: 4 },
        start: 0, end: 9
      }
      const patch = m.mutate(node, 'fn()?.val')
      expect(patch.replacement).toBe('.')
    })

    it('optional chaining falls back to node.start when both object and callee are missing', () => {
      const m = find('?. → .')
      const node = {
        type: 'MemberExpression', optional: true,
        start: 0, end: 6
      }
      const patch = m.mutate(node, '?.prop')
      expect(patch.replacement).toBe('.')
    })

    it('throw → return returns null when throw not found', () => {
      const m = find('throw → return')
      const node = { type: 'ThrowStatement', start: 0, end: 10 }
      expect(m.mutate(node, 'return err')).toBeNull()
    })

    it('binaryOpSwap returns null when operator not found', () => {
      const m = find('=== → !==')
      const node = binExpr('===', 0, 1, 4, 5)
      expect(m.mutate(node, 'a != b')).toBeNull()
    })

    it('logicalOpSwap returns null when operator not found', () => {
      const m = find('&& → ||')
      const node = logExpr('&&', 0, 1, 4, 5)
      expect(m.mutate(node, 'a || b')).toBeNull()
    })

    it('return → void returns null when return not found', () => {
      const m = find('return → void')
      const node = {
        type: 'ReturnStatement',
        argument: { type: 'Identifier', start: 5, end: 6 },
        start: 0, end: 6
      }
      expect(m.mutate(node, 'void x')).toBeNull()
    })

    it('slice mutator returns null when open paren not found', () => {
      const m = find('slice() → slice(1,')
      const node = callWithMethod('slice', 4, 9, 0, 11)
      node.callee.end = 9
      expect(m.mutate(node, 'arr.slice  ')).toBeNull()
    })
  })

  // ── Off-by-one boundary comparison mutators ──

  describe('off-by-one boundary comparisons', () => {
    it('> → >= shifts boundary to include', () => {
      const m = find('> → >=')
      expect(m.test(binExpr('>', 4, 5, 8, 9))).toBe(true)
      const patch = m.mutate(binExpr('>', 4, 5, 8, 9), 'if (a > b) {}')
      expect(patch.replacement).toBe('>=')
    })

    it('> → >= does not match <', () => {
      const m = find('> → >=')
      expect(m.test(binExpr('<', 4, 5, 8, 9))).toBe(false)
    })

    it('< → <= shifts boundary to include', () => {
      const m = find('< → <=')
      expect(m.test(binExpr('<', 4, 5, 8, 9))).toBe(true)
      const patch = m.mutate(binExpr('<', 4, 5, 8, 9), 'if (a < b) {}')
      expect(patch.replacement).toBe('<=')
    })

    it('< → <= does not match >', () => {
      const m = find('< → <=')
      expect(m.test(binExpr('>', 4, 5, 8, 9))).toBe(false)
    })

    it('>= → > shifts boundary to exclude', () => {
      const m = find('>= → >')
      expect(m.test(binExpr('>=', 4, 5, 9, 10))).toBe(true)
      const patch = m.mutate(binExpr('>=', 4, 5, 9, 10), 'if (a >= b) {}')
      expect(patch.replacement).toBe('>')
    })

    it('>= → > does not match <=', () => {
      const m = find('>= → >')
      expect(m.test(binExpr('<=', 4, 5, 9, 10))).toBe(false)
    })

    it('<= → < shifts boundary to exclude', () => {
      const m = find('<= → <')
      expect(m.test(binExpr('<=', 4, 5, 9, 10))).toBe(true)
      const patch = m.mutate(binExpr('<=', 4, 5, 9, 10), 'if (a <= b) {}')
      expect(patch.replacement).toBe('<')
    })

    it('<= → < does not match >=', () => {
      const m = find('<= → <')
      expect(m.test(binExpr('>=', 4, 5, 9, 10))).toBe(false)
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

  // ── Remaining equality operators ──

  describe('remaining equality operators', () => {
    it('!== → === swaps operator', () => {
      const m = find('!== → ===')
      expect(m.test(binExpr('!==', 4, 5, 10, 11))).toBe(true)
      expect(m.mutate(binExpr('!==', 4, 5, 10, 11), 'if (a !== b) {}').replacement).toBe('===')
    })

    it('<= → > swaps operator', () => {
      const m = find('<= → >')
      expect(m.test(binExpr('<=', 4, 5, 9, 10))).toBe(true)
      expect(m.mutate(binExpr('<=', 4, 5, 9, 10), 'if (a <= b) {}').replacement).toBe('>')
    })

    it('> → < swaps operator', () => {
      const m = find('> → <')
      expect(m.test(binExpr('>', 4, 5, 8, 9))).toBe(true)
      expect(m.mutate(binExpr('>', 4, 5, 8, 9), 'if (a > b) {}').replacement).toBe('<')
    })

    it('< → > swaps operator', () => {
      const m = find('< → >')
      expect(m.test(binExpr('<', 4, 5, 8, 9))).toBe(true)
      expect(m.mutate(binExpr('<', 4, 5, 8, 9), 'if (a < b) {}').replacement).toBe('>')
    })
  })

  // ── Remaining logical/nullish ──

  describe('remaining logical operators', () => {
    it('|| → && swaps operator', () => {
      const m = find('|| → &&')
      expect(m.test(logExpr('||', 4, 5, 10, 11))).toBe(true)
      expect(m.mutate(logExpr('||', 4, 5, 10, 11), 'if (a || b) {}').replacement).toBe('&&')
    })

    it('?? → || swaps nullish coalescing', () => {
      const m = find('?? → ||')
      expect(m.test(logExpr('??', 0, 1, 5, 6))).toBe(true)
      expect(m.mutate(logExpr('??', 0, 1, 5, 6), 'a ?? b').replacement).toBe('||')
    })
  })

  // ── Remaining arithmetic ──

  describe('remaining arithmetic operators', () => {
    it('- → + swaps', () => {
      const m = find('- → +')
      expect(m.mutate(binExpr('-', 10, 11, 14, 15), 'const x = a - b').replacement).toBe('+')
    })

    it('* → / swaps', () => {
      const m = find('* → /')
      expect(m.mutate(binExpr('*', 10, 11, 14, 15), 'const x = a * b').replacement).toBe('/')
    })

    it('/ → * swaps', () => {
      const m = find('/ → *')
      expect(m.mutate(binExpr('/', 10, 11, 14, 15), 'const x = a / b').replacement).toBe('*')
    })

    it('% → + swaps', () => {
      const m = find('% → +')
      expect(m.mutate(binExpr('%', 10, 11, 14, 15), 'const x = a % b').replacement).toBe('+')
    })
  })

  // ── Remaining boolean ──

  describe('remaining boolean literals', () => {
    it('false → true matches boolean false', () => {
      const m = find('false → true')
      expect(m.test({ type: 'Literal', value: false })).toBe(true)
      expect(m.test({ type: 'BooleanLiteral', value: false })).toBe(true)
      const patch = m.mutate({ type: 'Literal', value: false, start: 10, end: 15 })
      expect(patch).toEqual({ start: 10, end: 15, replacement: 'true' })
    })
  })

  // ── Remaining conditional ──

  describe('remaining conditional', () => {
    it('ternary → always falsy inserts false && before consequent', () => {
      const m = find('ternary → always falsy')
      const node = {
        type: 'ConditionalExpression',
        consequent: { start: 6, end: 7 },
        start: 0, end: 12
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'cond ? b : c')
      expect(patch).toEqual({ start: 6, end: 6, replacement: 'false && ' })
    })
  })

  // ── Remaining method expressions ──

  describe('remaining method expressions', () => {
    it('toUpperCase → toLowerCase swaps', () => {
      const m = find('toUpperCase → toLowerCase')
      const node = callWithMethod('toUpperCase', 2, 13, 0, 15)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('toLowerCase')
    })

    it('filter(predicate) → filter(true) prepends true predicate', () => {
      const m = find('filter(predicate) → filter(true) (ignore predicate)')
      const node = callWithMethod('filter', 4, 10, 0, 20)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch.replacement).toBe('x => true, ')
    })

    it('slice() → slice(1, prepends 1', () => {
      const m = find('slice() → slice(1,')
      const node = callWithMethod('slice', 4, 9, 0, 11)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'arr.slice()')
      expect(patch.replacement).toBe('1,')
    })
  })

  // ── String literals ──

  describe('string literals', () => {
    it("return '' → return 'mutant' matches single-quoted empty string", () => {
      const m = find("return '' → return 'mutant'")
      const node = {
        type: 'ReturnStatement',
        argument: { type: 'StringLiteral', value: '', start: 7, end: 9 },
        start: 0, end: 9
      }
      expect(m.test(node, "return ''")).toBe(true)
      expect(m.mutate(node).replacement).toBe("'mutant'")
    })

    it('return "" → return "mutant" matches double-quoted empty string', () => {
      const m = find('return "" → return "mutant"')
      const node = {
        type: 'ReturnStatement',
        argument: { type: 'StringLiteral', value: '', start: 7, end: 9 },
        start: 0, end: 9
      }
      expect(m.test(node, 'return ""')).toBe(true)
      expect(m.mutate(node).replacement).toBe('"mutant"')
    })

    it("return '' matches ESTree Literal with string value", () => {
      const m = find("return '' → return 'mutant'")
      const node = {
        type: 'ReturnStatement',
        argument: { type: 'Literal', value: '', start: 7, end: 9 },
        start: 0, end: 9
      }
      expect(m.test(node, "return ''")).toBe(true)
    })
  })

  // ── Block statements ──

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

  // ── Remaining fallback removals ──

  describe('remaining fallback removals', () => {
    it("|| '' → (removed) removes empty string fallback", () => {
      const m = find("|| '' → (removed)")
      const node = logExpr('||', 0, 1, 5, 7)
      node.right = { type: 'StringLiteral', value: '' }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 1, end: 7, replacement: '' })
    })

    it("|| '' → (removed) matches ESTree Literal with string value", () => {
      const m = find("|| '' → (removed)")
      const node = logExpr('||', 0, 1, 5, 7)
      node.right = { type: 'Literal', value: '' }
      expect(m.test(node)).toBe(true)
    })

    it('|| 0 → (removed) removes zero fallback', () => {
      const m = find('|| 0 → (removed)')
      const node = logExpr('||', 0, 1, 5, 6)
      node.right = { type: 'NumericLiteral', value: 0 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 1, end: 6, replacement: '' })
    })

    it('|| 0 → (removed) matches ESTree Literal with number value', () => {
      const m = find('|| 0 → (removed)')
      const node = logExpr('||', 0, 1, 5, 6)
      node.right = { type: 'Literal', value: 0 }
      expect(m.test(node)).toBe(true)
    })
  })

  // ── Remaining update operators ──

  describe('remaining update operators', () => {
    it('-- → ++ swaps postfix decrement', () => {
      const m = find('-- → ++')
      const node = { type: 'UpdateExpression', operator: '--', prefix: false, argument: { start: 0, end: 1 }, start: 0, end: 3 }
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node, 'i--')).toEqual({ start: 1, end: 3, replacement: '++' })
    })

    it('-- → ++ swaps prefix decrement', () => {
      const m = find('-- → ++')
      const node = { type: 'UpdateExpression', operator: '--', prefix: true, argument: { start: 2, end: 3 }, start: 0, end: 3 }
      expect(m.mutate(node, '--i')).toEqual({ start: 0, end: 2, replacement: '++' })
    })
  })

  // ── Remaining assignment ──

  describe('remaining assignment operators', () => {
    it('-= → += swaps operator', () => {
      const m = find('-= → +=')
      const node = assignExpr('-=', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node, 'x -= 1').replacement).toBe('+=')
    })

    it('*= → /= swaps operator', () => {
      const m = find('*= → /=')
      const node = assignExpr('*=', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node, 'x *= 1').replacement).toBe('/=')
    })

    it('/= → *= swaps operator', () => {
      const m = find('/= → *=')
      const node = assignExpr('/=', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node, 'x /= 1').replacement).toBe('*=')
    })

    it('%= → += swaps operator', () => {
      const m = find('%= → +=')
      const node = assignExpr('%=', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node, 'x %= 1').replacement).toBe('+=')
    })

    it('**= → *= swaps operator', () => {
      const m = find('**= → *=')
      const node = assignExpr('**=', 0, 1, 6, 7)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node, 'x **= 1').replacement).toBe('*=')
    })
  })

  // ── Remaining numeric boundary ──

  describe('remaining numeric boundary', () => {
    it('1 → 0 matches numeric one', () => {
      const m = find('1 → 0')
      const node = { type: 'Literal', value: 1, start: 10, end: 11 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = 1')
      expect(patch).toEqual({ start: 10, end: 11, replacement: '0' })
    })

    it('1 → 0 skips hex literals', () => {
      const m = find('1 → 0')
      const node = { type: 'Literal', value: 1, start: 10, end: 14 }
      expect(m.mutate(node, 'const x = 0x01')).toBeNull()
    })

    it('1 → 0 skips when preceded by digit or dot', () => {
      const m = find('1 → 0')
      const node = { type: 'Literal', value: 1, start: 1, end: 2 }
      expect(m.mutate(node, '.1')).toBeNull()
    })

    it('0 → 1 skips floats', () => {
      const m = find('0 → 1')
      const node = { type: 'Literal', value: 0, start: 10, end: 13 }
      expect(m.mutate(node, 'const x = 0.0')).toBeNull()
    })
  })

  // ── Remaining string method swaps ──

  describe('remaining string method swaps', () => {
    it('includes → indexOf swaps', () => {
      const m = find('includes → indexOf')
      const node = callWithMethod('includes', 2, 10, 0, 14)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('indexOf')
    })

    it('startsWith → endsWith swaps', () => {
      const m = find('startsWith → endsWith')
      const node = callWithMethod('startsWith', 2, 12, 0, 16)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('endsWith')
    })

    it('endsWith → startsWith swaps', () => {
      const m = find('endsWith → startsWith')
      const node = callWithMethod('endsWith', 2, 10, 0, 14)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('startsWith')
    })
  })

  // ── Remaining math method swaps ──

  describe('remaining math method swaps', () => {
    it('Math.ceil → Math.floor swaps', () => {
      const m = find('Math.ceil → Math.floor')
      expect(m.test(staticCall('Math', 'ceil', 0, 12, 5, 9))).toBe(true)
      expect(m.mutate(staticCall('Math', 'ceil', 0, 12, 5, 9)).replacement).toBe('floor')
    })

    it('Math.min → Math.max swaps', () => {
      const m = find('Math.min → Math.max')
      expect(m.test(staticCall('Math', 'min', 0, 12, 5, 8))).toBe(true)
      expect(m.mutate(staticCall('Math', 'min', 0, 12, 5, 8)).replacement).toBe('max')
    })

    it('Math.max → Math.min swaps', () => {
      const m = find('Math.max → Math.min')
      expect(m.test(staticCall('Math', 'max', 0, 12, 5, 8))).toBe(true)
      expect(m.mutate(staticCall('Math', 'max', 0, 12, 5, 8)).replacement).toBe('min')
    })

    it('Math.round → Math.floor swaps', () => {
      const m = find('Math.round → Math.floor')
      expect(m.test(staticCall('Math', 'round', 0, 14, 5, 10))).toBe(true)
      expect(m.mutate(staticCall('Math', 'round', 0, 14, 5, 10)).replacement).toBe('floor')
    })

    it('Math.sqrt → Math.cbrt swaps', () => {
      const m = find('Math.sqrt → Math.cbrt')
      expect(m.test(staticCall('Math', 'sqrt', 0, 13, 5, 9))).toBe(true)
      expect(m.mutate(staticCall('Math', 'sqrt', 0, 13, 5, 9)).replacement).toBe('cbrt')
    })
  })

  // ── Remaining array method swaps ──

  describe('remaining array method swaps', () => {
    it('some → every swaps', () => {
      const m = find('some → every')
      expect(m.test(callWithMethod('some', 4, 8, 0, 12))).toBe(true)
      expect(m.mutate(callWithMethod('some', 4, 8, 0, 12)).replacement).toBe('every')
    })

    it('every → some swaps', () => {
      const m = find('every → some')
      expect(m.test(callWithMethod('every', 4, 9, 0, 13))).toBe(true)
      expect(m.mutate(callWithMethod('every', 4, 9, 0, 13)).replacement).toBe('some')
    })

    it('map → filter swaps', () => {
      const m = find('map → filter')
      expect(m.test(callWithMethod('map', 4, 7, 0, 11))).toBe(true)
      expect(m.mutate(callWithMethod('map', 4, 7, 0, 11)).replacement).toBe('filter')
    })

    it('push → pop swaps', () => {
      const m = find('push → pop')
      expect(m.test(callWithMethod('push', 4, 8, 0, 12))).toBe(true)
      expect(m.mutate(callWithMethod('push', 4, 8, 0, 12)).replacement).toBe('pop')
    })

    it('shift → pop swaps (0 args)', () => {
      const m = find('shift → pop')
      const node = callWithMethod('shift', 4, 9, 0, 11)
      node.arguments = []
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('pop')
    })

    it('unshift → push swaps', () => {
      const m = find('unshift → push')
      expect(m.test(callWithMethod('unshift', 4, 11, 0, 15))).toBe(true)
      expect(m.mutate(callWithMethod('unshift', 4, 11, 0, 15)).replacement).toBe('push')
    })

    it('find → findIndex swaps', () => {
      const m = find('find → findIndex')
      expect(m.test(callWithMethod('find', 4, 8, 0, 12))).toBe(true)
      expect(m.mutate(callWithMethod('find', 4, 8, 0, 12)).replacement).toBe('findIndex')
    })

    it('findIndex → find swaps', () => {
      const m = find('findIndex → find')
      expect(m.test(callWithMethod('findIndex', 4, 13, 0, 17))).toBe(true)
      expect(m.mutate(callWithMethod('findIndex', 4, 13, 0, 17)).replacement).toBe('find')
    })

    it('splice → slice swaps', () => {
      const m = find('splice → slice')
      expect(m.test(callWithMethod('splice', 4, 10, 0, 14))).toBe(true)
      expect(m.mutate(callWithMethod('splice', 4, 10, 0, 14)).replacement).toBe('slice')
    })
  })

  // ── Remaining object method swaps ──

  describe('remaining object method swaps', () => {
    it('Object.values → Object.keys swaps', () => {
      const m = find('Object.values → Object.keys')
      const node = staticCall('Object', 'values', 0, 18, 7, 13)
      expect(m.test(node, '')).toBe(true)
      expect(m.mutate(node).replacement).toBe('keys')
    })

    it('Object.values → Object.keys skips .length parent', () => {
      const m = find('Object.values → Object.keys')
      const node = staticCall('Object', 'values', 0, 18, 7, 13)
      const parent = { type: 'MemberExpression', property: { name: 'length' } }
      expect(m.test(node, '', parent)).toBe(false)
    })

    it('Object.entries → Object.keys swaps', () => {
      const m = find('Object.entries → Object.keys')
      const node = staticCall('Object', 'entries', 0, 20, 7, 14)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('keys')
    })
  })

  // ── Remaining bitwise operators ──

  describe('remaining bitwise operators', () => {
    it('| → & swaps', () => {
      const m = find('| → &')
      expect(m.test(binExpr('|', 0, 1, 4, 5))).toBe(true)
      expect(m.mutate(binExpr('|', 0, 1, 4, 5), 'a | b').replacement).toBe('&')
    })

    it('^ → & swaps', () => {
      const m = find('^ → &')
      expect(m.test(binExpr('^', 0, 1, 4, 5))).toBe(true)
      expect(m.mutate(binExpr('^', 0, 1, 4, 5), 'a ^ b').replacement).toBe('&')
    })

    it('<< → >> swaps', () => {
      const m = find('<< → >>')
      expect(m.test(binExpr('<<', 0, 1, 5, 6))).toBe(true)
      expect(m.mutate(binExpr('<<', 0, 1, 5, 6), 'a << b').replacement).toBe('>>')
    })

    it('>> → << swaps', () => {
      const m = find('>> → <<')
      expect(m.test(binExpr('>>', 0, 1, 5, 6))).toBe(true)
      expect(m.mutate(binExpr('>>', 0, 1, 5, 6), 'a >> b').replacement).toBe('<<')
    })
  })

  // ── Remaining type conversions ──

  describe('remaining type conversions', () => {
    it('parseFloat → parseInt swaps', () => {
      const m = find('parseFloat → parseInt')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'parseFloat', start: 0, end: 10 },
        start: 0, end: 15
      }
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node)).toEqual({ start: 0, end: 10, replacement: 'parseInt' })
    })
  })

  // ── Remaining spread removal ──

  describe('remaining spread removal', () => {
    it('[...x, y] → [y] removes leading spread', () => {
      const m = find('[...x, y] → [y] (remove spread)')
      const node = {
        type: 'ArrayExpression',
        elements: [
          { type: 'SpreadElement', argument: { start: 4, end: 7 }, start: 1, end: 7 },
          { type: 'Identifier', name: 'y', start: 9, end: 10 }
        ],
        start: 0, end: 11
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '[...arr, y]')
      expect(patch).toEqual({ start: 1, end: 9, replacement: '' })
    })
  })

  describe('object spread removal', () => {
    it('{...obj} → obj removes object copy', () => {
      const m = find('{...obj} → obj (remove copy)')
      const node = {
        type: 'ObjectExpression',
        properties: [{
          type: 'SpreadElement',
          argument: { type: 'Identifier', name: 'obj', start: 4, end: 7 },
          start: 1, end: 7
        }],
        start: 0, end: 8
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '{...obj}')
      expect(patch).toEqual({ start: 0, end: 8, replacement: 'obj' })
    })

    it('{...obj} → obj does not match with non-spread properties', () => {
      const m = find('{...obj} → obj (remove copy)')
      const node = {
        type: 'ObjectExpression',
        properties: [
          { type: 'SpreadElement', argument: { start: 4, end: 7 }, start: 1, end: 7 },
          { type: 'Property', start: 9, end: 15 }
        ],
        start: 0, end: 16
      }
      expect(m.test(node)).toBe(false)
    })

    it('{...obj, key: val} → {key: val} removes leading spread', () => {
      const m = find('{...obj, key: val} → {key: val} (remove spread)')
      const node = {
        type: 'ObjectExpression',
        properties: [
          { type: 'SpreadElement', argument: { start: 4, end: 7 }, start: 1, end: 7 },
          { type: 'Property', start: 9, end: 17 }
        ],
        start: 0, end: 18
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '{...obj, key: val}')
      expect(patch).toEqual({ start: 1, end: 9, replacement: '' })
    })

    it('{...obj, key: val} → {key: val} does not match without spread', () => {
      const m = find('{...obj, key: val} → {key: val} (remove spread)')
      const node = {
        type: 'ObjectExpression',
        properties: [
          { type: 'Property', start: 1, end: 9 }
        ],
        start: 0, end: 10
      }
      expect(m.test(node)).toBe(false)
    })
  })
})

// ── Test helpers ──

function find(name) {
  const m = javascript.find(m => m.name === name)
  if (!m) throw new Error(`Mutator not found: ${name}`)
  return m
}

function binExpr(operator, leftStart, leftEnd, rightStart, rightEnd) {
  return {
    type: 'BinaryExpression', operator,
    left: { start: leftStart, end: leftEnd },
    right: { start: rightStart, end: rightEnd },
    start: leftStart, end: rightEnd
  }
}

function logExpr(operator, leftStart, leftEnd, rightStart, rightEnd) {
  return {
    type: 'LogicalExpression', operator,
    left: { start: leftStart, end: leftEnd },
    right: { start: rightStart, end: rightEnd },
    start: leftStart, end: rightEnd
  }
}

function assignExpr(operator, leftStart, leftEnd, rightStart, rightEnd) {
  return {
    type: 'AssignmentExpression', operator,
    left: { start: leftStart, end: leftEnd },
    right: { start: rightStart, end: rightEnd },
    start: leftStart, end: rightEnd
  }
}

function callWithMethod(methodName, propStart, propEnd, nodeStart, nodeEnd) {
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      computed: false,
      property: { name: methodName, start: propStart, end: propEnd },
      object: { name: 's', start: 0, end: 1 },
      start: nodeStart, end: propEnd
    },
    arguments: [{ start: propEnd + 1, end: propEnd + 3 }],
    start: nodeStart, end: nodeEnd
  }
}

function staticCall(objName, methodName, nodeStart, nodeEnd, propStart, propEnd) {
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      computed: false,
      object: { type: 'Identifier', name: objName, start: nodeStart, end: propStart - 1 },
      property: { name: methodName, start: propStart, end: propEnd },
      start: nodeStart, end: propEnd
    },
    arguments: [],
    start: nodeStart, end: nodeEnd
  }
}

import { describe, it, expect } from 'vitest'
import { javascript } from '../../src/core/ast-mutators.js'

describe('ast-mutators', () => {
  describe('structure', () => {
    it('exports a non-empty array', () => {
      expect(Array.isArray(javascript)).toBe(true)
      expect(javascript.length).toBeGreaterThan(0)
    })

    it('every mutator has required fields with correct types', () => {
      for (const mutator of javascript) {
        expect(mutator.name, `missing name`).toBeDefined()
        expect(typeof mutator.name, `name should be string: ${mutator.name}`).toBe('string')
        expect(Array.isArray(mutator.types), `types should be array: ${mutator.name}`).toBe(true)
        expect(mutator.types.length, `types should be non-empty: ${mutator.name}`).toBeGreaterThan(0)
        expect(typeof mutator.test, `test should be function: ${mutator.name}`).toBe('function')
        expect(typeof mutator.mutate, `mutate should be function: ${mutator.name}`).toBe('function')
      }
    })

    it('mutator names are unique', () => {
      const names = javascript.map(mutator => mutator.name)
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
        'NullLiteral', 'RegExpLiteral', 'ChainExpression', 'ObjectExpression',
        'IfStatement', 'WhileStatement',
        'AssignmentPattern', 'NewExpression',
        'ArrowFunctionExpression', 'Identifier',
        'BreakStatement', 'ContinueStatement',
        'CatchClause', 'TryStatement',
        'ForInStatement', 'ForOfStatement',
        'YieldExpression', 'TemplateLiteral',
        'ForStatement', 'DoWhileStatement',
        'SwitchStatement', 'SwitchCase',
        'MethodDefinition', 'PropertyDefinition',
        'ClassMethod', 'ClassProperty'
      ])
      for (const mutator of javascript)
        for (const type of mutator.types)
          expect(valid.has(type), `${mutator.name}: unknown node type '${type}'`).toBe(true)
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

  describe('method expressions', () => {
    it('toLowerCase → toUpperCase swaps method name', () => {
      const mutator = find('toLowerCase → toUpperCase')
      const node = callWithMethod('toLowerCase', 2, 13, 0, 15)
      expect(mutator.test(node)).toBe(true)
      const patch = mutator.mutate(node, 's.toLowerCase()')
      expect(patch.replacement).toBe('toUpperCase')
    })

    it('trim() → (removed) removes .trim()', () => {
      const mutator = find('trim() → (removed)')
      const node = callWithMethod('trim', 2, 6, 0, 8)
      node.arguments = []
      node.callee.object = { end: 1 }
      expect(mutator.test(node)).toBe(true)
      const patch = mutator.mutate(node, 's.trim()')
      expect(patch).toEqual({ start: 1, end: 8, replacement: '' })
    })

    it('rejects computed member expressions', () => {
      const mutator = find('toLowerCase → toUpperCase')
      const node = callWithMethod('toLowerCase', 2, 13, 0, 15)
      node.callee.computed = true
      expect(mutator.test(node)).toBe(false)
    })

    it('rejects calls with wrong method name', () => {
      const mutator = find('toLowerCase → toUpperCase')
      const node = callWithMethod('toString', 2, 10, 0, 12)
      expect(mutator.test(node)).toBe(false)
    })
  })

  describe('update operators', () => {
    it('++ → -- for postfix', () => {
      const mutator = find('++ → --')
      const node = {
        type: 'UpdateExpression',
        operator: '++',
        prefix: false,
        argument: { start: 0, end: 1 },
        start: 0,
        end: 3
      }
      expect(mutator.test(node)).toBe(true)
      const patch = mutator.mutate(node, 'i++')
      expect(patch).toEqual({ start: 1, end: 3, replacement: '--' })
    })

    it('++ → -- for prefix', () => {
      const mutator = find('++ → --')
      const node = {
        type: 'UpdateExpression',
        operator: '++',
        prefix: true,
        argument: { start: 2, end: 3 },
        start: 0,
        end: 3
      }
      const patch = mutator.mutate(node, '++i')
      expect(patch).toEqual({ start: 0, end: 2, replacement: '--' })
    })
  })

  describe('optional chaining', () => {
    it('?. → . replaces optional chaining', () => {
      const mutator = find('?. → .')
      const node = {
        type: 'MemberExpression', optional: true,
        object: { end: 3 }, property: { start: 5 },
        start: 0, end: 9
      }
      expect(mutator.test(node)).toBe(true)
      const patch = mutator.mutate(node, 'obj?.prop')
      expect(patch.replacement).toBe('.')
      expect(patch.end - patch.start).toBe(2)
    })
  })

  describe('negation removal', () => {
    it('!var → var removes negation', () => {
      const mutator = find('!var → var')
      const node = {
        type: 'UnaryExpression', operator: '!', prefix: true,
        argument: { type: 'Identifier', start: 1, end: 6 },
        start: 0, end: 6
      }
      expect(mutator.test(node)).toBe(true)
      const patch = mutator.mutate(node, '!ready')
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

    it('rejects non-void prefix unary expressions', () => {
      const m = find('void expr → expr')
      const node = {
        type: 'UnaryExpression', operator: '!', prefix: true,
        argument: { start: 1, end: 6 },
        start: 0, end: 6
      }
      expect(m.test(node)).toBe(false)
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

    it('rejects calls with wrong function name', () => {
      const m = find('parseInt → parseFloat')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'encodeURI', start: 0, end: 9 },
        start: 0, end: 14
      }
      expect(m.test(node)).toBe(false)
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

    it('rejects non-Identifier arguments (e.g. -1)', () => {
      const m = find('unary -x → x')
      const node = {
        type: 'UnaryExpression', operator: '-', prefix: true,
        argument: { type: 'NumericLiteral', value: 1, start: 1, end: 2 },
        start: 0, end: 2
      }
      expect(m.test(node)).toBe(false)
    })
  })

  // ── Default parameter removal ──

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

    it('binaryOpSwap returns null when operator found but extends past right.start', () => {
      const m = find('=== → !==')
      // '==='' starts at idx 2 and is 3 chars → ends at 5, but right.start is 4
      const node = binExpr('===', 0, 2, 4, 5)
      expect(m.mutate(node, 'a ===b')).toBeNull()
    })

    it('binaryOpSwap matches when operator ends exactly at right.start', () => {
      const m = find('=== → !==')
      // '===' starts at idx 2, length 3 → ends at 5, right.start is 5: exact boundary
      const node = binExpr('===', 0, 2, 5, 6)
      const patch = m.mutate(node, 'a === b')
      expect(patch).toEqual({ start: 2, end: 5, replacement: '!==' })
    })

    it('slice mutator patch has correct start and end positions', () => {
      const m = find('slice() → slice(1,')
      const node = callWithMethod('slice', 4, 9, 0, 11)
      const patch = m.mutate(node, 'arr.slice()')
      expect(patch).toEqual({ start: 10, end: 10, replacement: '1,' })
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

    it('filter(predicate) rejects filter call with no arguments', () => {
      const m = find('filter(predicate) → filter(true) (ignore predicate)')
      const node = callWithMethod('filter', 4, 10, 0, 12)
      node.arguments = []
      expect(m.test(node)).toBe(false)
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

    it('|| 0 → (removed) rejects Literal with string value', () => {
      const m = find('|| 0 → (removed)')
      const node = logExpr('||', 0, 1, 5, 7)
      node.right = { type: 'Literal', value: '' }
      expect(m.test(node)).toBe(false)
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

  // ── Promise method swaps ──

  describe('promise method swaps', () => {
    it('Promise.all → Promise.race swaps method', () => {
      const m = find('Promise.all → Promise.race')
      const node = staticCall('Promise', 'all', 0, 16, 8, 11)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('race')
    })

    it('Promise.race → Promise.all swaps method', () => {
      const m = find('Promise.race → Promise.all')
      const node = staticCall('Promise', 'race', 0, 17, 8, 12)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('all')
    })

    it('Promise.resolve → Promise.reject swaps method', () => {
      const m = find('Promise.resolve → Promise.reject')
      const node = staticCall('Promise', 'resolve', 0, 20, 8, 15)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('reject')
    })

    it('Promise.reject → Promise.resolve swaps method', () => {
      const m = find('Promise.reject → Promise.resolve')
      const node = staticCall('Promise', 'reject', 0, 19, 8, 14)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('resolve')
    })

    it('Promise.all does not match Promise.race', () => {
      const m = find('Promise.all → Promise.race')
      const node = staticCall('Promise', 'race', 0, 17, 8, 12)
      expect(m.test(node)).toBe(false)
    })

    it('Promise.resolve does not match Promise.reject', () => {
      const m = find('Promise.resolve → Promise.reject')
      const node = staticCall('Promise', 'reject', 0, 19, 8, 14)
      expect(m.test(node)).toBe(false)
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

  // ── New keyword removal ──

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

  // ── Arrow function short-circuit ──

  describe('arrow function short-circuit', () => {
    it('() => expr → () => undefined matches concise arrow', () => {
      const m = find('() => expr → () => undefined')
      const node = {
        type: 'ArrowFunctionExpression',
        expression: true,
        body: { type: 'BinaryExpression', start: 6, end: 11 },
        start: 0, end: 11
      }
      expect(m.test(node)).toBe(true)
    })

    it('() => expr → () => undefined does not match block body arrow', () => {
      const m = find('() => expr → () => undefined')
      const node = {
        type: 'ArrowFunctionExpression',
        expression: false,
        body: { type: 'BlockStatement', start: 6, end: 20 },
        start: 0, end: 20
      }
      expect(m.test(node)).toBe(false)
    })

    it('() => expr → () => undefined replaces body with undefined', () => {
      const m = find('() => expr → () => undefined')
      const node = {
        type: 'ArrowFunctionExpression',
        expression: true,
        body: { type: 'CallExpression', start: 6, end: 18 },
        start: 0, end: 18
      }
      const patch = m.mutate(node, '() => transform(x)')
      expect(patch).toEqual({ start: 6, end: 18, replacement: 'undefined' })
    })

    it('() => expr → () => undefined works with parameters', () => {
      const m = find('() => expr → () => undefined')
      const node = {
        type: 'ArrowFunctionExpression',
        expression: true,
        body: { type: 'Identifier', start: 9, end: 10 },
        start: 0, end: 10
      }
      const patch = m.mutate(node, '(x, y) => x')
      expect(patch).toEqual({ start: 9, end: 10, replacement: 'undefined' })
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

  // ── Loose equality operators ──

  describe('loose equality operators', () => {
    it('== → != swaps loose equality', () => {
      const m = find('== → !=')
      const node = binExpr('==', 4, 5, 9, 10)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'if (a == b) {}')
      expect(patch.replacement).toBe('!=')
    })

    it('== → != does not match ===', () => {
      const m = find('== → !=')
      expect(m.test(binExpr('===', 4, 5, 10, 11))).toBe(false)
    })

    it('!= → == swaps loose inequality', () => {
      const m = find('!= → ==')
      const node = binExpr('!=', 4, 5, 9, 10)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'if (a != b) {}')
      expect(patch.replacement).toBe('==')
    })

    it('!= → == does not match !==', () => {
      const m = find('!= → ==')
      expect(m.test(binExpr('!==', 4, 5, 10, 11))).toBe(false)
    })
  })

  // ── Logical assignment operators ──

  describe('logical assignment operators', () => {
    it('&&= → ||= swaps logical AND assignment', () => {
      const m = find('&&= → ||=')
      const node = assignExpr('&&=', 0, 1, 6, 7)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x &&= y')
      expect(patch.replacement).toBe('||=')
    })

    it('||= → &&= swaps logical OR assignment', () => {
      const m = find('||= → &&=')
      const node = assignExpr('||=', 0, 1, 6, 7)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x ||= y')
      expect(patch.replacement).toBe('&&=')
    })

    it('??= → ||= swaps nullish assignment', () => {
      const m = find('??= → ||=')
      const node = assignExpr('??=', 0, 1, 6, 7)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x ??= y')
      expect(patch.replacement).toBe('||=')
    })
  })

  // ── Bitwise assignment operators ──

  describe('bitwise assignment operators', () => {
    it('&= → |= swaps bitwise AND assignment', () => {
      const m = find('&= → |=')
      const node = assignExpr('&=', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x &= y')
      expect(patch.replacement).toBe('|=')
    })

    it('|= → &= swaps bitwise OR assignment', () => {
      const m = find('|= → &=')
      const node = assignExpr('|=', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x |= y')
      expect(patch.replacement).toBe('&=')
    })

    it('^= → &= swaps bitwise XOR assignment', () => {
      const m = find('^= → &=')
      const node = assignExpr('^=', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x ^= y')
      expect(patch.replacement).toBe('&=')
    })

    it('<<= → >>= swaps left shift assignment', () => {
      const m = find('<<= → >>=')
      const node = assignExpr('<<=', 0, 1, 6, 7)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x <<= y')
      expect(patch.replacement).toBe('>>=')
    })

    it('>>= → <<= swaps right shift assignment', () => {
      const m = find('>>= → <<=')
      const node = assignExpr('>>=', 0, 1, 6, 7)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x >>= y')
      expect(patch.replacement).toBe('<<=')
    })

    it('>>>= → >>= swaps unsigned right shift assignment', () => {
      const m = find('>>>= → >>=')
      const node = assignExpr('>>>=', 0, 1, 7, 8)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'x >>>= y')
      expect(patch.replacement).toBe('>>=')
    })
  })

  // ── Unsigned right shift ──

  describe('unsigned right shift', () => {
    it('>>> → >> swaps unsigned to signed right shift', () => {
      const m = find('>>> → >>')
      const node = binExpr('>>>', 10, 11, 17, 18)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = a >>> b')
      expect(patch.replacement).toBe('>>')
    })

    it('>>> → >> does not match >>', () => {
      const m = find('>>> → >>')
      expect(m.test(binExpr('>>', 10, 11, 15, 16))).toBe(false)
    })
  })

  // ── Bitwise NOT removal ──

  describe('bitwise NOT removal', () => {
    it('~x → x removes bitwise NOT', () => {
      const m = find('~x → x')
      const node = {
        type: 'UnaryExpression', operator: '~', prefix: true,
        argument: { type: 'Identifier', start: 1, end: 6 },
        start: 0, end: 6
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '~value')
      expect(patch).toEqual({ start: 0, end: 1, replacement: '' })
    })

    it('rejects non-~ operators', () => {
      const m = find('~x → x')
      const node = {
        type: 'UnaryExpression', operator: '!', prefix: true,
        argument: { start: 1, end: 6 },
        start: 0, end: 6
      }
      expect(m.test(node)).toBe(false)
    })
  })

  // ── instanceof negation ──

  describe('instanceof negation', () => {
    it('x instanceof Y → !(x instanceof Y) wraps in negation', () => {
      const m = find('x instanceof Y → !(x instanceof Y)')
      const node = binExpr('instanceof', 0, 3, 15, 20)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'obj instanceof Array')
      expect(patch).toEqual({ start: 0, end: 20, replacement: '!(obj instanceof Array)' })
    })

    it('does not match non-instanceof operators', () => {
      const m = find('x instanceof Y → !(x instanceof Y)')
      expect(m.test(binExpr('===', 0, 1, 5, 6))).toBe(false)
    })
  })

  // ── typeof removal ──

  describe('typeof removal', () => {
    it('typeof x → x removes typeof keyword', () => {
      const m = find('typeof x → x')
      const node = {
        type: 'UnaryExpression', operator: 'typeof', prefix: true,
        argument: { type: 'Identifier', start: 7, end: 12 },
        start: 0, end: 12
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'typeof value')
      expect(patch).toEqual({ start: 0, end: 7, replacement: '' })
    })

    it('rejects non-typeof operators', () => {
      const m = find('typeof x → x')
      const node = {
        type: 'UnaryExpression', operator: 'void', prefix: true,
        argument: { start: 5, end: 10 },
        start: 0, end: 10
      }
      expect(m.test(node)).toBe(false)
    })
  })

  // ── break removal ──

  describe('break removal', () => {
    it('break → (removed) removes break statement', () => {
      const m = find('break → (removed)')
      const node = { type: 'BreakStatement', start: 4, end: 10 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '    break;')
      expect(patch).toEqual({ start: 4, end: 10, replacement: '' })
    })
  })

  // ── continue removal ──

  describe('continue removal', () => {
    it('continue → (removed) removes continue statement', () => {
      const m = find('continue → (removed)')
      const node = { type: 'ContinueStatement', start: 4, end: 13 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, '    continue;')
      expect(patch).toEqual({ start: 4, end: 13, replacement: '' })
    })
  })

  // ── catch block emptying ──

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

  // ── finally removal ──

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

  // ── empty return removal ──

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

  // ── for...in / for...of swap ──

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

  // ── yield removal ──

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

  // ── delete removal ──

  describe('delete removal', () => {
    it('delete obj.key → true replaces delete expression', () => {
      const m = find('delete obj.key → true')
      const node = {
        type: 'UnaryExpression', operator: 'delete', prefix: true,
        argument: { type: 'MemberExpression', start: 7, end: 14 },
        start: 0, end: 14
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'delete obj.key')
      expect(patch).toEqual({ start: 0, end: 14, replacement: 'true' })
    })

    it('rejects non-delete operators', () => {
      const m = find('delete obj.key → true')
      const node = {
        type: 'UnaryExpression', operator: 'typeof', prefix: true,
        argument: { start: 7, end: 12 },
        start: 0, end: 12
      }
      expect(m.test(node)).toBe(false)
    })
  })

  // ── null / undefined swap ──

  describe('null / undefined swap', () => {
    it('null → undefined replaces NullLiteral', () => {
      const m = find('null → undefined')
      const node = { type: 'NullLiteral', value: null, start: 10, end: 14 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = null')
      expect(patch).toEqual({ start: 10, end: 14, replacement: 'undefined' })
    })

    it('null → undefined matches ESTree Literal with raw null', () => {
      const m = find('null → undefined')
      const node = { type: 'Literal', value: null, raw: 'null', start: 10, end: 14 }
      expect(m.test(node)).toBe(true)
    })

    it('null → undefined does not match other literals', () => {
      const m = find('null → undefined')
      const node = { type: 'Literal', value: 0, raw: '0', start: 10, end: 11 }
      expect(m.test(node)).toBe(false)
    })

    it('undefined → null replaces Identifier undefined', () => {
      const m = find('undefined → null')
      const node = { type: 'Identifier', name: 'undefined', start: 10, end: 19 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = undefined')
      expect(patch).toEqual({ start: 10, end: 19, replacement: 'null' })
    })

    it('undefined → null does not match other identifiers', () => {
      const m = find('undefined → null')
      const node = { type: 'Identifier', name: 'value', start: 10, end: 15 }
      expect(m.test(node)).toBe(false)
    })
  })

  // ── empty array mutation ──

  describe('empty array mutation', () => {
    it('[] → [undefined] replaces empty array', () => {
      const m = find('[] → [undefined]')
      const node = { type: 'ArrayExpression', elements: [], start: 10, end: 12 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = []')
      expect(patch).toEqual({ start: 10, end: 12, replacement: '[undefined]' })
    })

    it('does not match non-empty arrays', () => {
      const m = find('[] → [undefined]')
      const node = { type: 'ArrayExpression', elements: [{ type: 'Literal' }], start: 10, end: 13 }
      expect(m.test(node)).toBe(false)
    })
  })

  // ── template literal mutation ──

  describe('template literal mutation', () => {
    it('`${...}` → `` replaces template literal with empty', () => {
      const m = find('`${...}` → ``')
      const node = {
        type: 'TemplateLiteral',
        expressions: [{ type: 'Identifier', start: 7, end: 11 }],
        quasis: [],
        start: 5, end: 13
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'foo = `hi ${name}`')
      expect(patch).toEqual({ start: 5, end: 13, replacement: '``' })
    })

    it('does not match template literals without expressions', () => {
      const m = find('`${...}` → ``')
      const node = {
        type: 'TemplateLiteral',
        expressions: [],
        quasis: [{ type: 'TemplateElement' }],
        start: 5, end: 10
      }
      expect(m.test(node)).toBe(false)
    })
  })

  // ── method additions ──

  describe('indexOf / lastIndexOf swap', () => {
    it('indexOf → lastIndexOf swaps search direction', () => {
      const m = find('indexOf → lastIndexOf')
      const node = callWithMethod('indexOf', 4, 11, 0, 15)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('lastIndexOf')
    })

    it('lastIndexOf → indexOf swaps search direction', () => {
      const m = find('lastIndexOf → indexOf')
      const node = callWithMethod('lastIndexOf', 4, 15, 0, 19)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('indexOf')
    })
  })

  describe('sort removal', () => {
    it('sort() → (removed) removes .sort()', () => {
      const m = find('sort() → (removed)')
      const node = callWithMethod('sort', 4, 8, 0, 10)
      node.callee.object = { end: 3 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'arr.sort()')
      expect(patch).toEqual({ start: 3, end: 10, replacement: '' })
    })
  })

  describe('reduce / reduceRight swap', () => {
    it('reduce → reduceRight swaps method', () => {
      const m = find('reduce → reduceRight')
      const node = callWithMethod('reduce', 4, 10, 0, 20)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('reduceRight')
    })

    it('reduceRight → reduce swaps method', () => {
      const m = find('reduceRight → reduce')
      const node = callWithMethod('reduceRight', 4, 15, 0, 25)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('reduce')
    })
  })

  describe('coercion function swaps', () => {
    it('Number → String swaps global function', () => {
      const m = find('Number → String')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'Number', start: 0, end: 6 },
        start: 0, end: 11
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 0, end: 6, replacement: 'String' })
    })

    it('String → Number swaps global function', () => {
      const m = find('String → Number')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'String', start: 0, end: 6 },
        start: 0, end: 11
      }
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('Number')
    })

    it('Boolean → Number swaps global function', () => {
      const m = find('Boolean → Number')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'Boolean', start: 0, end: 7 },
        start: 0, end: 12
      }
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('Number')
    })
  })

  describe('Object.freeze / Object.seal removal', () => {
    it('Object.freeze() → identity returns the argument', () => {
      const m = find('Object.freeze() → identity')
      const node = staticCall('Object', 'freeze', 0, 20, 7, 13)
      node.arguments = [{ start: 14, end: 19 }]
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'Object.freeze(myObj)')
      expect(patch).toEqual({ start: 0, end: 20, replacement: 'myObj' })
    })

    it('Object.freeze() skips when no arguments', () => {
      const m = find('Object.freeze() → identity')
      const node = staticCall('Object', 'freeze', 0, 16, 7, 13)
      node.arguments = []
      expect(m.test(node)).toBe(false)
    })

    it('Object.seal() → identity returns the argument', () => {
      const m = find('Object.seal() → identity')
      const node = staticCall('Object', 'seal', 0, 18, 7, 11)
      node.arguments = [{ start: 12, end: 17 }]
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'Object.seal(myObj)')
      expect(patch).toEqual({ start: 0, end: 18, replacement: 'myObj' })
    })
  })

  describe('JSON method swaps', () => {
    it('JSON.parse → JSON.stringify swaps method', () => {
      const m = find('JSON.parse → JSON.stringify')
      const node = staticCall('JSON', 'parse', 0, 16, 5, 10)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('stringify')
    })

    it('JSON.stringify → JSON.parse swaps method', () => {
      const m = find('JSON.stringify → JSON.parse')
      const node = staticCall('JSON', 'stringify', 0, 20, 5, 14)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('parse')
    })
  })

  // ── in operator negation ──

  describe('in operator negation', () => {
    it("'key' in obj → !('key' in obj) wraps in negation", () => {
      const m = find("'key' in obj → !('key' in obj)")
      const node = binExpr('in', 0, 5, 9, 12)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, "'key' in obj")
      expect(patch).toEqual({ start: 0, end: 12, replacement: "!('key' in obj)" })
    })

    it('does not match non-in operators', () => {
      const m = find("'key' in obj → !('key' in obj)")
      expect(m.test(binExpr('===', 0, 1, 5, 6))).toBe(false)
    })
  })

  // ── logical short-circuit removal ──

  describe('logical short-circuit removal', () => {
    it('a && b → a removes right side of AND', () => {
      const m = find('a && b → a')
      const node = logExpr('&&', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'a && b')
      expect(patch).toEqual({ start: 0, end: 6, replacement: 'a' })
    })

    it('a && b → b removes left side of AND', () => {
      const m = find('a && b → b')
      const node = logExpr('&&', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'a && b')
      expect(patch).toEqual({ start: 0, end: 6, replacement: 'b' })
    })

    it('a || b → a removes right side of OR', () => {
      const m = find('a || b → a')
      const node = logExpr('||', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'a || b')
      expect(patch).toEqual({ start: 0, end: 6, replacement: 'a' })
    })

    it('a || b → b removes left side of OR', () => {
      const m = find('a || b → b')
      const node = logExpr('||', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'a || b')
      expect(patch).toEqual({ start: 0, end: 6, replacement: 'b' })
    })

    it('a ?? b → a removes nullish fallback', () => {
      const m = find('a ?? b → a')
      const node = logExpr('??', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'a ?? b')
      expect(patch).toEqual({ start: 0, end: 6, replacement: 'a' })
    })

    it('a ?? b → b always uses fallback', () => {
      const m = find('a ?? b → b')
      const node = logExpr('??', 0, 1, 5, 6)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'a ?? b')
      expect(patch).toEqual({ start: 0, end: 6, replacement: 'b' })
    })

    it('a && b → a does not match || operator', () => {
      const m = find('a && b → a')
      expect(m.test(logExpr('||', 0, 1, 5, 6))).toBe(false)
    })

    it('a || b → a does not match && operator', () => {
      const m = find('a || b → a')
      expect(m.test(logExpr('&&', 0, 1, 5, 6))).toBe(false)
    })

    it('preserves complex expressions', () => {
      const m = find('a && b → a')
      const node = logExpr('&&', 0, 9, 13, 25)
      const patch = m.mutate(node, 'isValid() && process(x)')
      expect(patch).toEqual({ start: 0, end: 25, replacement: 'isValid()' })
    })
  })

  // ── static keyword removal ──

  describe('static keyword removal', () => {
    it('static → (removed) removes static keyword from method', () => {
      const m = find('static → (removed)')
      const node = {
        type: 'MethodDefinition',
        static: true,
        key: { start: 7, end: 13 },
        start: 0, end: 20
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'static method() {}')
      expect(patch).toEqual({ start: 0, end: 7, replacement: '' })
    })

    it('skips non-static methods', () => {
      const m = find('static → (removed)')
      const node = {
        type: 'MethodDefinition',
        static: false,
        key: { start: 0, end: 6 },
        start: 0, end: 13
      }
      expect(m.test(node)).toBe(false)
    })

    it('works with ClassProperty nodes', () => {
      const m = find('static → (removed)')
      const node = {
        type: 'ClassProperty',
        static: true,
        key: { start: 7, end: 12 },
        start: 0, end: 16
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'static count = 0')
      expect(patch).toEqual({ start: 0, end: 7, replacement: '' })
    })

    it('returns null when static keyword not found in source', () => {
      const m = find('static → (removed)')
      const node = {
        type: 'MethodDefinition',
        static: true,
        key: { start: 0, end: 5 },
        start: 0, end: 12
      }
      expect(m.mutate(node, 'method() {}')).toBeNull()
    })
  })

  // ── error type swap ──

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

  // ── string literals any context ──

  describe('string literals any context', () => {
    it("'' → 'mutant' replaces empty single-quoted string", () => {
      const m = find("'' → 'mutant' (any context)")
      const node = { type: 'StringLiteral', value: '', start: 10, end: 12 }
      expect(m.test(node, "const x = ''")).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 10, end: 12, replacement: "'mutant'" })
    })

    it('"" → "mutant" replaces empty double-quoted string', () => {
      const m = find('"" → "mutant" (any context)')
      const node = { type: 'StringLiteral', value: '', start: 10, end: 12 }
      expect(m.test(node, 'const x = ""')).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 10, end: 12, replacement: '"mutant"' })
    })

    it('skips return statement context (already covered)', () => {
      const m = find("'' → 'mutant' (any context)")
      const node = { type: 'StringLiteral', value: '', start: 7, end: 9 }
      const parent = { type: 'ReturnStatement' }
      expect(m.test(node, "return ''", parent)).toBe(false)
    })

    it('skips non-empty strings', () => {
      const m = find("'' → 'mutant' (any context)")
      const node = { type: 'StringLiteral', value: 'hello', start: 10, end: 17 }
      expect(m.test(node, "const x = 'hello'")).toBe(false)
    })

    it('matches ESTree Literal with string value', () => {
      const m = find("'' → 'mutant' (any context)")
      const node = { type: 'Literal', value: '', start: 10, end: 12 }
      expect(m.test(node, "const x = ''")).toBe(true)
    })
  })

  // ── numeric off-by-one ──

  describe('numeric off-by-one', () => {
    it('n → n + 1 increments integer > 1', () => {
      const m = find('n → n + 1')
      const node = { type: 'NumericLiteral', value: 5, start: 10, end: 11 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = 5')
      expect(patch).toEqual({ start: 10, end: 11, replacement: '6' })
    })

    it('n → n - 1 decrements integer > 1', () => {
      const m = find('n → n - 1')
      const node = { type: 'NumericLiteral', value: 10, start: 10, end: 12 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'const x = 10')
      expect(patch).toEqual({ start: 10, end: 12, replacement: '9' })
    })

    it('skips 0 and 1 (covered by numericBoundary)', () => {
      const m = find('n → n + 1')
      expect(m.test({ type: 'NumericLiteral', value: 0 })).toBe(false)
      expect(m.test({ type: 'NumericLiteral', value: 1 })).toBe(false)
    })

    it('skips floating point numbers', () => {
      const m = find('n → n + 1')
      expect(m.test({ type: 'NumericLiteral', value: 3.14 })).toBe(false)
    })

    it('skips hex literals in n + 1', () => {
      const m = find('n → n + 1')
      const node = { type: 'NumericLiteral', value: 255, start: 10, end: 14 }
      expect(m.mutate(node, 'const x = 0xFF')).toBeNull()
    })

    it('skips hex literals in n - 1', () => {
      const m = find('n → n - 1')
      const node = { type: 'NumericLiteral', value: 255, start: 10, end: 14 }
      expect(m.mutate(node, 'const x = 0xFF')).toBeNull()
    })

    it('handles large numbers', () => {
      const m = find('n → n + 1')
      const node = { type: 'NumericLiteral', value: 1000, start: 10, end: 14 }
      const patch = m.mutate(node, 'const x = 1000')
      expect(patch).toEqual({ start: 10, end: 14, replacement: '1001' })
    })

    it('matches ESTree Literal type', () => {
      const m = find('n → n + 1')
      const node = { type: 'Literal', value: 42, start: 10, end: 12 }
      expect(m.test(node)).toBe(true)
    })
  })

  // ── forEach removal ──

  describe('forEach removal', () => {
    it('forEach() → (removed) removes .forEach()', () => {
      const m = find('forEach() → (removed)')
      const node = callWithMethod('forEach', 4, 11, 0, 18)
      node.callee.object = { end: 3 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'arr.forEach(fn)')
      expect(patch).toEqual({ start: 3, end: 18, replacement: '' })
    })
  })

  // ── trimStart / trimEnd swap ──

  describe('trimStart / trimEnd swap', () => {
    it('trimStart → trimEnd swaps', () => {
      const m = find('trimStart → trimEnd')
      const node = callWithMethod('trimStart', 2, 11, 0, 13)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('trimEnd')
    })

    it('trimEnd → trimStart swaps', () => {
      const m = find('trimEnd → trimStart')
      const node = callWithMethod('trimEnd', 2, 9, 0, 11)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('trimStart')
    })
  })

  // ── flat / flatMap ──

  describe('flat / flatMap', () => {
    it('flat() → (removed) removes .flat()', () => {
      const m = find('flat() → (removed)')
      const node = callWithMethod('flat', 4, 8, 0, 10)
      node.callee.object = { end: 3 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'arr.flat()')
      expect(patch).toEqual({ start: 3, end: 10, replacement: '' })
    })

    it('flatMap → map swaps', () => {
      const m = find('flatMap → map')
      const node = callWithMethod('flatMap', 4, 11, 0, 18)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('map')
    })
  })

  // ── Promise.allSettled / Promise.any ──

  describe('Promise.allSettled / Promise.any', () => {
    it('Promise.allSettled → Promise.any swaps', () => {
      const m = find('Promise.allSettled → Promise.any')
      const node = staticCall('Promise', 'allSettled', 0, 24, 8, 18)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('any')
    })

    it('Promise.any → Promise.allSettled swaps', () => {
      const m = find('Promise.any → Promise.allSettled')
      const node = staticCall('Promise', 'any', 0, 16, 8, 11)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('allSettled')
    })
  })

  // ── encodeURIComponent / decodeURIComponent ──

  describe('URI component encoding', () => {
    it('encodeURIComponent → decodeURIComponent swaps', () => {
      const m = find('encodeURIComponent → decodeURIComponent')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'encodeURIComponent', start: 0, end: 18 },
        start: 0, end: 24
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 0, end: 18, replacement: 'decodeURIComponent' })
    })

    it('decodeURIComponent → encodeURIComponent swaps', () => {
      const m = find('decodeURIComponent → encodeURIComponent')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'decodeURIComponent', start: 0, end: 18 },
        start: 0, end: 24
      }
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('encodeURIComponent')
    })
  })

  // ── Math.trunc / Math.sign ──

  describe('Math.trunc / Math.sign', () => {
    it('Math.trunc → Math.floor swaps', () => {
      const m = find('Math.trunc → Math.floor')
      const node = staticCall('Math', 'trunc', 0, 14, 5, 10)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('floor')
    })

    it('Math.sign → (removed) removes Math.sign callee', () => {
      const m = find('Math.sign → (removed)')
      const node = staticCall('Math', 'sign', 0, 12, 5, 9)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node)
      expect(patch).toEqual({ start: 0, end: 9, replacement: '' })
    })
  })

  // ── Array.from removal ──

  describe('Array.from removal', () => {
    it('Array.from() → identity returns the argument', () => {
      const m = find('Array.from() → identity')
      const node = staticCall('Array', 'from', 0, 20, 6, 10)
      node.arguments = [{ start: 11, end: 19 }]
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'Array.from(iterable)')
      expect(patch).toEqual({ start: 0, end: 20, replacement: 'iterable' })
    })

    it('Array.from() skips when no arguments', () => {
      const m = find('Array.from() → identity')
      const node = staticCall('Array', 'from', 0, 12, 6, 10)
      node.arguments = []
      expect(m.test(node)).toBe(false)
    })
  })

  // ── if-block emptying ──

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

  // ── else-block removal ──

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

  // ── replaceAll → replace ──

  describe('replaceAll → replace', () => {
    it('replaceAll → replace swaps method', () => {
      const m = find('replaceAll → replace')
      const node = callWithMethod('replaceAll', 2, 12, 0, 20)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('replace')
    })
  })

  // ── charAt / charCodeAt swap ──

  describe('charAt / charCodeAt swap', () => {
    it('charAt → charCodeAt swaps', () => {
      const m = find('charAt → charCodeAt')
      const node = callWithMethod('charAt', 2, 8, 0, 12)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('charCodeAt')
    })

    it('charCodeAt → charAt swaps', () => {
      const m = find('charCodeAt → charAt')
      const node = callWithMethod('charCodeAt', 2, 12, 0, 16)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('charAt')
    })
  })

  // ── promise chain mutations ──

  describe('promise chain mutations', () => {
    it('.then → .catch swaps', () => {
      const m = find('.then → .catch')
      const node = callWithMethod('then', 8, 12, 0, 18)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('catch')
    })

    it('.catch → .then swaps', () => {
      const m = find('.catch → .then')
      const node = callWithMethod('catch', 8, 13, 0, 19)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('then')
    })

    it('.catch() → (removed) removes .catch()', () => {
      const m = find('.catch() → (removed)')
      const node = callWithMethod('catch', 8, 13, 0, 22)
      node.callee.object = { end: 7 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'promise.catch(handler)')
      expect(patch).toEqual({ start: 7, end: 22, replacement: '' })
    })

    it('.catch() → (removed) skips when no arguments', () => {
      const m = find('.catch() → (removed)')
      const node = callWithMethod('catch', 8, 13, 0, 15)
      node.arguments = []
      expect(m.test(node)).toBe(false)
    })
  })

  // ── Object.assign removal ──

  describe('Object.assign removal', () => {
    it('Object.assign() → identity returns the first argument', () => {
      const m = find('Object.assign() → identity')
      const node = staticCall('Object', 'assign', 0, 28, 7, 13)
      node.arguments = [{ start: 14, end: 20 }, { start: 22, end: 27 }]
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'Object.assign(target, source)')
      expect(patch).toEqual({ start: 0, end: 28, replacement: 'target' })
    })

    it('Object.assign() skips when no arguments', () => {
      const m = find('Object.assign() → identity')
      const node = staticCall('Object', 'assign', 0, 16, 7, 13)
      node.arguments = []
      expect(m.test(node)).toBe(false)
    })
  })

  // ── loop body emptying ──

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

  // ── Map/Set method swaps ──

  describe('Map/Set method swaps', () => {
    it('.get → .has swaps', () => {
      const m = find('.get → .has')
      const node = callWithMethod('get', 4, 7, 0, 12)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('has')
    })

    it('.has → .get swaps', () => {
      const m = find('.has → .get')
      const node = callWithMethod('has', 4, 7, 0, 12)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('get')
    })

    it('.add → .delete swaps', () => {
      const m = find('.add → .delete')
      const node = callWithMethod('add', 4, 7, 0, 12)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('delete')
    })

    it('.delete → .add swaps', () => {
      const m = find('.delete → .add')
      const node = callWithMethod('delete', 4, 10, 0, 15)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('add')
    })
  })

  // ── split / join removal ──

  describe('split / join removal', () => {
    it('split() → (removed) removes .split()', () => {
      const m = find('split() → (removed)')
      const node = callWithMethod('split', 3, 8, 0, 13)
      node.callee.object = { end: 2 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'st.split(",")')
      expect(patch).toEqual({ start: 2, end: 13, replacement: '' })
    })

    it('join() → (removed) removes .join()', () => {
      const m = find('join() → (removed)')
      const node = callWithMethod('join', 4, 8, 0, 13)
      node.callee.object = { end: 3 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'arr.join(",")')
      expect(patch).toEqual({ start: 3, end: 13, replacement: '' })
    })
  })

  // ── switch mutations ──

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

  // ── toString / valueOf ──

  describe('toString / valueOf mutations', () => {
    it('toString → valueOf swaps', () => {
      const m = find('toString → valueOf')
      const node = callWithMethod('toString', 4, 12, 0, 14)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('valueOf')
    })

    it('valueOf → toString swaps', () => {
      const m = find('valueOf → toString')
      const node = callWithMethod('valueOf', 4, 11, 0, 13)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('toString')
    })

    it('toString() → (removed) removes .toString()', () => {
      const m = find('toString() → (removed)')
      const node = callWithMethod('toString', 4, 12, 0, 14)
      node.arguments = []
      node.callee.object = { end: 3 }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'num.toString()')
      expect(patch).toEqual({ start: 3, end: 14, replacement: '' })
    })

    it('toString() → (removed) skips when has arguments', () => {
      const m = find('toString() → (removed)')
      const node = callWithMethod('toString', 4, 12, 0, 16)
      expect(m.test(node)).toBe(false)
    })
  })

  // ── structuredClone removal ──

  describe('structuredClone removal', () => {
    it('structuredClone() → identity returns the argument', () => {
      const m = find('structuredClone() → identity')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'structuredClone', start: 0, end: 15 },
        arguments: [{ start: 16, end: 19 }],
        start: 0, end: 20
      }
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'structuredClone(obj)')
      expect(patch).toEqual({ start: 0, end: 20, replacement: 'obj' })
    })

    it('structuredClone() skips when no arguments', () => {
      const m = find('structuredClone() → identity')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'structuredClone', start: 0, end: 15 },
        arguments: [],
        start: 0, end: 17
      }
      expect(m.test(node)).toBe(false)
    })

    it('does not match other global functions', () => {
      const m = find('structuredClone() → identity')
      const node = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'parseInt', start: 0, end: 8 },
        arguments: [{ start: 9, end: 14 }],
        start: 0, end: 15
      }
      expect(m.test(node)).toBe(false)
    })
  })
})

// ── Test helpers ──

function find(name) {
  const mutator = javascript.find(mut => mut.name === name)
  if (!mutator) throw new Error(`Mutator not found: ${name}`)
  return mutator
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

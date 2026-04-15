import { describe, it, expect } from 'vitest'
import { astMutators } from '../../core/ast-mutators.js'

describe('ast-mutators', () => {
  describe('structure', () => {
    it('exports a non-empty array', () => {
      expect(Array.isArray(astMutators)).toBe(true)
      expect(astMutators.length).toBeGreaterThan(0)
    })

    it('every mutator has required fields with correct types', () => {
      for (const m of astMutators) {
        expect(m.name, `missing name`).toBeDefined()
        expect(typeof m.name, `name should be string: ${m.name}`).toBe('string')
        expect(Array.isArray(m.types), `types should be array: ${m.name}`).toBe(true)
        expect(m.types.length, `types should be non-empty: ${m.name}`).toBeGreaterThan(0)
        expect(typeof m.test, `test should be function: ${m.name}`).toBe('function')
        expect(typeof m.mutate, `mutate should be function: ${m.name}`).toBe('function')
      }
    })

    it('mutator names are unique', () => {
      const names = astMutators.map(m => m.name)
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
        'ChainExpression'
      ])
      for (const m of astMutators) {
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

    it('Math.abs → (removed) removes Math.abs', () => {
      const m = find('Math.abs → (removed)')
      const node = staticCall('Math', 'abs', 0, 12, 5, 8)
      expect(m.test(node)).toBe(true)
      const patch = m.mutate(node, 'Math.abs(x)')
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
})

// ── Test helpers ──

function find(name) {
  const m = astMutators.find(m => m.name === name)
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

import { describe, it, expect } from 'vitest'
import { find, binExpr, logExpr, assignExpr, callWithMethod } from './ast-mutators-helpers.js'

describe('ast-mutators: operators', () => {
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

  describe('defensive null returns', () => {
    it('assignmentOpSwap returns null when operator not found between nodes', () => {
      const m = find('+= → -=')
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
      const node = binExpr('===', 0, 2, 4, 5)
      expect(m.mutate(node, 'a ===b')).toBeNull()
    })

    it('binaryOpSwap matches when operator ends exactly at right.start', () => {
      const m = find('=== → !==')
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
})

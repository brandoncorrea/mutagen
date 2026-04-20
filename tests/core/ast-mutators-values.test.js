import { describe, it, expect } from 'vitest'
import { find } from './ast-mutators-helpers.js'

describe('ast-mutators: values', () => {
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

  describe('remaining boolean literals', () => {
    it('false → true matches boolean false', () => {
      const m = find('false → true')
      expect(m.test({ type: 'Literal', value: false })).toBe(true)
      expect(m.test({ type: 'BooleanLiteral', value: false })).toBe(true)
      const patch = m.mutate({ type: 'Literal', value: false, start: 10, end: 15 })
      expect(patch).toEqual({ start: 10, end: 15, replacement: 'true' })
    })
  })

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
})

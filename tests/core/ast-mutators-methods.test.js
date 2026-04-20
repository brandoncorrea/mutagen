import { describe, it, expect } from 'vitest'
import { find, callWithMethod, staticCall } from './ast-mutators-helpers.js'

describe('ast-mutators: methods', () => {
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

  describe('replaceAll → replace', () => {
    it('replaceAll → replace swaps method', () => {
      const m = find('replaceAll → replace')
      const node = callWithMethod('replaceAll', 2, 12, 0, 20)
      expect(m.test(node)).toBe(true)
      expect(m.mutate(node).replacement).toBe('replace')
    })
  })

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

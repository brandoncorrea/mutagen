import { describe, it, expect } from 'vitest'
import { preparePatterns, generateMutations } from '../../core/engine.js'
import { javascript } from '../../core/patterns/javascript.js'

function findPattern(name) {
  const p = javascript.find(p => p.name === name)
  if (!p) throw new Error(`Pattern not found: ${name}`)
  return p
}

function mutate(patternName, source) {
  const prepared = preparePatterns([findPattern(patternName)])
  return generateMutations(source, prepared)
}

function expectMutation(patternName, source, expectedMutated) {
  const mutations = mutate(patternName, source)
  expect(mutations, `expected 1 mutation for "${patternName}" on: ${source}`).toHaveLength(1)
  expect(mutations[0].mutated).toBe(expectedMutated)
}

function expectNoMutation(patternName, source) {
  const mutations = mutate(patternName, source)
  expect(mutations, `expected 0 mutations for "${patternName}" on: ${source}`).toHaveLength(0)
}

describe('javascript mutation patterns', () => {
  describe('EqualityOperator', () => {
    it('=== → !==', () => {
      expectMutation('=== → !==', 'if (a === b) {}', 'if (a !== b) {}')
    })

    it('!== → ===', () => {
      expectMutation('!== → ===', 'if (a !== b) {}', 'if (a === b) {}')
    })

    it('>= → <', () => {
      expectMutation('>= → <', 'if (a >= b) {}', 'if (a < b) {}')
    })

    it('<= → >', () => {
      expectMutation('<= → >', 'if (a <= b) {}', 'if (a > b) {}')
    })

    it('> → <', () => {
      expectMutation('> → <', 'if (a > b) {}', 'if (a < b) {}')
    })

    it('> → < blocked by nearGuard when = adjacent', () => {
      expectNoMutation('> → <', 'if (a >= b) {}')
    })

    it('< → >', () => {
      expectMutation('< → >', 'if (a < b) {}', 'if (a > b) {}')
    })

    it('< → > blocked by nearGuard when = adjacent', () => {
      expectNoMutation('< → >', 'if (a <= b) {}')
    })
  })

  describe('LogicalOperator', () => {
    it('&& → ||', () => {
      expectMutation('&& → ||', 'if (a && b) {}', 'if (a || b) {}')
    })

    it('|| → &&', () => {
      expectMutation('|| → &&', 'if (a || b) {}', 'if (a && b) {}')
    })
  })

  describe('ArithmeticOperator', () => {
    it('+ → -', () => {
      expectMutation('+ → -', 'const x = a + b', 'const x = a - b')
    })

    it('+ → - blocked by nearGuard near quotes', () => {
      expectNoMutation('+ → -', "const x = 'a' + 'b'")
    })

    it('- → +', () => {
      expectMutation('- → +', 'const x = a - b', 'const x = a + b')
    })

    it('- → + blocked by nearGuard near quotes', () => {
      expectNoMutation('- → +', "const x = 'a' - 'b'")
    })

    it('* → /', () => {
      expectMutation('* → /', 'const x = a * b', 'const x = a / b')
    })

    it('* → / blocked by nearGuard near quotes', () => {
      expectNoMutation('* → /', "const x = 'a' * 2")
    })

    it('/ → *', () => {
      expectMutation('/ → *', 'const x = a / b', 'const x = a * b')
    })

    it('/ → * blocked by nearGuard near quotes', () => {
      expectNoMutation('/ → *', "const x = 'a' / 2")
    })

    it('% → +', () => {
      expectMutation('% → +', 'const x = a % b', 'const x = a + b')
    })

    it('** → *', () => {
      expectMutation('** → *', 'const x = a ** b', 'const x = a * b')
    })
  })

  describe('BooleanLiteral', () => {
    it('true → false', () => {
      expectMutation('true → false', 'const x = true', 'const x = false')
    })

    it('true → false skips strings', () => {
      expectNoMutation('true → false', "const x = 'true'")
    })

    it('false → true', () => {
      expectMutation('false → true', 'const x = false', 'const x = true')
    })
  })

  describe('ConditionalExpression', () => {
    it('ternary → always truthy', () => {
      expectMutation('ternary → always truthy', 'const x = a ? b : c', 'const x = a ? true || b : c')
    })

    it('ternary → always falsy', () => {
      expectMutation('ternary → always falsy', 'const x = a ? b : c', 'const x = a ? false && b : c')
    })
  })

  describe('MethodExpression', () => {
    it('toLowerCase → toUpperCase', () => {
      expectMutation('toLowerCase → toUpperCase', 'const x = s.toLowerCase()', 'const x = s.toUpperCase()')
    })

    it('toUpperCase → toLowerCase', () => {
      expectMutation('toUpperCase → toLowerCase', 'const x = s.toUpperCase()', 'const x = s.toLowerCase()')
    })

    it('trim() → (removed)', () => {
      expectMutation('trim() → (removed)', 'const x = s.trim()', 'const x = s')
    })

    it('filter(predicate) → filter(true)', () => {
      expectMutation(
        'filter(predicate) → filter(true) (ignore predicate)',
        'const x = arr.filter(fn)',
        'const x = arr.filter(x => true, fn)'
      )
    })

    it('slice() → slice(1,', () => {
      expectMutation('slice() → slice(1,', 'const x = arr.slice(0)', 'const x = arr.slice(1,0)')
    })
  })

  describe('StringLiteral', () => {
    it("return '' → return 'mutant'", () => {
      expectMutation("return '' → return 'mutant'", "return ''", "return 'mutant'")
    })

    it('return "" → return "mutant"', () => {
      expectMutation('return "" → return "mutant"', 'return ""', 'return "mutant"')
    })
  })

  describe('BlockStatement', () => {
    it('return {} → Object.freeze', () => {
      // Intentionally produces broken syntax (no closing paren) — name says "syntax break"
      expectMutation(
        'return {} → Object.freeze (syntax break)',
        'return { a: 1 }',
        'return Object.freeze({ a: 1 }'
      )
    })

    it('return → void', () => {
      expectMutation('return → void', '  return x', 'void x')
    })

    it('return → void guard blocks return {} (mu-cyo)', () => {
      const mutations = mutate('return → void', '  return {}')
      expect(mutations).toHaveLength(0)
    })

    it('return → void guard blocks return [] (mu-cyo)', () => {
      const mutations = mutate('return → void', '  return []')
      expect(mutations).toHaveLength(0)
    })
  })

  describe('Async', () => {
    it('await → (removed)', () => {
      expectMutation('await → (removed)', 'const x = await fetch(url)', 'const x = fetch(url)')
    })
  })

  describe('Remove || fallback', () => {
    it('|| [] → (removed)', () => {
      expectMutation('|| [] → (removed)', 'const x = val || []', 'const x = val')
    })

    it("|| '' → (removed)", () => {
      expectMutation("|| '' → (removed)", "const x = val || ''", 'const x = val')
    })

    it('|| 0 → (removed)', () => {
      expectMutation('|| 0 → (removed)', 'const x = val || 0', 'const x = val')
    })
  })

  describe('UpdateOperator', () => {
    it('++ → --', () => {
      expectMutation('++ → --', 'i++', 'i--')
    })

    it('-- → ++', () => {
      expectMutation('-- → ++', 'i--', 'i++')
    })

    it('-- → ++ blocked by nearGuard near quotes', () => {
      expectNoMutation('-- → ++', "x = '--'")
    })
  })

  describe('Optional chaining removal', () => {
    it('?. → .', () => {
      expectMutation('?. → .', 'const x = obj?.prop', 'const x = obj.prop')
    })
  })

  describe('Negation removal', () => {
    it('!var → var', () => {
      expectMutation('!var → var', 'if (!ready) {}', 'if (ready) {}')
    })

    it('!var → var blocked by guard on !==', () => {
      expectNoMutation('!var → var', 'if (a !== b) {}')
    })
  })

  describe('Nullish coalescing', () => {
    it('?? → ||', () => {
      expectMutation('?? → ||', 'const x = a ?? b', 'const x = a || b')
    })
  })

  describe('Assignment mutations', () => {
    it('+= → -=', () => {
      expectMutation('+= → -=', 'x += 1', 'x -= 1')
    })

    it('-= → +=', () => {
      expectMutation('-= → +=', 'x -= 1', 'x += 1')
    })
  })

  describe('Numeric boundary', () => {
    it('0 → 1', () => {
      expectMutation('0 → 1', 'const x = 0', 'const x = 1')
    })

    it('0 → 1 blocked by guard on hex literal', () => {
      expectNoMutation('0 → 1', 'const x = 0xFF')
    })

    it('0 → 1 blocked by guard on decimal', () => {
      expectNoMutation('0 → 1', 'const x = 0.5')
    })

    it('1 → 0', () => {
      expectMutation('1 → 0', 'const x = 1', 'const x = 0')
    })

    it('1 → 0 not triggered inside decimal', () => {
      // The lookbehind (?<![.\d]) prevents matching after . or digit
      expectNoMutation('1 → 0', 'const x = 3.14')
    })

    it('-1 → 0', () => {
      expectMutation('-1 → 0', 'const x = -1', 'const x = 0')
    })

    it('-1 → 0 blocked by guard in string context', () => {
      expectNoMutation('-1 → 0', "const x = '-1'")
    })
  })

  describe('Throw removal', () => {
    it('throw → return', () => {
      expectMutation('throw → return', '  throw new Error()', 'return new Error()')
    })
  })

  describe('String method swaps', () => {
    it('includes → indexOf', () => {
      expectMutation('includes → indexOf', "s.includes('x')", "s.indexOf('x')")
    })

    it('startsWith → endsWith', () => {
      expectMutation('startsWith → endsWith', "s.startsWith('x')", "s.endsWith('x')")
    })

    it('endsWith → startsWith', () => {
      expectMutation('endsWith → startsWith', "s.endsWith('x')", "s.startsWith('x')")
    })
  })

  describe('Math method swaps', () => {
    it('Math.floor → Math.ceil', () => {
      expectMutation('Math.floor → Math.ceil', 'Math.floor(x)', 'Math.ceil(x)')
    })

    it('Math.ceil → Math.floor', () => {
      expectMutation('Math.ceil → Math.floor', 'Math.ceil(x)', 'Math.floor(x)')
    })

    it('Math.min → Math.max', () => {
      expectMutation('Math.min → Math.max', 'Math.min(a, b)', 'Math.max(a, b)')
    })

    it('Math.max → Math.min', () => {
      expectMutation('Math.max → Math.min', 'Math.max(a, b)', 'Math.min(a, b)')
    })

    it('Math.abs → (removed)', () => {
      expectMutation('Math.abs → (removed)', 'Math.abs(x)', '(x)')
    })

    it('Math.round → Math.floor', () => {
      expectMutation('Math.round → Math.floor', 'Math.round(x)', 'Math.floor(x)')
    })

    it('Math.sqrt → Math.cbrt', () => {
      expectMutation('Math.sqrt → Math.cbrt', 'Math.sqrt(x)', 'Math.cbrt(x)')
    })
  })

  describe('Array method swaps', () => {
    it('some → every', () => {
      expectMutation('some → every', 'arr.some(fn)', 'arr.every(fn)')
    })

    it('every → some', () => {
      expectMutation('every → some', 'arr.every(fn)', 'arr.some(fn)')
    })

    it('map → filter', () => {
      expectMutation('map → filter', 'arr.map(fn)', 'arr.filter(fn)')
    })

    it('Array.isArray → !Array.isArray', () => {
      expectMutation('Array.isArray → !Array.isArray', 'Array.isArray(x)', '!Array.isArray(x)')
    })

    it('push → pop', () => {
      expectMutation('push → pop', 'arr.push(x)', 'arr.pop(x)')
    })

    it('shift → pop', () => {
      expectMutation('shift → pop', 'arr.shift()', 'arr.pop()')
    })

    it('unshift → push', () => {
      expectMutation('unshift → push', 'arr.unshift(x)', 'arr.push(x)')
    })

    it('find → findIndex', () => {
      expectMutation('find → findIndex', 'arr.find(fn)', 'arr.findIndex(fn)')
    })

    it('findIndex → find', () => {
      expectMutation('findIndex → find', 'arr.findIndex(fn)', 'arr.find(fn)')
    })

    it('reverse() → (removed)', () => {
      expectMutation('reverse() → (removed)', 'arr.reverse()', 'arr')
    })

    it('splice → slice', () => {
      expectMutation('splice → slice', 'arr.splice(0, 1)', 'arr.slice(0, 1)')
    })
  })

  describe('Object method swaps', () => {
    it('Object.keys → Object.values', () => {
      expectMutation('Object.keys → Object.values', 'Object.keys(obj)', 'Object.values(obj)')
    })

    it('Object.keys → Object.values blocked by guard on .length', () => {
      expectNoMutation('Object.keys → Object.values', 'Object.keys(obj).length')
    })

    it('Object.values → Object.keys', () => {
      expectMutation('Object.values → Object.keys', 'Object.values(obj)', 'Object.keys(obj)')
    })

    it('Object.values → Object.keys blocked by guard on .length', () => {
      expectNoMutation('Object.values → Object.keys', 'Object.values(obj).length')
    })

    it('Object.entries → Object.keys', () => {
      expectMutation('Object.entries → Object.keys', 'Object.entries(obj)', 'Object.keys(obj)')
    })
  })

  describe('String method mutations', () => {
    it('replace → toString (removed)', () => {
      expectMutation("replace → toString (removed)", "s.replace('a', 'b')", "s.toString('a', 'b')")
    })
  })

  describe('Unary minus removal', () => {
    it('unary -x → x', () => {
      expectMutation('unary -x → x', 'const y = -x', 'const y = x')
    })

    it('return -x → x', () => {
      expectMutation('return -x → x', 'return -value', 'return value')
    })
  })

  describe('Bitwise operator swaps', () => {
    it('& → |', () => {
      expectMutation('& → |', 'const x = a & b', 'const x = a | b')
    })

    it('& → | blocked by guard on &&', () => {
      expectNoMutation('& → |', 'if (a && b) {}')
    })

    it('| → &', () => {
      expectMutation('| → &', 'const x = a | b', 'const x = a & b')
    })

    it('| → & blocked by guard on ||', () => {
      expectNoMutation('| → &', 'if (a || b) {}')
    })

    it('^ → &', () => {
      expectMutation('^ → &', 'const x = a ^ b', 'const x = a & b')
    })

    it('<< → >>', () => {
      expectMutation('<< → >>', 'const x = a << b', 'const x = a >> b')
    })

    it('>> → <<', () => {
      expectMutation('>> → <<', 'const x = a >> b', 'const x = a << b')
    })

    it('>> → << blocked by guard on >>>', () => {
      expectNoMutation('>> → <<', 'const x = a >>> b')
    })
  })

  describe('Type conversion swaps', () => {
    it('parseInt → parseFloat', () => {
      expectMutation('parseInt → parseFloat', "parseInt('42')", "parseFloat('42')")
    })

    it('parseFloat → parseInt', () => {
      expectMutation('parseFloat → parseInt', "parseFloat('3.14')", "parseInt('3.14')")
    })
  })

  describe('Spread removal', () => {
    it('[...x] → x (remove copy)', () => {
      expectMutation('[...x] → x (remove copy)', 'const y = [...arr]', 'const y = arr')
    })

    it('[...x, y] → [y] (remove spread)', () => {
      expectMutation('[...x, y] → [y] (remove spread)', 'const y = [...arr, z]', 'const y = [z]')
    })
  })

  describe('Void operator removal', () => {
    it('void expr → expr', () => {
      expectMutation('void expr → expr', 'return void callback()', 'return callback()')
    })
  })

  describe('Property access mutations', () => {
    it('.length → .length + 1', () => {
      expectMutation('.length → .length + 1', 'const n = arr.length', 'const n = arr.length + 1')
    })

    it('.length → .length + 1 blocked by guard in string', () => {
      expectNoMutation('.length → .length + 1', "const n = 'arr.length'")
    })
  })
})

import { describe, it, expect } from 'vitest'
import { preparePatterns, generateMutations } from '../../src/core/engine.js'
import { javascript } from '../../src/core/patterns.js'

function findPattern(name) {
  const p = javascript.find(p => p.name === name)
  if (!p) throw new Error(`Pattern not found: ${name}`)
  return p
}

function mutate(patternName, source) {
  const prepared = preparePatterns([findPattern(patternName)])
  return generateMutations(source, prepared)
}

function testMutation(patternName, source, expectedMutated) {
  it(patternName, () => {
    const mutations = mutate(patternName, source)
    expect(mutations, `expected 1 mutation for "${patternName}" on: ${source}`).toHaveLength(1)
    expect(mutations[0].mutated).toBe(expectedMutated)
  })
}

function testNoMutation(patternName, source, reason) {
  it(`${patternName} ${reason}`, () => {
    const mutations = mutate(patternName, source)
    expect(mutations, `expected 0 mutations for "${patternName}" on: ${source}`).toHaveLength(0)
  })
}

describe('javascript mutation patterns', () => {
  describe('EqualityOperator', () => {
    testMutation('=== → !==', 'if (a === b) {}', 'if (a !== b) {}')
    testMutation('!== → ===', 'if (a !== b) {}', 'if (a === b) {}')
    testMutation('>= → <', 'if (a >= b) {}', 'if (a < b) {}')
    testMutation('<= → >', 'if (a <= b) {}', 'if (a > b) {}')
    testMutation('> → <', 'if (a > b) {}', 'if (a < b) {}')
    testNoMutation('> → <', 'if (a >= b) {}', 'blocked by nearGuard when = adjacent')
    testMutation('< → >', 'if (a < b) {}', 'if (a > b) {}')
    testNoMutation('< → >', 'if (a <= b) {}', 'blocked by nearGuard when = adjacent')
  })

  describe('LogicalOperator', () => {
    testMutation('&& → ||', 'if (a && b) {}', 'if (a || b) {}')
    testMutation('|| → &&', 'if (a || b) {}', 'if (a && b) {}')
  })

  describe('ArithmeticOperator', () => {
    testMutation('+ → -', 'const x = a + b', 'const x = a - b')
    testNoMutation('+ → -', "const x = 'a' + 'b'", 'blocked by nearGuard near quotes')
    testMutation('- → +', 'const x = a - b', 'const x = a + b')
    testNoMutation('- → +', "const x = 'a' - 'b'", 'blocked by nearGuard near quotes')
    testMutation('* → /', 'const x = a * b', 'const x = a / b')
    testNoMutation('* → /', "const x = 'a' * 2", 'blocked by nearGuard near quotes')
    testMutation('/ → *', 'const x = a / b', 'const x = a * b')
    testNoMutation('/ → *', "const x = 'a' / 2", 'blocked by nearGuard near quotes')
    testMutation('% → +', 'const x = a % b', 'const x = a + b')
    testMutation('** → *', 'const x = a ** b', 'const x = a * b')
  })

  describe('BooleanLiteral', () => {
    testMutation('false → true', 'const x = false', 'const x = true')
    testMutation('true → false', 'const x = true', 'const x = false')
    testNoMutation('true → false', "const x = 'true'", 'skips strings')
  })

  describe('ConditionalExpression', () => {
    testMutation('ternary → always truthy', 'const x = a ? b : c', 'const x = a ? true || b : c')
    testMutation('ternary → always falsy', 'const x = a ? b : c', 'const x = a ? false && b : c')
  })

  describe('MethodExpression', () => {
    testMutation('toLowerCase → toUpperCase', 'const x = s.toLowerCase()', 'const x = s.toUpperCase()')
    testMutation('toUpperCase → toLowerCase', 'const x = s.toUpperCase()', 'const x = s.toLowerCase()')
    testMutation('trim() → (removed)', 'const x = s.trim()', 'const x = s')
    testMutation('slice() → slice(1,', 'const x = arr.slice(0)', 'const x = arr.slice(1,0)')
    testMutation(
      'filter(predicate) → filter(true) (ignore predicate)',
      'const x = arr.filter(fn)',
      'const x = arr.filter(x => true, fn)'
    )
  })

  describe('StringLiteral', () => {
    testMutation("return '' → return 'mutant'", "return ''", "return 'mutant'")
    testMutation('return "" → return "mutant"', 'return ""', 'return "mutant"')
  })

  describe('BlockStatement', () => {
    // Intentionally produces broken syntax (no closing paren) — name says "syntax break"
    testMutation(
      'return {} → Object.freeze (syntax break)',
      'return { a: 1 }',
      'return Object.freeze({ a: 1 }'
    )
    testMutation('return → void', '  return x', 'void x')
    testNoMutation('return → void', '  return {}', 'guard blocks return {}')
    testNoMutation('return → void', '  return []', 'guard blocks return []')
  })

  describe('Async', () => {
    testMutation('await → (removed)', 'const x = await fetch(url)', 'const x = fetch(url)')
  })

  describe('Remove || fallback', () => {
    testMutation('|| [] → (removed)', 'const x = val || []', 'const x = val')
    testMutation("|| '' → (removed)", "const x = val || ''", 'const x = val')
    testMutation('|| 0 → (removed)', 'const x = val || 0', 'const x = val')
  })

  describe('UpdateOperator', () => {
    testMutation('++ → --', 'i++', 'i--')
    testMutation('-- → ++', 'i--', 'i++')
    testNoMutation('-- → ++', "x = '--'", 'blocked by nearGuard near quotes')
  })

  describe('Optional chaining removal', () => {
    testMutation('?. → .', 'const x = obj?.prop', 'const x = obj.prop')
  })

  describe('Negation removal', () => {
    testMutation('!var → var', 'if (!ready) {}', 'if (ready) {}')
    testNoMutation('!var → var', 'if (a !== b) {}', 'blocked by guard on !==')
  })

  describe('Nullish coalescing', () => {
    testMutation('?? → ||', 'const x = a ?? b', 'const x = a || b')
  })

  describe('Assignment mutations', () => {
    testMutation('+= → -=', 'x += 1', 'x -= 1')
    testMutation('-= → +=', 'x -= 1', 'x += 1')
  })

  describe('Numeric boundary', () => {
    testMutation('0 → 1', 'const x = 0', 'const x = 1')
    testNoMutation('0 → 1', 'const x = 0xFF', 'blocked by guard on hex literal')
    testNoMutation('0 → 1', 'const x = 0.5', 'blocked by guard on decimal')
    testMutation('1 → 0', 'const x = 1', 'const x = 0')
    // The lookbehind (?<![.\d]) prevents matching after . or digit
    testNoMutation('1 → 0', 'const x = 3.14', 'not triggered inside decimal')
    testMutation('-1 → 0', 'const x = -1', 'const x = 0')
    testNoMutation('-1 → 0', "const x = '-1'", 'blocked by guard in string context')
  })

  describe('Throw removal', () => {
    testMutation('throw → return', '  throw new Error()', 'return new Error()')
  })

  describe('String method swaps', () => {
    testMutation('includes → indexOf', "s.includes('x')", "s.indexOf('x')")
    testMutation('startsWith → endsWith', "s.startsWith('x')", "s.endsWith('x')")
    testMutation('endsWith → startsWith', "s.endsWith('x')", "s.startsWith('x')")
  })

  describe('Math method swaps', () => {
    testMutation('Math.floor → Math.ceil', 'Math.floor(x)', 'Math.ceil(x)')
    testMutation('Math.ceil → Math.floor', 'Math.ceil(x)', 'Math.floor(x)')
    testMutation('Math.min → Math.max', 'Math.min(a, b)', 'Math.max(a, b)')
    testMutation('Math.max → Math.min', 'Math.max(a, b)', 'Math.min(a, b)')
    testMutation('Math.abs → (removed)', 'Math.abs(x)', '(x)')
    testMutation('Math.round → Math.floor', 'Math.round(x)', 'Math.floor(x)')
    testMutation('Math.sqrt → Math.cbrt', 'Math.sqrt(x)', 'Math.cbrt(x)')
  })

  describe('Array method swaps', () => {
    testMutation('some → every', 'arr.some(fn)', 'arr.every(fn)')
    testMutation('every → some', 'arr.every(fn)', 'arr.some(fn)')
    testMutation('map → filter', 'arr.map(fn)', 'arr.filter(fn)')
    testMutation('Array.isArray → !Array.isArray', 'Array.isArray(x)', '!Array.isArray(x)')
    testMutation('push → pop', 'arr.push(x)', 'arr.pop(x)')
    testMutation('shift → pop', 'arr.shift()', 'arr.pop()')
    testMutation('unshift → push', 'arr.unshift(x)', 'arr.push(x)')
    testMutation('find → findIndex', 'arr.find(fn)', 'arr.findIndex(fn)')
    testMutation('findIndex → find', 'arr.findIndex(fn)', 'arr.find(fn)')
    testMutation('reverse() → (removed)', 'arr.reverse()', 'arr')
    testMutation('splice → slice', 'arr.splice(0, 1)', 'arr.slice(0, 1)')
  })

  describe('Object method swaps', () => {
    testMutation('Object.keys → Object.values', 'Object.keys(obj)', 'Object.values(obj)')
    testNoMutation('Object.keys → Object.values', 'Object.keys(obj).length', 'blocked by guard on .length')
    testMutation('Object.values → Object.keys', 'Object.values(obj)', 'Object.keys(obj)')
    testNoMutation('Object.values → Object.keys', 'Object.values(obj).length', 'blocked by guard on .length')
    testMutation('Object.entries → Object.keys', 'Object.entries(obj)', 'Object.keys(obj)')
  })

  describe('String method mutations', () => {
    testMutation("replace → toString (removed)", "s.replace('a', 'b')", "s.toString('a', 'b')")
  })

  describe('Unary minus removal', () => {
    testMutation('unary -x → x', 'const y = -x', 'const y = x')
    testMutation('return -x → x', 'return -value', 'return value')
  })

  describe('Bitwise operator swaps', () => {
    testMutation('& → |', 'const x = a & b', 'const x = a | b')
    testNoMutation('& → |', 'if (a && b) {}', 'blocked by guard on &&')
    testMutation('| → &', 'const x = a | b', 'const x = a & b')
    testNoMutation('| → &', 'if (a || b) {}', 'blocked by guard on ||')
    testMutation('^ → &', 'const x = a ^ b', 'const x = a & b')
    testMutation('<< → >>', 'const x = a << b', 'const x = a >> b')
    testMutation('>> → <<', 'const x = a >> b', 'const x = a << b')
    testNoMutation('>> → <<', 'const x = a >>> b', 'blocked by guard on >>>')
  })

  describe('Type conversion swaps', () => {
    testMutation('parseInt → parseFloat', "parseInt('42')", "parseFloat('42')")
    testMutation('parseFloat → parseInt', "parseFloat('3.14')", "parseInt('3.14')")
  })

  describe('Spread removal', () => {
    testMutation('[...x] → x (remove copy)', 'const y = [...arr]', 'const y = arr')
    testMutation('[...x, y] → [y] (remove spread)', 'const y = [...arr, z]', 'const y = [z]')
  })

  describe('Void operator removal', () => {
    testMutation('void expr → expr', 'return void callback()', 'return callback()')
  })

  describe('Property access mutations', () => {
    testMutation('.length → .length + 1', 'const n = arr.length', 'const n = arr.length + 1')
    testNoMutation('.length → .length + 1', "const n = 'arr.length'", 'blocked by guard in string')
  })
})

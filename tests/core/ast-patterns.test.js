import { describe, it, expect } from 'vitest'
import { generateMutations } from '../../core/ast-engine.js'

/**
 * AST mutator definitions — one per pattern category.
 * These mirror the regex patterns in core/patterns.js but use AST node types.
 * When the real AST mutators land (mu-wi6h), they replace these inline definitions.
 */

// --- EqualityOperator ---
const equalityMutator = {
  type: 'BinaryExpression',
  mutate(node) {
    const swaps = { '===': '!==', '!==': '===', '>=': '<', '<=': '>', '>': '<', '<': '>' }
    const names = {
      '===': '=== → !==', '!==': '!== → ===',
      '>=': '>= → <', '<=': '<= → >',
      '>': '> → <', '<': '< → >'
    }
    if (!swaps[node.operator]) return []
    return [{ operator: swaps[node.operator], name: names[node.operator] }]
  }
}

// --- LogicalOperator ---
const logicalMutator = {
  type: 'LogicalExpression',
  mutate(node) {
    const swaps = { '&&': '||', '||': '&&' }
    const names = { '&&': '&& → ||', '||': '|| → &&' }
    if (!swaps[node.operator]) return []
    return [{ operator: swaps[node.operator], name: names[node.operator] }]
  }
}

// --- ArithmeticOperator ---
const arithmeticMutator = {
  type: 'BinaryExpression',
  mutate(node) {
    const swaps = { '+': '-', '-': '+', '*': '/', '/': '*', '%': '+', '**': '*' }
    const names = {
      '+': '+ → -', '-': '- → +', '*': '* → /', '/': '/ → *',
      '%': '% → +', '**': '** → *'
    }
    if (!swaps[node.operator]) return []
    return [{ operator: swaps[node.operator], name: names[node.operator] }]
  }
}

// --- BooleanLiteral ---
const booleanMutator = {
  type: 'BooleanLiteral',
  mutate(node) {
    if (node.value === true) {
      return [{ start: node.start, end: node.end, replacement: 'false', name: 'true → false' }]
    }
    return [{ start: node.start, end: node.end, replacement: 'true', name: 'false → true' }]
  }
}

// --- ConditionalExpression ---
const ternaryTruthyMutator = {
  type: 'ConditionalExpression',
  mutate(node) {
    return [{ start: node.consequent.start, end: node.consequent.start, replacement: 'true || ', name: 'ternary → always truthy' }]
  }
}

const ternaryFalsyMutator = {
  type: 'ConditionalExpression',
  mutate(node) {
    return [{ start: node.consequent.start, end: node.consequent.start, replacement: 'false && ', name: 'ternary → always falsy' }]
  }
}

// --- MethodExpression (CallExpression with MemberExpression callee) ---
const methodSwapMutator = {
  type: 'CallExpression',
  mutate(node) {
    if (node.callee.type !== 'MemberExpression') return []
    const prop = node.callee.property
    const name = prop.name || prop.value
    const swaps = {
      toLowerCase: { to: 'toUpperCase', name: 'toLowerCase → toUpperCase' },
      toUpperCase: { to: 'toLowerCase', name: 'toUpperCase → toLowerCase' },
      trim: { to: '', removeProp: true, name: 'trim() → (removed)' },
      includes: { to: 'indexOf', name: 'includes → indexOf' },
      startsWith: { to: 'endsWith', name: 'startsWith → endsWith' },
      endsWith: { to: 'startsWith', name: 'endsWith → startsWith' },
      some: { to: 'every', name: 'some → every' },
      every: { to: 'some', name: 'every → some' },
      map: { to: 'filter', name: 'map → filter' },
      push: { to: 'pop', name: 'push → pop' },
      unshift: { to: 'push', name: 'unshift → push' },
      find: { to: 'findIndex', name: 'find → findIndex' },
      findIndex: { to: 'find', name: 'findIndex → find' },
      splice: { to: 'slice', name: 'splice → slice' },
      replace: { to: 'toString', name: 'replace → toString (removed)' }
    }
    const swap = swaps[name]
    if (!swap) return []
    if (swap.removeProp) {
      // Remove .trim() — from dot to closing paren
      return [{ start: node.callee.object.end, end: node.end, replacement: '', name: swap.name }]
    }
    return [{ start: prop.start, end: prop.end, replacement: swap.to, name: swap.name }]
  }
}

// --- Shift and reverse need special handling ---
const shiftMutator = {
  type: 'CallExpression',
  mutate(node) {
    if (node.callee.type !== 'MemberExpression') return []
    const prop = node.callee.property
    if (prop.name === 'shift') {
      return [{ start: prop.start, end: prop.end, replacement: 'pop', name: 'shift → pop' }]
    }
    if (prop.name === 'reverse') {
      // Remove .reverse() entirely
      return [{ start: node.callee.object.end, end: node.end, replacement: '', name: 'reverse() → (removed)' }]
    }
    return []
  }
}

// --- UpdateOperator ---
const updateMutator = {
  type: 'UpdateExpression',
  mutate(node) {
    const swaps = { '++': '--', '--': '++' }
    const names = { '++': '++ → --', '--': '-- → ++' }
    if (!swaps[node.operator]) return []
    const arg = node.argument.name
    const replacement = node.prefix
      ? swaps[node.operator] + arg
      : arg + swaps[node.operator]
    return [{ start: node.start, end: node.end, replacement, name: names[node.operator] }]
  }
}

// --- Async (AwaitExpression) ---
const awaitMutator = {
  type: 'AwaitExpression',
  mutate(node) {
    // Remove "await " prefix, keep the argument
    return [{ start: node.start, end: node.argument.start, replacement: '', name: 'await → (removed)' }]
  }
}

// --- Optional chaining ---
const optionalChainingMutator = {
  type: 'OptionalMemberExpression',
  mutate(node) {
    if (!node.optional) return []
    // Replace ?. with . — the ? is between object end and property start
    const dotStart = node.object.end
    // In ?., the ? is at object.end and . is at object.end+1
    return [{ start: dotStart, end: dotStart + 2, replacement: '.', name: '?. → .' }]
  }
}

// --- Negation removal ---
const negationMutator = {
  type: 'UnaryExpression',
  mutate(node) {
    if (node.operator === '!' && node.prefix) {
      return [{ start: node.start, end: node.start + 1, replacement: '', name: '!var → var' }]
    }
    return []
  }
}

// --- Nullish coalescing ---
const nullishMutator = {
  type: 'LogicalExpression',
  mutate(node) {
    if (node.operator === '??') {
      return [{ operator: '||', name: '?? → ||' }]
    }
    return []
  }
}

// --- Assignment mutations ---
const assignmentMutator = {
  type: 'AssignmentExpression',
  mutate(node) {
    const swaps = { '+=': '-=', '-=': '+=' }
    const names = { '+=': '+= → -=', '-=': '-= → +=' }
    if (!swaps[node.operator]) return []
    return [{ operator: swaps[node.operator], name: names[node.operator] }]
  }
}

// --- Numeric boundary ---
const numericMutator = {
  type: 'NumericLiteral',
  mutate(node) {
    if (node.value === 0) {
      return [{ start: node.start, end: node.end, replacement: '1', name: '0 → 1' }]
    }
    if (node.value === 1) {
      return [{ start: node.start, end: node.end, replacement: '0', name: '1 → 0' }]
    }
    return []
  }
}

// --- Unary minus for -1 ---
const unaryMinusMutator = {
  type: 'UnaryExpression',
  mutate(node) {
    if (node.operator === '-' && node.prefix) {
      if (node.argument.type === 'NumericLiteral' && node.argument.value === 1) {
        return [{ start: node.start, end: node.end, replacement: '0', name: '-1 → 0' }]
      }
      if (node.argument.type === 'Identifier') {
        return [{ start: node.start, end: node.start + 1, replacement: '', name: 'unary -x → x' }]
      }
    }
    return []
  }
}

// --- Throw removal ---
const throwMutator = {
  type: 'ThrowStatement',
  mutate(node, source) {
    // Replace "throw" with "return"
    const throwEnd = node.start + 5 // "throw".length
    return [{ start: node.start, end: throwEnd, replacement: 'return', name: 'throw → return' }]
  }
}

// --- Math method swaps ---
const mathMutator = {
  type: 'CallExpression',
  mutate(node) {
    if (node.callee.type !== 'MemberExpression') return []
    if (node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'Math') return []
    const prop = node.callee.property
    const swaps = {
      floor: { to: 'ceil', name: 'Math.floor → Math.ceil' },
      ceil: { to: 'floor', name: 'Math.ceil → Math.floor' },
      min: { to: 'max', name: 'Math.min → Math.max' },
      max: { to: 'min', name: 'Math.max → Math.min' },
      abs: { to: null, removeObj: true, name: 'Math.abs → (removed)' },
      round: { to: 'floor', name: 'Math.round → Math.floor' },
      sqrt: { to: 'cbrt', name: 'Math.sqrt → Math.cbrt' }
    }
    const swap = swaps[prop.name]
    if (!swap) return []
    if (swap.removeObj) {
      // Remove "Math.abs" keeping just the parens+arg: Math.abs(x) → (x)
      return [{ start: node.callee.object.start, end: prop.end, replacement: '', name: swap.name }]
    }
    return [{ start: prop.start, end: prop.end, replacement: swap.to, name: swap.name }]
  }
}

// --- Object method swaps ---
const objectMethodMutator = {
  type: 'CallExpression',
  mutate(node) {
    if (node.callee.type !== 'MemberExpression') return []
    if (node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'Object') return []
    const prop = node.callee.property
    const swaps = {
      keys: { to: 'values', name: 'Object.keys → Object.values' },
      values: { to: 'keys', name: 'Object.values → Object.keys' },
      entries: { to: 'keys', name: 'Object.entries → Object.keys' }
    }
    const swap = swaps[prop.name]
    if (!swap) return []
    return [{ start: prop.start, end: prop.end, replacement: swap.to, name: swap.name }]
  }
}

// --- Array.isArray negation ---
const arrayIsArrayMutator = {
  type: 'CallExpression',
  mutate(node, source) {
    if (node.callee.type !== 'MemberExpression') return []
    if (node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'Array') return []
    if (node.callee.property.name !== 'isArray') return []
    return [{ start: node.start, end: node.start, replacement: '!', name: 'Array.isArray → !Array.isArray' }]
  }
}

// --- Type conversion swaps ---
const typeConversionMutator = {
  type: 'CallExpression',
  mutate(node) {
    if (node.callee.type !== 'Identifier') return []
    const swaps = {
      parseInt: { to: 'parseFloat', name: 'parseInt → parseFloat' },
      parseFloat: { to: 'parseInt', name: 'parseFloat → parseInt' }
    }
    const swap = swaps[node.callee.name]
    if (!swap) return []
    return [{ start: node.callee.start, end: node.callee.end, replacement: swap.to, name: swap.name }]
  }
}

// --- Bitwise operator swaps ---
const bitwiseMutator = {
  type: 'BinaryExpression',
  mutate(node) {
    const swaps = { '&': '|', '|': '&', '^': '&', '<<': '>>', '>>': '<<' }
    const names = {
      '&': '& → |', '|': '| → &', '^': '^ → &',
      '<<': '<< → >>', '>>': '>> → <<'
    }
    if (!swaps[node.operator]) return []
    return [{ operator: swaps[node.operator], name: names[node.operator] }]
  }
}

// --- Void operator removal ---
const voidMutator = {
  type: 'UnaryExpression',
  mutate(node) {
    if (node.operator === 'void' && node.prefix) {
      // Remove "void " prefix
      return [{ start: node.start, end: node.argument.start, replacement: '', name: 'void expr → expr' }]
    }
    return []
  }
}


// --- Test helpers ---
function mutate(mutators, source, targetLine) {
  const list = Array.isArray(mutators) ? mutators : [mutators]
  return generateMutations(source, list, targetLine)
}

function testMutation(mutators, source, expectedMutated, name) {
  const label = name || expectedMutated
  it(label, () => {
    const mutations = mutate(mutators, source)
    const match = mutations.find(m => m.mutated === expectedMutated)
    expect(match, `expected mutation producing "${expectedMutated}" from: ${source}\nGot: ${JSON.stringify(mutations.map(m => m.mutated))}`).toBeTruthy()
  })
}

function testNoMutation(mutators, source, reason) {
  it(reason, () => {
    const mutations = mutate(mutators, source)
    expect(mutations, `expected 0 mutations on: ${source}`).toHaveLength(0)
  })
}


describe('AST mutation patterns', () => {
  describe('EqualityOperator', () => {
    testMutation(equalityMutator, 'if (a === b) {}', 'if (a !== b) {}', '=== → !==')
    testMutation(equalityMutator, 'if (a !== b) {}', 'if (a === b) {}', '!== → ===')
    testMutation(equalityMutator, 'if (a >= b) {}', 'if (a < b) {}', '>= → <')
    testMutation(equalityMutator, 'if (a <= b) {}', 'if (a > b) {}', '<= → >')
    testMutation(equalityMutator, 'if (a > b) {}', 'if (a < b) {}', '> → <')
    testMutation(equalityMutator, 'if (a < b) {}', 'if (a > b) {}', '< → >')
  })

  describe('LogicalOperator', () => {
    testMutation(logicalMutator, 'if (a && b) {}', 'if (a || b) {}', '&& → ||')
    testMutation(logicalMutator, 'if (a || b) {}', 'if (a && b) {}', '|| → &&')
  })

  describe('ArithmeticOperator', () => {
    testMutation(arithmeticMutator, 'const x = a + b', 'const x = a - b', '+ → -')
    testMutation(arithmeticMutator, 'const x = a - b', 'const x = a + b', '- → +')
    testMutation(arithmeticMutator, 'const x = a * b', 'const x = a / b', '* → /')
    testMutation(arithmeticMutator, 'const x = a / b', 'const x = a * b', '/ → *')
    testMutation(arithmeticMutator, 'const x = a % b', 'const x = a + b', '% → +')
    testMutation(arithmeticMutator, 'const x = a ** b', 'const x = a * b', '** → *')
  })

  describe('BooleanLiteral', () => {
    testMutation(booleanMutator, 'const x = true', 'const x = false', 'true → false')
    testMutation(booleanMutator, 'const x = false', 'const x = true', 'false → true')

    it('AST naturally ignores booleans in strings (no string token context needed)', () => {
      // Unlike regex, AST only matches actual BooleanLiteral nodes, not string content
      const source = "const x = 'true'"
      const mutations = mutate(booleanMutator, source)
      expect(mutations).toHaveLength(0)
    })
  })

  describe('ConditionalExpression', () => {
    testMutation(ternaryTruthyMutator, 'const x = a ? b : c', 'const x = a ? true || b : c', 'ternary → always truthy')
    testMutation(ternaryFalsyMutator, 'const x = a ? b : c', 'const x = a ? false && b : c', 'ternary → always falsy')
  })

  describe('MethodExpression', () => {
    testMutation(methodSwapMutator, 'const x = s.toLowerCase()', 'const x = s.toUpperCase()', 'toLowerCase → toUpperCase')
    testMutation(methodSwapMutator, 'const x = s.toUpperCase()', 'const x = s.toLowerCase()', 'toUpperCase → toLowerCase')
    testMutation(methodSwapMutator, 'const x = s.trim()', 'const x = s', 'trim() → (removed)')
  })

  describe('StringMethodSwaps', () => {
    testMutation(methodSwapMutator, "s.includes('x')", "s.indexOf('x')", 'includes → indexOf')
    testMutation(methodSwapMutator, "s.startsWith('x')", "s.endsWith('x')", 'startsWith → endsWith')
    testMutation(methodSwapMutator, "s.endsWith('x')", "s.startsWith('x')", 'endsWith → startsWith')
  })

  describe('UpdateOperator', () => {
    testMutation(updateMutator, 'i++', 'i--', '++ → --')
    testMutation(updateMutator, 'i--', 'i++', '-- → ++')

    it('handles prefix update expressions', () => {
      const mutations = mutate(updateMutator, '++i')
      expect(mutations).toHaveLength(1)
      expect(mutations[0].mutated).toBe('--i')
    })
  })

  describe('Async', () => {
    testMutation(awaitMutator, 'const x = await fetch(url)', 'const x = fetch(url)', 'await → (removed)')
  })

  describe('Optional chaining', () => {
    testMutation(optionalChainingMutator, 'const x = obj?.prop', 'const x = obj.prop', '?. → .')
  })

  describe('Negation removal', () => {
    testMutation(negationMutator, 'if (!ready) {}', 'if (ready) {}', '!var → var')

    it('AST does not confuse !== with negation (separate node types)', () => {
      // AST knows !== is a BinaryExpression operator, not UnaryExpression
      const source = 'if (a !== b) {}'
      const mutations = mutate(negationMutator, source)
      expect(mutations).toHaveLength(0)
    })
  })

  describe('Nullish coalescing', () => {
    testMutation(nullishMutator, 'const x = a ?? b', 'const x = a || b', '?? → ||')
  })

  describe('Assignment mutations', () => {
    testMutation(assignmentMutator, 'x += 1', 'x -= 1', '+= → -=')
    testMutation(assignmentMutator, 'x -= 1', 'x += 1', '-= → +=')
  })

  describe('Numeric boundary', () => {
    testMutation(numericMutator, 'const x = 0', 'const x = 1', '0 → 1')
    testMutation(numericMutator, 'const x = 1', 'const x = 0', '1 → 0')

    it('AST naturally ignores numbers in strings', () => {
      const mutations = mutate(numericMutator, "const x = '0'")
      expect(mutations).toHaveLength(0)
    })

    it('does not mutate non-boundary numbers', () => {
      const mutations = mutate(numericMutator, 'const x = 42')
      expect(mutations).toHaveLength(0)
    })
  })

  describe('Unary minus / -1', () => {
    testMutation(unaryMinusMutator, 'const x = -1', 'const x = 0', '-1 → 0')
    testMutation(unaryMinusMutator, 'const y = -x', 'const y = x', 'unary -x → x')
  })

  describe('Throw removal', () => {
    testMutation(throwMutator, '  throw new Error()', 'return new Error()', 'throw → return')
  })

  describe('Math method swaps', () => {
    testMutation(mathMutator, 'Math.floor(x)', 'Math.ceil(x)', 'Math.floor → Math.ceil')
    testMutation(mathMutator, 'Math.ceil(x)', 'Math.floor(x)', 'Math.ceil → Math.floor')
    testMutation(mathMutator, 'Math.min(a, b)', 'Math.max(a, b)', 'Math.min → Math.max')
    testMutation(mathMutator, 'Math.max(a, b)', 'Math.min(a, b)', 'Math.max → Math.min')
    testMutation(mathMutator, 'Math.abs(x)', '(x)', 'Math.abs → (removed)')
    testMutation(mathMutator, 'Math.round(x)', 'Math.floor(x)', 'Math.round → Math.floor')
    testMutation(mathMutator, 'Math.sqrt(x)', 'Math.cbrt(x)', 'Math.sqrt → Math.cbrt')
  })

  describe('Array method swaps', () => {
    testMutation(methodSwapMutator, 'arr.some(fn)', 'arr.every(fn)', 'some → every')
    testMutation(methodSwapMutator, 'arr.every(fn)', 'arr.some(fn)', 'every → some')
    testMutation(methodSwapMutator, 'arr.map(fn)', 'arr.filter(fn)', 'map → filter')
    testMutation(arrayIsArrayMutator, 'Array.isArray(x)', '!Array.isArray(x)', 'Array.isArray → !Array.isArray')
    testMutation(methodSwapMutator, 'arr.push(x)', 'arr.pop(x)', 'push → pop')
    testMutation(shiftMutator, 'arr.shift()', 'arr.pop()', 'shift → pop')
    testMutation(methodSwapMutator, 'arr.unshift(x)', 'arr.push(x)', 'unshift → push')
    testMutation(methodSwapMutator, 'arr.find(fn)', 'arr.findIndex(fn)', 'find → findIndex')
    testMutation(methodSwapMutator, 'arr.findIndex(fn)', 'arr.find(fn)', 'findIndex → find')
    testMutation(shiftMutator, 'arr.reverse()', 'arr', 'reverse() → (removed)')
    testMutation(methodSwapMutator, 'arr.splice(0, 1)', 'arr.slice(0, 1)', 'splice → slice')
  })

  describe('Object method swaps', () => {
    testMutation(objectMethodMutator, 'Object.keys(obj)', 'Object.values(obj)', 'Object.keys → Object.values')
    testMutation(objectMethodMutator, 'Object.values(obj)', 'Object.keys(obj)', 'Object.values → Object.keys')
    testMutation(objectMethodMutator, 'Object.entries(obj)', 'Object.keys(obj)', 'Object.entries → Object.keys')
  })

  describe('String method mutations', () => {
    testMutation(methodSwapMutator, "s.replace('a', 'b')", "s.toString('a', 'b')", 'replace → toString (removed)')
  })

  describe('Bitwise operator swaps', () => {
    testMutation(bitwiseMutator, 'const x = a & b', 'const x = a | b', '& → |')
    testMutation(bitwiseMutator, 'const x = a | b', 'const x = a & b', '| → &')
    testMutation(bitwiseMutator, 'const x = a ^ b', 'const x = a & b', '^ → &')
    testMutation(bitwiseMutator, 'const x = a << b', 'const x = a >> b', '<< → >>')
    testMutation(bitwiseMutator, 'const x = a >> b', 'const x = a << b', '>> → <<')
  })

  describe('Type conversion swaps', () => {
    testMutation(typeConversionMutator, "parseInt('42')", "parseFloat('42')", 'parseInt → parseFloat')
    testMutation(typeConversionMutator, "parseFloat('3.14')", "parseInt('3.14')", 'parseFloat → parseInt')
  })

  describe('Void operator removal', () => {
    it('void expr → expr', () => {
      const source = 'function f() { return void callback() }'
      const mutations = mutate(voidMutator, source)
      expect(mutations).toHaveLength(1)
      expect(mutations[0].mutated).toBe('function f() { return callback() }')
    })
  })

  describe('AST advantages over regex', () => {
    it('correctly handles === inside comments without needing line-skip heuristics', () => {
      // AST parses comments as non-code — no BinaryExpression nodes inside comments
      const source = '// if (a === b) {}'
      const mutations = mutate(equalityMutator, source)
      expect(mutations).toHaveLength(0)
    })

    it('correctly handles operators inside string literals', () => {
      const source = "const s = 'a === b'"
      const mutations = mutate(equalityMutator, source)
      expect(mutations).toHaveLength(0)
    })

    it('handles nested expressions without false positives', () => {
      // AST knows the structure — no nearGuard needed for =>
      const source = 'const fn = x => x > 1'
      const mutations = mutate(equalityMutator, source)
      // Only the > comparison should match, not the => arrow
      expect(mutations).toHaveLength(1)
      expect(mutations[0].name).toBe('> → <')
    })

    it('handles TypeScript type annotations without false positives', () => {
      // Regex might match > in generic type parameters: Array<number>
      // AST knows these are type annotations, not comparison operators
      const source = 'const x: Array<number> = [1]'
      const mutations = mutate(equalityMutator, source)
      expect(mutations).toHaveLength(0)
    })

    it('handles JSX without confusing < and > with operators', () => {
      const source = 'const el = <div>text</div>'
      const mutations = mutate(equalityMutator, source)
      expect(mutations).toHaveLength(0)
    })
  })

  describe('output shape matches regex engine', () => {
    it('produces {line, original, mutated, name, source} for operator mutations', () => {
      const source = 'if (a === b) {}'
      const mutations = mutate(equalityMutator, source)
      expect(mutations).toHaveLength(1)
      const m = mutations[0]
      expect(m).toHaveProperty('line', 1)
      expect(m).toHaveProperty('original', 'if (a === b) {}')
      expect(m).toHaveProperty('mutated', 'if (a !== b) {}')
      expect(m).toHaveProperty('name', '=== → !==')
      expect(m).toHaveProperty('source', 'if (a !== b) {}')
    })

    it('produces {line, original, mutated, name, source} for range mutations', () => {
      const source = 'const x = true'
      const mutations = mutate(booleanMutator, source)
      expect(mutations).toHaveLength(1)
      const m = mutations[0]
      expect(m).toHaveProperty('line', 1)
      expect(m).toHaveProperty('original', 'const x = true')
      expect(m).toHaveProperty('mutated', 'const x = false')
      expect(m).toHaveProperty('name', 'true → false')
      expect(m).toHaveProperty('source', 'const x = false')
    })

    it('produces correct full source in multiline files', () => {
      const source = 'const x = 1\nif (a === b) {}\nconst y = 2'
      const mutations = mutate(equalityMutator, source)
      expect(mutations).toHaveLength(1)
      expect(mutations[0].source).toBe('const x = 1\nif (a !== b) {}\nconst y = 2')
    })

    it('trims whitespace from original and mutated fields', () => {
      const source = '  if (a === b) {}'
      const mutations = mutate(equalityMutator, source)
      expect(mutations[0].original).toBe('if (a === b) {}')
      expect(mutations[0].mutated).toBe('if (a !== b) {}')
    })
  })

  describe('multiple mutators compose correctly', () => {
    it('finds all mutation types in a complex expression', () => {
      const source = 'if (a === true && b !== false) {}'
      const mutations = mutate([equalityMutator, logicalMutator, booleanMutator], source)
      const names = mutations.map(m => m.name)
      expect(names).toContain('=== → !==')
      expect(names).toContain('!== → ===')
      expect(names).toContain('&& → ||')
      expect(names).toContain('true → false')
      expect(names).toContain('false → true')
    })

    it('targetLine filters across all mutator types', () => {
      const source = 'if (a === b) {}\nconst x = true && false'
      const mutations = mutate([equalityMutator, logicalMutator, booleanMutator], source, 2)
      // Only mutations on line 2
      for (const m of mutations) {
        expect(m.line).toBe(2)
      }
      expect(mutations.length).toBeGreaterThan(0)
    })
  })
})

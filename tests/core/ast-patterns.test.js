import { describe, it, expect } from 'vitest'
import { generateMutations } from '../../src/core/ast-engine.js'

/**
 * AST mutator definitions — one per pattern category.
 * These mirror the regex patterns in core/patterns.js but use AST node types.
 * When the real AST mutators land (mu-wi6h), they replace these inline definitions.
 */

function findBetween(source, from, to, text) {
  const idx = source.indexOf(text, from)
  return idx !== -1 && idx + text.length <= to ? idx : -1
}

// --- EqualityOperator ---
const equalitySwaps = { '===': '!==', '!==': '===', '>=': '<', '<=': '>', '>': '<', '<': '>' }
const equalityNames = {
  '===': '=== → !==', '!==': '!== → ===',
  '>=': '>= → <', '<=': '<= → >',
  '>': '> → <', '<': '< → >'
}

const equalityMutator = {
  types: ['BinaryExpression'],
  test: node => Boolean(equalitySwaps[node.operator]),
  mutate: (node, source) => {
    const op = node.operator
    const idx = findBetween(source, node.left.end, node.right.start, op)
    if (idx === -1) return null
    return { start: idx, end: idx + op.length, replacement: equalitySwaps[op], name: equalityNames[op] }
  }
}

// --- LogicalOperator ---
const logicalSwaps = { '&&': '||', '||': '&&' }
const logicalNames = { '&&': '&& → ||', '||': '|| → &&' }

const logicalMutator = {
  types: ['LogicalExpression'],
  test: node => Boolean(logicalSwaps[node.operator]),
  mutate: (node, source) => {
    const op = node.operator
    const idx = findBetween(source, node.left.end, node.right.start, op)
    if (idx === -1) return null
    return { start: idx, end: idx + op.length, replacement: logicalSwaps[op], name: logicalNames[op] }
  }
}

// --- ArithmeticOperator ---
const arithmeticSwaps = { '+': '-', '-': '+', '*': '/', '/': '*', '%': '+', '**': '*' }
const arithmeticNames = {
  '+': '+ → -', '-': '- → +', '*': '* → /', '/': '/ → *',
  '%': '% → +', '**': '** → *'
}

const arithmeticMutator = {
  types: ['BinaryExpression'],
  test: node => Boolean(arithmeticSwaps[node.operator]),
  mutate: (node, source) => {
    const op = node.operator
    const idx = findBetween(source, node.left.end, node.right.start, op)
    if (idx === -1) return null
    return { start: idx, end: idx + op.length, replacement: arithmeticSwaps[op], name: arithmeticNames[op] }
  }
}

// --- BooleanLiteral ---
const booleanMutator = {
  types: ['BooleanLiteral'],
  test: () => true,
  mutate: node => {
    const [replacement, name] = node.value ? ['false', 'true → false'] : ['true', 'false → true']
    return {
      start: node.start,
      end: node.end,
      replacement,
      name
    }
  }
}

// --- ConditionalExpression ---
const ternaryTruthyMutator = {
  name: 'ternary → always truthy',
  types: ['ConditionalExpression'],
  test: () => true,
  mutate: node => ({ start: node.consequent.start, end: node.consequent.start, replacement: 'true || ' })
}

const ternaryFalsyMutator = {
  name: 'ternary → always falsy',
  types: ['ConditionalExpression'],
  test: () => true,
  mutate: node => ({ start: node.consequent.start, end: node.consequent.start, replacement: 'false && ' })
}

// --- MethodExpression (CallExpression with MemberExpression callee) ---
const methodSwaps = {
  toLowerCase: { to: 'toUpperCase', name: 'toLowerCase → toUpperCase' },
  toUpperCase: { to: 'toLowerCase', name: 'toUpperCase → toLowerCase' },
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

const methodSwapMutator = {
  types: ['CallExpression'],
  test: node => {
    if (node.callee.type !== 'MemberExpression') return false
    const name = node.callee.property.name || node.callee.property.value
    return Boolean(methodSwaps[name])
  },
  mutate: node => {
    const prop = node.callee.property
    const name = prop.name || prop.value
    const swap = methodSwaps[name]
    return { start: prop.start, end: prop.end, replacement: swap.to, name: swap.name }
  }
}

const trimMutator = {
  name: 'trim() → (removed)',
  types: ['CallExpression'],
  test: node => node.callee.type === 'MemberExpression' && node.callee.property.name === 'trim',
  mutate: node => ({ start: node.callee.object.end, end: node.end, replacement: '' })
}

// --- Shift and reverse need special handling ---
const shiftMutator = {
  types: ['CallExpression'],
  test: node => {
    if (node.callee.type !== 'MemberExpression') return false
    const name = node.callee.property.name
    return name === 'shift' || name === 'reverse'
  },
  mutate: node => {
    const prop = node.callee.property
    if (prop.name === 'shift')
      return { start: prop.start, end: prop.end, replacement: 'pop', name: 'shift → pop' }
    return { start: node.callee.object.end, end: node.end, replacement: '', name: 'reverse() → (removed)' }
  }
}

// --- UpdateOperator ---
const updateSwaps = { '++': '--', '--': '++' }
const updateNames = { '++': '++ → --', '--': '-- → ++' }

const updateMutator = {
  types: ['UpdateExpression'],
  test: node => Boolean(updateSwaps[node.operator]),
  mutate: node => {
    const op = node.prefix ? node.start : node.argument.end
    return { start: op, end: op + 2, replacement: updateSwaps[node.operator], name: updateNames[node.operator] }
  }
}

// --- Async (AwaitExpression) ---
const awaitMutator = {
  name: 'await → (removed)',
  types: ['AwaitExpression'],
  test: () => true,
  mutate: node => ({ start: node.start, end: node.argument.start, replacement: '' })
}

// --- Optional chaining ---
const optionalChainingMutator = {
  name: '?. → .',
  types: ['OptionalMemberExpression'],
  test: node => node.optional,
  mutate: (node, source) => {
    const idx = source.indexOf('?.', node.object.end)
    if (idx === -1) return null
    return { start: idx, end: idx + 2, replacement: '.' }
  }
}

// --- Negation removal ---
const negationMutator = {
  name: '!var → var',
  types: ['UnaryExpression'],
  test: node => node.operator === '!' && node.prefix,
  mutate: node => ({ start: node.start, end: node.argument.start, replacement: '' })
}

// --- Nullish coalescing ---
const nullishMutator = {
  name: '?? → ||',
  types: ['LogicalExpression'],
  test: node => node.operator === '??',
  mutate: (node, source) => {
    const idx = findBetween(source, node.left.end, node.right.start, '??')
    if (idx === -1) return null
    return { start: idx, end: idx + 2, replacement: '||' }
  }
}

// --- Assignment mutations ---
const assignmentSwaps = { '+=': '-=', '-=': '+=' }
const assignmentNames = { '+=': '+= → -=', '-=': '-= → +=' }

const assignmentMutator = {
  types: ['AssignmentExpression'],
  test: node => Boolean(assignmentSwaps[node.operator]),
  mutate: (node, source) => {
    const op = node.operator
    const idx = findBetween(source, node.left.end, node.right.start, op)
    if (idx === -1) return null
    return { start: idx, end: idx + op.length, replacement: assignmentSwaps[op], name: assignmentNames[op] }
  }
}

// --- Numeric boundary ---
const numericMutator = {
  types: ['NumericLiteral'],
  test: node => !node.value || node.value === 1,
  mutate: node => {
    const [replacement, name] = node.value ? ['0', '1 → 0'] : ['1', '0 → 1']
    return {
      start: node.start,
      end: node.end,
      replacement, 
      name
    }
  }
}

// --- Unary minus for -1 ---
const unaryMinusMutator = {
  types: ['UnaryExpression'],
  test: node => node.operator === '-' && node.prefix,
  mutate: node => {
    if (node.argument.type === 'NumericLiteral' && node.argument.value === 1) {
      return { start: node.start, end: node.end, replacement: '0', name: '-1 → 0' }
    }
    if (node.argument.type === 'Identifier') {
      return { start: node.start, end: node.argument.start, replacement: '', name: 'unary -x → x' }
    }
    return null
  }
}

// --- Throw removal ---
const throwMutator = {
  name: 'throw → return',
  types: ['ThrowStatement'],
  test: () => true,
  mutate: (node, source) => {
    const idx = source.indexOf('throw', node.start)
    if (idx === -1) return null
    return { start: idx, end: idx + 5, replacement: 'return' }
  }
}

// --- Math method swaps ---
const mathSwaps = {
  floor: { to: 'ceil', name: 'Math.floor → Math.ceil' },
  ceil: { to: 'floor', name: 'Math.ceil → Math.floor' },
  min: { to: 'max', name: 'Math.min → Math.max' },
  max: { to: 'min', name: 'Math.max → Math.min' },
  round: { to: 'floor', name: 'Math.round → Math.floor' },
  sqrt: { to: 'cbrt', name: 'Math.sqrt → Math.cbrt' }
}

const mathMutator = {
  types: ['CallExpression'],
  test: node => {
    if (node.callee.type !== 'MemberExpression') return false
    if (node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'Math') return false
    return Boolean(mathSwaps[node.callee.property.name]) || node.callee.property.name === 'abs'
  },
  mutate: node => {
    const prop = node.callee.property
    if (prop.name === 'abs') {
      return { start: node.callee.object.start, end: prop.end, replacement: '', name: 'Math.abs → (removed)' }
    }
    const swap = mathSwaps[prop.name]
    return { start: prop.start, end: prop.end, replacement: swap.to, name: swap.name }
  }
}

// --- Object method swaps ---
const objectMethodSwaps = {
  keys: { to: 'values', name: 'Object.keys → Object.values' },
  values: { to: 'keys', name: 'Object.values → Object.keys' },
  entries: { to: 'keys', name: 'Object.entries → Object.keys' }
}

const objectMethodMutator = {
  types: ['CallExpression'],
  test: node => {
    if (node.callee.type !== 'MemberExpression') return false
    if (node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'Object') return false
    return Boolean(objectMethodSwaps[node.callee.property.name])
  },
  mutate: node => {
    const prop = node.callee.property
    const swap = objectMethodSwaps[prop.name]
    return { start: prop.start, end: prop.end, replacement: swap.to, name: swap.name }
  }
}

// --- Array.isArray negation ---
const arrayIsArrayMutator = {
  name: 'Array.isArray → !Array.isArray',
  types: ['CallExpression'],
  test: node => {
    if (node.callee.type !== 'MemberExpression') return false
    if (node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'Array') return false
    return node.callee.property.name === 'isArray'
  },
  mutate: node => ({ start: node.start, end: node.start, replacement: '!' })
}

// --- Type conversion swaps ---
const typeConversionSwaps = {
  parseInt: { to: 'parseFloat', name: 'parseInt → parseFloat' },
  parseFloat: { to: 'parseInt', name: 'parseFloat → parseInt' }
}

const typeConversionMutator = {
  types: ['CallExpression'],
  test: node => node.callee.type === 'Identifier' && Boolean(typeConversionSwaps[node.callee.name]),
  mutate: node => {
    const swap = typeConversionSwaps[node.callee.name]
    return { start: node.callee.start, end: node.callee.end, replacement: swap.to, name: swap.name }
  }
}

// --- Bitwise operator swaps ---
const bitwiseSwaps = { '&': '|', '|': '&', '^': '&', '<<': '>>', '>>': '<<' }
const bitwiseNames = {
  '&': '& → |', '|': '| → &', '^': '^ → &',
  '<<': '<< → >>', '>>': '>> → <<'
}

const bitwiseMutator = {
  types: ['BinaryExpression'],
  test: node => Boolean(bitwiseSwaps[node.operator]),
  mutate: (node, source) => {
    const op = node.operator
    const idx = findBetween(source, node.left.end, node.right.start, op)
    if (idx === -1) return null
    return { start: idx, end: idx + op.length, replacement: bitwiseSwaps[op], name: bitwiseNames[op] }
  }
}

// --- Void operator removal ---
const voidMutator = {
  name: 'void expr → expr',
  types: ['UnaryExpression'],
  test: node => node.operator === 'void' && node.prefix,
  mutate: node => ({ start: node.start, end: node.argument.start, replacement: '' })
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
    testMutation(trimMutator, 'const x = s.trim()', 'const x = s', 'trim() → (removed)')
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

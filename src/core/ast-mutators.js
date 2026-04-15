/**
 * AST-based mutation visitors.
 *
 * Each mutator targets specific ESTree/Babel node types and produces source patches.
 * The AST engine walks the parsed tree, calls test() for matching node types,
 * and applies mutate() patches to generate mutation objects.
 *
 * Mutator interface:
 *   name: string                              — human-readable mutation name
 *   types: string[]                           — ESTree node types to visit
 *   test(node, source, parent) → boolean      — does this node match?
 *   mutate(node, source, parent) → patch|null — { start, end, replacement }
 *
 * The engine splices `replacement` into source at [start, end) to produce
 * the mutated file, then derives { line, original, mutated, name, source }.
 */

// ── Helpers ──────────────────────────────────────────────────────────

function findBetween(source, from, to, text) {
  const idx = source.indexOf(text, from)
  return idx !== -1 && idx + text.length <= to ? idx : -1
}

function isStringLiteral(node) {
  return node.type === 'StringLiteral'
    || (node.type === 'Literal' && typeof node.value === 'string')
}

function isNumericLiteral(node) {
  return node.type === 'NumericLiteral'
    || (node.type === 'Literal' && typeof node.value === 'number')
}

function isMemberCall(node, methodName) {
  return node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && node.callee.property?.name === methodName
}

function isStaticCall(node, objectName, methodName) {
  return node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && node.callee.object?.name === objectName
    && node.callee.property?.name === methodName
}

// ── Factories ────────────────────────────────────────────────────────

function binaryOpSwap(name, from, to) {
  return {
    name,
    types: ['BinaryExpression'],
    test: (node) => node.operator === from,
    mutate: (node, source) => {
      const idx = findBetween(source, node.left.end, node.right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement: to }
    }
  }
}

function logicalOpSwap(name, from, to) {
  return {
    name,
    types: ['LogicalExpression'],
    test: (node) => node.operator === from,
    mutate: (node, source) => {
      const idx = findBetween(source, node.left.end, node.right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement: to }
    }
  }
}

function assignmentOpSwap(name, from, to) {
  return {
    name,
    types: ['AssignmentExpression'],
    test: (node) => node.operator === from,
    mutate: (node, source) => {
      const idx = findBetween(source, node.left.end, node.right.start, from)
      if (idx === -1) return null
      return { start: idx, end: idx + from.length, replacement: to }
    }
  }
}

function methodNameSwap(name, from, to) {
  return {
    name,
    types: ['CallExpression'],
    test: (node) => isMemberCall(node, from),
    mutate: (node) => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: to }
    }
  }
}

function staticMethodSwap(name, obj, from, to) {
  return {
    name,
    types: ['CallExpression'],
    test: (node) => isStaticCall(node, obj, from),
    mutate: (node) => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: to }
    }
  }
}

function globalFnSwap(name, from, to) {
  return {
    name,
    types: ['CallExpression'],
    test: (node) => node.callee?.type === 'Identifier' && node.callee.name === from,
    mutate: (node) => ({ start: node.callee.start, end: node.callee.end, replacement: to })
  }
}

// ── Equality operators ───────────────────────────────────────────────

const equalityOperators = [
  binaryOpSwap('=== → !==', '===', '!=='),
  binaryOpSwap('!== → ===', '!==', '==='),
  binaryOpSwap('>= → <', '>=', '<'),
  binaryOpSwap('<= → >', '<=', '>'),
  binaryOpSwap('> → <', '>', '<'),
  binaryOpSwap('< → >', '<', '>')
]

// ── Logical operators ────────────────────────────────────────────────

const logicalOperators = [
  logicalOpSwap('&& → ||', '&&', '||'),
  logicalOpSwap('|| → &&', '||', '&&')
]

// ── Arithmetic operators ─────────────────────────────────────────────

const arithmeticOperators = [
  binaryOpSwap('+ → -', '+', '-'),
  binaryOpSwap('- → +', '-', '+'),
  binaryOpSwap('* → /', '*', '/'),
  binaryOpSwap('/ → *', '/', '*'),
  binaryOpSwap('% → +', '%', '+'),
  binaryOpSwap('** → *', '**', '*')
]

// ── Boolean literals ─────────────────────────────────────────────────

const booleanLiterals = [
  {
    name: 'true → false',
    types: ['Literal', 'BooleanLiteral'],
    test: (node) => node.value === true,
    mutate: (node) => ({ start: node.start, end: node.end, replacement: 'false' })
  },
  {
    name: 'false → true',
    types: ['Literal', 'BooleanLiteral'],
    test: (node) => node.value === false,
    mutate: (node) => ({ start: node.start, end: node.end, replacement: 'true' })
  }
]

// ── Conditional expression (ternary) ─────────────────────────────────

const conditionalExpressions = [
  {
    name: 'ternary → always truthy',
    types: ['ConditionalExpression'],
    test: () => true,
    mutate: (node) => ({
      start: node.consequent.start,
      end: node.consequent.start,
      replacement: 'true || '
    })
  },
  {
    name: 'ternary → always falsy',
    types: ['ConditionalExpression'],
    test: () => true,
    mutate: (node) => ({
      start: node.consequent.start,
      end: node.consequent.start,
      replacement: 'false && '
    })
  }
]

// ── Method expressions ───────────────────────────────────────────────

const methodExpressions = [
  methodNameSwap('toLowerCase → toUpperCase', 'toLowerCase', 'toUpperCase'),
  methodNameSwap('toUpperCase → toLowerCase', 'toUpperCase', 'toLowerCase'),
  {
    name: 'trim() → (removed)',
    types: ['CallExpression'],
    test: (node) => isMemberCall(node, 'trim') && node.arguments.length === 0,
    mutate: (node) => ({
      start: node.callee.object.end,
      end: node.end,
      replacement: ''
    })
  },
  {
    name: 'filter(predicate) → filter(true) (ignore predicate)',
    types: ['CallExpression'],
    test: (node) => isMemberCall(node, 'filter') && node.arguments.length > 0,
    mutate: (node) => ({
      start: node.arguments[0].start,
      end: node.arguments[0].start,
      replacement: 'x => true, '
    })
  },
  {
    name: 'slice() → slice(1,',
    types: ['CallExpression'],
    test: (node) => isMemberCall(node, 'slice'),
    mutate: (node, source) => {
      const openParen = source.indexOf('(', node.callee.end)
      if (openParen === -1) return null
      return { start: openParen + 1, end: openParen + 1, replacement: '1,' }
    }
  }
]

// ── String literals ──────────────────────────────────────────────────

const stringLiterals = [
  {
    name: "return '' → return 'mutant'",
    types: ['ReturnStatement'],
    test: (node, source) => {
      const arg = node.argument
      return arg && isStringLiteral(arg) && arg.value === '' && source[arg.start] === "'"
    },
    mutate: (node) => ({
      start: node.argument.start,
      end: node.argument.end,
      replacement: "'mutant'"
    })
  },
  {
    name: 'return "" → return "mutant"',
    types: ['ReturnStatement'],
    test: (node, source) => {
      const arg = node.argument
      return arg && isStringLiteral(arg) && arg.value === '' && source[arg.start] === '"'
    },
    mutate: (node) => ({
      start: node.argument.start,
      end: node.argument.end,
      replacement: '"mutant"'
    })
  }
]

// ── Block statement ──────────────────────────────────────────────────

const blockStatements = [
  {
    name: 'return {} → Object.freeze (syntax break)',
    types: ['ReturnStatement'],
    test: (node) => node.argument?.type === 'ObjectExpression',
    mutate: (node) => ({
      start: node.argument.start,
      end: node.argument.start,
      replacement: 'Object.freeze('
    })
  },
  {
    name: 'return → void',
    types: ['ReturnStatement'],
    test: (node) =>
      node.argument != null
      && node.argument.type !== 'ObjectExpression'
      && node.argument.type !== 'ArrayExpression',
    mutate: (node, source) => {
      const idx = source.indexOf('return', node.start)
      if (idx === -1) return null
      return { start: idx, end: idx + 6, replacement: 'void' }
    }
  }
]

// ── Async ────────────────────────────────────────────────────────────

const asyncMutations = [
  {
    name: 'await → (removed)',
    types: ['AwaitExpression'],
    test: () => true,
    mutate: (node) => ({
      start: node.start,
      end: node.argument.start,
      replacement: ''
    })
  }
]

// ── Remove || fallback ───────────────────────────────────────────────

const fallbackRemovals = [
  {
    name: '|| [] → (removed)',
    types: ['LogicalExpression'],
    test: (node) =>
      node.operator === '||'
      && node.right.type === 'ArrayExpression'
      && node.right.elements.length === 0,
    mutate: (node) => ({
      start: node.left.end,
      end: node.end,
      replacement: ''
    })
  },
  {
    name: "|| '' → (removed)",
    types: ['LogicalExpression'],
    test: (node) =>
      node.operator === '||' && isStringLiteral(node.right) && node.right.value === '',
    mutate: (node) => ({
      start: node.left.end,
      end: node.end,
      replacement: ''
    })
  },
  {
    name: '|| 0 → (removed)',
    types: ['LogicalExpression'],
    test: (node) =>
      node.operator === '||' && isNumericLiteral(node.right) && node.right.value === 0,
    mutate: (node) => ({
      start: node.left.end,
      end: node.end,
      replacement: ''
    })
  }
]

// ── Update operators ─────────────────────────────────────────────────

const updateOperators = [
  {
    name: '++ → --',
    types: ['UpdateExpression'],
    test: (node) => node.operator === '++',
    mutate: (node) => {
      const op = node.prefix ? node.start : node.argument.end
      return { start: op, end: op + 2, replacement: '--' }
    }
  },
  {
    name: '-- → ++',
    types: ['UpdateExpression'],
    test: (node) => node.operator === '--',
    mutate: (node) => {
      const op = node.prefix ? node.start : node.argument.end
      return { start: op, end: op + 2, replacement: '++' }
    }
  }
]

// ── Optional chaining removal ────────────────────────────────────────

const optionalChaining = [
  {
    name: '?. → .',
    types: ['MemberExpression', 'CallExpression'],
    test: (node) => node.optional === true,
    mutate: (node, source) => {
      const searchFrom = node.object?.end ?? node.callee?.end ?? node.start
      const idx = source.indexOf('?.', searchFrom)
      if (idx === -1) return null
      return { start: idx, end: idx + 2, replacement: '.' }
    }
  }
]

// ── Negation removal ─────────────────────────────────────────────────

const negationRemoval = [
  {
    name: '!var → var',
    types: ['UnaryExpression'],
    test: (node) => node.operator === '!' && node.prefix,
    mutate: (node) => ({
      start: node.start,
      end: node.argument.start,
      replacement: ''
    })
  }
]

// ── Nullish coalescing ───────────────────────────────────────────────

const nullishCoalescing = [
  logicalOpSwap('?? → ||', '??', '||')
]

// ── Assignment mutations ─────────────────────────────────────────────

const assignmentMutations = [
  assignmentOpSwap('+= → -=', '+=', '-='),
  assignmentOpSwap('-= → +=', '-=', '+=')
]

// ── Numeric boundary ─────────────────────────────────────────────────

const numericBoundary = [
  {
    name: '0 → 1',
    types: ['Literal', 'NumericLiteral'],
    test: (node) => node.value === 0,
    mutate: (node, source) => {
      const raw = source.slice(node.start, node.end)
      if (/^0[xXoObB]/.test(raw) || raw.includes('.')) return null
      return { start: node.start, end: node.end, replacement: '1' }
    }
  },
  {
    name: '1 → 0',
    types: ['Literal', 'NumericLiteral'],
    test: (node) => node.value === 1,
    mutate: (node, source) => {
      const raw = source.slice(node.start, node.end)
      if (/^0[xXoObB]/.test(raw)) return null
      if (node.start > 0 && /[.\d]/.test(source[node.start - 1])) return null
      return { start: node.start, end: node.end, replacement: '0' }
    }
  },
  {
    name: '-1 → 0',
    types: ['UnaryExpression'],
    test: (node) =>
      node.operator === '-'
      && node.prefix
      && isNumericLiteral(node.argument)
      && node.argument.value === 1,
    mutate: (node) => ({
      start: node.start,
      end: node.end,
      replacement: '0'
    })
  }
]

// ── Throw removal ────────────────────────────────────────────────────

const throwRemoval = [
  {
    name: 'throw → return',
    types: ['ThrowStatement'],
    test: () => true,
    mutate: (node, source) => {
      const idx = source.indexOf('throw', node.start)
      if (idx === -1) return null
      return { start: idx, end: idx + 5, replacement: 'return' }
    }
  }
]

// ── String method swaps ──────────────────────────────────────────────

const stringMethodSwaps = [
  methodNameSwap('includes → indexOf', 'includes', 'indexOf'),
  methodNameSwap('startsWith → endsWith', 'startsWith', 'endsWith'),
  methodNameSwap('endsWith → startsWith', 'endsWith', 'startsWith')
]

// ── Math method swaps ────────────────────────────────────────────────

const mathMethodSwaps = [
  staticMethodSwap('Math.floor → Math.ceil', 'Math', 'floor', 'ceil'),
  staticMethodSwap('Math.ceil → Math.floor', 'Math', 'ceil', 'floor'),
  staticMethodSwap('Math.min → Math.max', 'Math', 'min', 'max'),
  staticMethodSwap('Math.max → Math.min', 'Math', 'max', 'min'),
  {
    name: 'Math.abs → (removed)',
    types: ['CallExpression'],
    test: (node) => isStaticCall(node, 'Math', 'abs'),
    mutate: (node) => ({
      start: node.callee.start,
      end: node.callee.end,
      replacement: ''
    })
  },
  staticMethodSwap('Math.round → Math.floor', 'Math', 'round', 'floor'),
  staticMethodSwap('Math.sqrt → Math.cbrt', 'Math', 'sqrt', 'cbrt')
]

// ── Array method swaps ───────────────────────────────────────────────

const arrayMethodSwaps = [
  methodNameSwap('some → every', 'some', 'every'),
  methodNameSwap('every → some', 'every', 'some'),
  methodNameSwap('map → filter', 'map', 'filter'),
  {
    name: 'Array.isArray → !Array.isArray',
    types: ['CallExpression'],
    test: (node) => isStaticCall(node, 'Array', 'isArray'),
    mutate: (node) => ({
      start: node.start,
      end: node.start,
      replacement: '!'
    })
  },
  methodNameSwap('push → pop', 'push', 'pop'),
  {
    name: 'shift → pop',
    types: ['CallExpression'],
    test: (node) => isMemberCall(node, 'shift') && node.arguments.length === 0,
    mutate: (node) => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: 'pop' }
    }
  },
  methodNameSwap('unshift → push', 'unshift', 'push'),
  methodNameSwap('find → findIndex', 'find', 'findIndex'),
  methodNameSwap('findIndex → find', 'findIndex', 'find'),
  {
    name: 'reverse() → (removed)',
    types: ['CallExpression'],
    test: (node) => isMemberCall(node, 'reverse') && node.arguments.length === 0,
    mutate: (node) => ({
      start: node.callee.object.end,
      end: node.end,
      replacement: ''
    })
  },
  methodNameSwap('splice → slice', 'splice', 'slice')
]

// ── Object method swaps ──────────────────────────────────────────────

const objectMethodSwaps = [
  {
    name: 'Object.keys → Object.values',
    types: ['CallExpression'],
    test: (node, source, parent) =>
      isStaticCall(node, 'Object', 'keys')
      && !(parent?.type === 'MemberExpression' && parent.property?.name === 'length'),
    mutate: (node) => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: 'values' }
    }
  },
  {
    name: 'Object.values → Object.keys',
    types: ['CallExpression'],
    test: (node, source, parent) =>
      isStaticCall(node, 'Object', 'values')
      && !(parent?.type === 'MemberExpression' && parent.property?.name === 'length'),
    mutate: (node) => {
      const prop = node.callee.property
      return { start: prop.start, end: prop.end, replacement: 'keys' }
    }
  },
  staticMethodSwap('Object.entries → Object.keys', 'Object', 'entries', 'keys')
]

// ── String method mutations ──────────────────────────────────────────

const stringMethodMutations = [
  methodNameSwap('replace → toString (removed)', 'replace', 'toString')
]

// ── Unary minus removal ──────────────────────────────────────────────

const unaryMinusRemoval = [
  {
    name: 'unary -x → x',
    types: ['UnaryExpression'],
    test: (node) =>
      node.operator === '-'
      && node.prefix
      && node.argument.type === 'Identifier',
    mutate: (node) => ({
      start: node.start,
      end: node.argument.start,
      replacement: ''
    })
  }
]

// ── Bitwise operator swaps ───────────────────────────────────────────

const bitwiseOperators = [
  binaryOpSwap('& → |', '&', '|'),
  binaryOpSwap('| → &', '|', '&'),
  binaryOpSwap('^ → &', '^', '&'),
  binaryOpSwap('<< → >>', '<<', '>>'),
  binaryOpSwap('>> → <<', '>>', '<<')
]

// ── Type conversion swaps ────────────────────────────────────────────

const typeConversions = [
  globalFnSwap('parseInt → parseFloat', 'parseInt', 'parseFloat'),
  globalFnSwap('parseFloat → parseInt', 'parseFloat', 'parseInt')
]

// ── Spread removal ───────────────────────────────────────────────────

const spreadRemoval = [
  {
    name: '[...x] → x (remove copy)',
    types: ['ArrayExpression'],
    test: (node) =>
      node.elements.length === 1
      && node.elements[0]?.type === 'SpreadElement',
    mutate: (node, source) => ({
      start: node.start,
      end: node.end,
      replacement: source.slice(
        node.elements[0].argument.start,
        node.elements[0].argument.end
      )
    })
  },
  {
    name: '[...x, y] → [y] (remove spread)',
    types: ['ArrayExpression'],
    test: (node) =>
      node.elements.length >= 2
      && node.elements[0]?.type === 'SpreadElement',
    mutate: (node, source) => ({
      start: node.start + 1,
      end: node.elements[1].start,
      replacement: ''
    })
  }
]

// ── Void operator removal ────────────────────────────────────────────

const voidRemoval = [
  {
    name: 'void expr → expr',
    types: ['UnaryExpression'],
    test: (node) => node.operator === 'void' && node.prefix,
    mutate: (node) => ({
      start: node.start,
      end: node.argument.start,
      replacement: ''
    })
  }
]

// ── Property access mutations ────────────────────────────────────────

const propertyAccessMutations = [
  {
    name: '.length → .length + 1',
    types: ['MemberExpression'],
    test: (node) => !node.computed && node.property?.name === 'length',
    mutate: (node) => ({
      start: node.end,
      end: node.end,
      replacement: ' + 1'
    })
  }
]

// ── Export ────────────────────────────────────────────────────────────

export const javascript = [
  ...equalityOperators,
  ...logicalOperators,
  ...arithmeticOperators,
  ...booleanLiterals,
  ...conditionalExpressions,
  ...methodExpressions,
  ...stringLiterals,
  ...blockStatements,
  ...asyncMutations,
  ...fallbackRemovals,
  ...updateOperators,
  ...optionalChaining,
  ...negationRemoval,
  ...nullishCoalescing,
  ...assignmentMutations,
  ...numericBoundary,
  ...throwRemoval,
  ...stringMethodSwaps,
  ...mathMethodSwaps,
  ...arrayMethodSwaps,
  ...objectMethodSwaps,
  ...stringMethodMutations,
  ...unaryMinusRemoval,
  ...bitwiseOperators,
  ...typeConversions,
  ...spreadRemoval,
  ...voidRemoval,
  ...propertyAccessMutations
]

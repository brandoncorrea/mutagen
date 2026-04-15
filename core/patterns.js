/**
 * Universal JavaScript mutation patterns.
 * These apply to any JS/TS codebase regardless of framework.
 */

export const javascript = [
  // --- EqualityOperator ---
  { pattern: / === /g, replacement: ' !== ', name: '=== → !==' },
  { pattern: / !== /g, replacement: ' === ', name: '!== → ===' },

  // --- EqualityOperator (comparison) ---
  { pattern: / >= /g, replacement: ' < ', name: '>= → <' },
  { pattern: / <= /g, replacement: ' > ', name: '<= → >' },
  { pattern: / > /g, replacement: ' < ', name: '> → <', nearGuard: /[=>]/ },
  { pattern: / < /g, replacement: ' > ', name: '< → >', nearGuard: /[=<]/ },

  // --- LogicalOperator ---
  { pattern: / && /g, replacement: ' || ', name: '&& → ||' },
  { pattern: / \|\| /g, replacement: ' && ', name: '|| → &&' },

  // --- ArithmeticOperator ---
  { pattern: / \+ /g, replacement: ' - ', name: '+ → -', nearGuard: /['"`]/ },
  { pattern: / - /g, replacement: ' + ', name: '- → +', nearGuard: /['"`]/ },
  { pattern: / \* /g, replacement: ' / ', name: '* → /', nearGuard: /['"`,/]/ },
  { pattern: / \/ /g, replacement: ' * ', name: '/ → *', nearGuard: /['"`,/]/ },
  { pattern: / % /g, replacement: ' + ', name: '% → +' },
  { pattern: / \*\* /g, replacement: ' * ', name: '** → *' },

  // --- BooleanLiteral ---
  { pattern: /\btrue\b/g, replacement: 'false', name: 'true → false', guard: /^\s*\/\// },
  { pattern: /\bfalse\b/g, replacement: 'true', name: 'false → true', guard: /^\s*\/\// },

  // --- ConditionalExpression ---
  { pattern: / \? /g, replacement: ' ? true || ', name: 'ternary → always truthy', guard: /^\s*\/\// },
  { pattern: / \? /g, replacement: ' ? false && ', name: 'ternary → always falsy', guard: /^\s*\/\// },

  // --- MethodExpression ---
  { pattern: /\.toLowerCase\(\)/g, replacement: '.toUpperCase()', name: 'toLowerCase → toUpperCase' },
  { pattern: /\.toUpperCase\(\)/g, replacement: '.toLowerCase()', name: 'toUpperCase → toLowerCase' },
  { pattern: /\.trim\(\)/g, replacement: '', name: 'trim() → (removed)' },
  { pattern: /\.filter\(/g, replacement: '.filter(x => true, ', name: 'filter(predicate) → filter(true) (ignore predicate)' },
  { pattern: /\.slice\(/g, replacement: '.slice(1,', name: 'slice() → slice(1,' },

  // --- StringLiteral ---
  { pattern: /return ''/g, replacement: "return 'mutant'", name: "return '' → return 'mutant'" },
  { pattern: /return ""/g, replacement: 'return "mutant"', name: 'return "" → return "mutant"' },

  // --- BlockStatement ---
  { pattern: /return \{/g, replacement: 'return Object.freeze({', name: 'return {} → Object.freeze (syntax break)' },
  { pattern: /^(\s*)return\b/g, replacement: '$1void', name: 'return → void', guard: /^\s*[{[]/ },

  // --- Async ---
  { pattern: /\bawait /g, replacement: '', name: 'await → (removed)', guard: /^\s*\/\// },

  // --- Remove || fallback ---
  { pattern: / \|\| \[\]/g, replacement: '', name: '|| [] → (removed)' },
  { pattern: / \|\| ''/g, replacement: '', name: "|| '' → (removed)" },
  { pattern: / \|\| 0/g, replacement: '', name: '|| 0 → (removed)' },

  // --- UpdateOperator ---
  { pattern: /\+\+/g, replacement: '--', name: '++ → --' },
  { pattern: /--/g, replacement: '++', name: '-- → ++', nearGuard: /['"`,>]/ },

  // --- Optional chaining removal ---
  { pattern: /\?\./g, replacement: '.', name: '?. → .', guard: /^\s*\/\// },

  // --- Negation removal ---
  { pattern: /!([a-zA-Z_$])/g, replacement: '$1', name: '!var → var', guard: /!==|!\s/ },

  // --- Nullish coalescing ---
  { pattern: / \?\? /g, replacement: ' || ', name: '?? → ||' },

  // --- Assignment mutations ---
  { pattern: / \+= /g, replacement: ' -= ', name: '+= → -=' },
  { pattern: / -= /g, replacement: ' += ', name: '-= → +=' },

  // --- Numeric boundary ---
  { pattern: /\b0\b/g, replacement: '1', name: '0 → 1', guard: /['"`]|0[xXoObB]|\.\d|\.0/ },
  { pattern: /(?<![.\d])1\b/g, replacement: '0', name: '1 → 0', guard: /['"`]|0[xXoObB]/ },
  { pattern: /-1\b/g, replacement: '0', name: '-1 → 0', guard: /['"`]/ },

  // --- Throw removal ---
  { pattern: /^(\s*)throw\b/g, replacement: '$1return', name: 'throw → return' },

  // --- String method swaps ---
  { pattern: /\.includes\(/g, replacement: '.indexOf(', name: 'includes → indexOf' },
  { pattern: /\.startsWith\(/g, replacement: '.endsWith(', name: 'startsWith → endsWith' },
  { pattern: /\.endsWith\(/g, replacement: '.startsWith(', name: 'endsWith → startsWith' },

  // --- Math method swaps ---
  { pattern: /Math\.floor\(/g, replacement: 'Math.ceil(', name: 'Math.floor → Math.ceil' },
  { pattern: /Math\.ceil\(/g, replacement: 'Math.floor(', name: 'Math.ceil → Math.floor' },
  { pattern: /Math\.min\(/g, replacement: 'Math.max(', name: 'Math.min → Math.max' },
  { pattern: /Math\.max\(/g, replacement: 'Math.min(', name: 'Math.max → Math.min' },
  { pattern: /Math\.abs\(/g, replacement: '(', name: 'Math.abs → (removed)' },
  { pattern: /Math\.round\(/g, replacement: 'Math.floor(', name: 'Math.round → Math.floor' },
  { pattern: /Math\.sqrt\(/g, replacement: 'Math.cbrt(', name: 'Math.sqrt → Math.cbrt' },

  // --- Array method swaps ---
  { pattern: /\.some\(/g, replacement: '.every(', name: 'some → every' },
  { pattern: /\.every\(/g, replacement: '.some(', name: 'every → some' },
  { pattern: /\.map\(/g, replacement: '.filter(', name: 'map → filter' },
  { pattern: /Array\.isArray\(/g, replacement: '!Array.isArray(', name: 'Array.isArray → !Array.isArray' },
  { pattern: /\.push\(/g, replacement: '.pop(', name: 'push → pop' },
  { pattern: /\.shift\(\)/g, replacement: '.pop()', name: 'shift → pop' },
  { pattern: /\.unshift\(/g, replacement: '.push(', name: 'unshift → push' },
  { pattern: /\.find\(/g, replacement: '.findIndex(', name: 'find → findIndex' },
  { pattern: /\.findIndex\(/g, replacement: '.find(', name: 'findIndex → find' },
  { pattern: /\.reverse\(\)/g, replacement: '', name: 'reverse() → (removed)' },
  { pattern: /\.splice\(/g, replacement: '.slice(', name: 'splice → slice' },

  // --- Object method swaps ---
  { pattern: /Object\.keys\(/g, replacement: 'Object.values(', name: 'Object.keys → Object.values', guard: /\)\.length/ },
  { pattern: /Object\.values\(/g, replacement: 'Object.keys(', name: 'Object.values → Object.keys', guard: /\)\.length/ },
  { pattern: /Object\.entries\(/g, replacement: 'Object.keys(', name: 'Object.entries → Object.keys' },

  // --- String method mutations ---
  { pattern: /\.replace\(/g, replacement: '.toString(', name: 'replace → toString (removed)' },

  // --- Unary minus removal ---
  { pattern: /= -([a-zA-Z_$])/g, replacement: '= $1', name: 'unary -x → x' },
  { pattern: /return -([a-zA-Z_$])/g, replacement: 'return $1', name: 'return -x → x' },

  // --- Bitwise operator swaps ---
  { pattern: / & /g, replacement: ' | ', name: '& → |', guard: /&&/ },
  { pattern: / \| /g, replacement: ' & ', name: '| → &', guard: /\|\|/ },
  { pattern: / \^ /g, replacement: ' & ', name: '^ → &' },
  { pattern: / << /g, replacement: ' >> ', name: '<< → >>' },
  { pattern: / >> /g, replacement: ' << ', name: '>> → <<', guard: />>>/ },

  // --- Type conversion swaps ---
  { pattern: /parseInt\(/g, replacement: 'parseFloat(', name: 'parseInt → parseFloat' },
  { pattern: /parseFloat\(/g, replacement: 'parseInt(', name: 'parseFloat → parseInt' },

  // --- Spread removal ---
  { pattern: /\[\.\.\.(\w+)\]/g, replacement: '$1', name: '[...x] → x (remove copy)' },
  { pattern: /\[\.\.\.(\w+),\s*/g, replacement: '[', name: '[...x, y] → [y] (remove spread)' },

  // --- Void operator removal ---
  { pattern: /\bvoid /g, replacement: '', name: 'void expr → expr', guard: /^\s*\/\// },

  // --- Property access mutations ---
  { pattern: /\.length\b/g, replacement: '.length + 1', name: '.length → .length + 1', guard: /['"`]/ }
]

/**
 * TypeScript/JSX-specific mutation patterns.
 * These target TS syntax features: type assertions, access modifiers,
 * readonly, generics, interface optionality, enums, and type guards.
 */
export const typescript = [
  // --- Type assertion removal ---
  { pattern: / as \w+/g, replacement: '', name: 'as Type → (removed)' },

  // --- Non-null assertion removal ---
  { pattern: /(\w)!(?=[.;\s)\],}]|$)/g, replacement: '$1', name: 'x! → x' },

  // --- Readonly removal ---
  { pattern: /\breadonly /g, replacement: '', name: 'readonly → (removed)' },

  // --- Enum member value swap ---
  { pattern: /= 0,/g, replacement: '= 1,', name: '= 0 → = 1 (enum)' },
  { pattern: /= 1,/g, replacement: '= 0,', name: '= 1 → = 0 (enum)' },

  // --- Generic constraint removal ---
  // Matches <T extends Type> and removes the constraint, preserving the angle brackets.
  // Only works for single-param generics; complex cases need AST.
  { pattern: /<(\w+) extends \w+>/g, replacement: '<$1>', name: 'extends constraint → (removed)' },

  // --- Interface optionality toggle ---
  { pattern: /(\w)\?: /g, replacement: '$1: ', name: 'prop? → prop (required)' },

  // --- Access modifier swap ---
  { pattern: /\bprivate /g, replacement: 'public ', name: 'private → public' },
  { pattern: /\bprotected /g, replacement: 'public ', name: 'protected → public' },

  // --- Type guard negation ---
  { pattern: / is \w+ \{/g, replacement: ' is never {', name: 'is Type → is never' },

  // --- Definite assignment removal ---
  { pattern: /(\w)!:/g, replacement: '$1:', name: 'x!: → x:' },
]

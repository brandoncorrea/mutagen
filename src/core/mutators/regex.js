/**
 * Regex literal AST mutators.
 * Mutate regex patterns: anchors, quantifiers, and wildcards.
 */

/**
 * Find the first unescaped, non-character-class occurrence
 * of `char` in a regex pattern.
 * Returns the index within the pattern, or -1 if not found.
 */
function findUnescapedInPattern(pattern, char) {
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') i++
    else if (pattern[i] === '[') inClass = true
    else if (pattern[i] === ']') inClass = false
    else if (!inClass && pattern[i] === char) return i
  }
  return -1
}

function hasUnescapedChar(pattern, char) {
  return findUnescapedInPattern(pattern, char) !== -1
}

function regexCharMutator(name, char, replacement) {
  return {
    name,
    types: ['RegExpLiteral'],
    test: node => hasUnescapedChar(node.pattern, char),
    mutate: ({ pattern, start }, _source) => {
      const patternOffset = findUnescapedInPattern(pattern, char)
      if (patternOffset === -1) return null
      const sourcePos = start + 1 + patternOffset
      return { start: sourcePos, end: sourcePos + 1, replacement }
    }
  }
}

function findQuantifierQuestion(pattern) {
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') i++
    else if (pattern[i] === '[') inClass = true
    else if (pattern[i] === ']') inClass = false
    else if (!inClass && pattern[i] === '?') {
      if (i > 0 && pattern[i - 1] === '(') continue
      return i
    }
  }
  return -1
}

function findEscapeClass(pattern, cls) {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') {
      if (i + 1 < pattern.length && pattern[i + 1] === cls) return i
      i++
    }
  }
  return -1
}

function regexClassInversion(name, from, to) {
  return {
    name,
    types: ['RegExpLiteral'],
    test: node => findEscapeClass(node.pattern, from) !== -1,
    mutate: ({ pattern, start }) => {
      const offset = findEscapeClass(pattern, from)
      const charPos = start + 1 + offset + 1
      return { start: charPos, end: charPos + 1, replacement: to }
    }
  }
}

function regexFlagRemoval(name, flag) {
  return {
    name,
    types: ['RegExpLiteral'],
    test: node => node.flags.includes(flag),
    mutate: ({ pattern, flags, start }) => {
      const flagsStart = start + 1 + pattern.length + 1
      const flagOffset = flags.indexOf(flag)
      const sourcePos = flagsStart + flagOffset
      return { start: sourcePos, end: sourcePos + 1, replacement: '' }
    }
  }
}

function findQuantifierRange(pattern) {
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') { i++; continue }
    if (pattern[i] === '[') { inClass = true; continue }
    if (pattern[i] === ']') { inClass = false; continue }
    if (!inClass && pattern[i] === '{') {
      const close = pattern.indexOf('}', i)
      if (close === -1) continue
      const inner = pattern.slice(i + 1, close)
      if (!/^\d+(?:,\d*)?$/.test(inner)) continue
      const min = parseInt(inner, 10)
      return { offset: i, min, inner, length: close - i + 1 }
    }
  }
  return null
}

export const regexMutations = [
  regexCharMutator('^ → (removed)', '^', ''),
  regexCharMutator('$ → (removed)', '$', ''),
  regexCharMutator('* → +', '*', '+'),
  regexCharMutator('+ → *', '+', '*'),
  regexCharMutator('. → x', '.', 'x'),
  {
    name: '? → (removed)',
    types: ['RegExpLiteral'],
    test: node => findQuantifierQuestion(node.pattern) !== -1,
    mutate: ({ pattern, start }) => {
      const offset = findQuantifierQuestion(pattern)
      const sourcePos = start + 1 + offset
      return { start: sourcePos, end: sourcePos + 1, replacement: '' }
    }
  },
  regexClassInversion('\\d → \\D', 'd', 'D'),
  regexClassInversion('\\D → \\d', 'D', 'd'),
  regexClassInversion('\\w → \\W', 'w', 'W'),
  regexClassInversion('\\W → \\w', 'W', 'w'),
  regexClassInversion('\\s → \\S', 's', 'S'),
  regexClassInversion('\\S → \\s', 'S', 's'),
  regexFlagRemoval('/g → (removed)', 'g'),
  regexFlagRemoval('/i → (removed)', 'i'),
  regexFlagRemoval('/m → (removed)', 'm'),
  {
    name: '{n} → {n-1} (quantifier range)',
    types: ['RegExpLiteral'],
    test: node => {
      const q = findQuantifierRange(node.pattern)
      return q != null && q.min > 0
    },
    mutate: ({ pattern, start }) => {
      const q = findQuantifierRange(pattern)
      const inner = q.inner.replace(
        /^\d+/, String(q.min - 1)
      )
      const sourcePos = start + 1 + q.offset
      return {
        start: sourcePos,
        end: sourcePos + q.length,
        replacement: `{${inner}}`
      }
    }
  }
]

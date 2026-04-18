/**
 * Regex literal AST mutators.
 * Mutate regex patterns: anchors, quantifiers, and wildcards.
 */

/**
 * Find the first unescaped, non-character-class occurrence of `char` in a regex pattern.
 * Returns the index within the pattern string, or -1 if not found.
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

export const regexMutations = [
  regexCharMutator('^ → (removed)', '^', ''),
  regexCharMutator('$ → (removed)', '$', ''),
  regexCharMutator('* → +', '*', '+'),
  regexCharMutator('+ → *', '+', '*'),
  regexCharMutator('. → x', '.', 'x')
]

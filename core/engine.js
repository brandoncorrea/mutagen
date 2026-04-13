/**
 * Mutation generation engine.
 * Generates one mutation per regex match in source code, applying
 * guard logic to skip comments, strings, JSX, and arrow operators.
 */

import { getTokenContextAt, isInJsxTag, isArrowOperator } from './token-context.js'

export function preparePatterns(patterns) {
  return patterns.map(mut => ({
    ...mut,
    globalPattern: new RegExp(mut.pattern.source, mut.pattern.flags.replace('g', '') + 'g'),
    singlePattern: new RegExp(mut.pattern.source, mut.pattern.flags.replace('g', ''))
  }))
}

function shouldSkipLine(line, lineNum, targetLine) {
  if (targetLine && lineNum !== targetLine)
    return true

  const trimmed = line.trim()
  return !trimmed
    || trimmed.startsWith('//')
    || trimmed.startsWith('/*')
    || isStaticImport(trimmed)
}

function isStaticImport(trimmed) {
  // Skip static import declarations but not lines that merely contain "import"
  // e.g. skip `import foo from 'bar'` but not `const mod = await import('bar')`
  return trimmed.startsWith('import ')
    && !trimmed.includes('await ')
    && !trimmed.includes('import(')
}

const NEAR_GUARD_WINDOW = 5
function isNearGuardBlocked(line, match, mut) {
  if (!mut.nearGuard) return
  const lower = match.index - NEAR_GUARD_WINDOW
  const upper = match.index + match[0].length + NEAR_GUARD_WINDOW
  const windowStart = Math.max(0, lower)
  const windowEnd = upper
  const win = line.slice(windowStart, windowEnd)
  const matchInWin = match.index - windowStart
  const adjacentCtx = win.slice(0, matchInWin) + win.slice(matchInWin + match[0].length)
  return mut.nearGuard.test(adjacentCtx)
}

function isGuardBlocked(line, match, mut) {
  const before = line.slice(0, match.index)
  const after = line.slice(match.index + match[0].length)
  return mut.guard && mut.guard.test(before + after)
}

function isInNonCodeContext(line, match, mut) {
  const ctx = getTokenContextAt(line, match.index)
  return ctx === 'comment'
    || (ctx === 'string' && !mut.inStrings)
}

function isAngleBracketSyntax(line, match) {
  return match[0].includes('>')
    && (isArrowOperator(line, match.index) || isInJsxTag(line, match.index))
}

function shouldSkipMatch(line, match, mut) {
  return isGuardBlocked(line, match, mut)
    || isNearGuardBlocked(line, match, mut)
    || isInNonCodeContext(line, match, mut)
    || isAngleBracketSyntax(line, match)
}

function applyMutation(line, match, mut) {
  const before = line.slice(0, match.index)
  const after = line.slice(match.index + match[0].length)
  const replaced = match[0].replace(mut.singlePattern, mut.replacement)
  return before + replaced + after
}

function lineMutationsForPattern(sourceLines, line, lineNum, mutation) {
  const matches = [...line.matchAll(mutation.globalPattern)]
  const matchCount = matches.length
  const options = { sourceLines, line, lineNum, mutation }
  return matches
    .map((match, matchIdx) => compileMutation(matchCount, matchIdx, match, options))
    .filter(Boolean)
}

function compileMutation(matchCount, matchIdx, match, options) {
  const { sourceLines, line, lineNum, mutation } = options
  if (shouldSkipMatch(line, match, mutation)) return

  const mutatedLine = applyMutation(line, match, mutation)
  if (mutatedLine === line) return

  const suffix = matchCount > 1 ? ` (match ${matchIdx + 1}/${matchCount})` : ''
  const mutatedSource = sourceLines
    .slice(0, lineNum - 1)
    .concat(mutatedLine, sourceLines.slice(lineNum))
    .join('\n')

  return {
    line: lineNum,
    original: line.trim(),
    mutated: mutatedLine.trim(),
    name: mutation.name + suffix,
    source: mutatedSource
  }
}

/**
 * Generate one mutation per regex match in source code.
 * @param {string} source - source code to mutate
 * @param {Array} prepared - prepared patterns (from preparePatterns)
 * @param {number} [targetLine] - optional line number to restrict mutations to
 */
export function generateMutations(source, prepared, targetLine) {
  const sourceLines = source.split('\n')
  return sourceLines
    .map((line, index) => [line, index + 1])
    .filter(([line, lineNum]) => !shouldSkipLine(line, lineNum, targetLine))
    .flatMap(([line, lineNum]) =>
      prepared.flatMap(mut => lineMutationsForPattern(sourceLines, line, lineNum, mut)))
}

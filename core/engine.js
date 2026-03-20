/**
 * Mutation generation engine.
 * Generates one mutation per regex match in source code, applying
 * guard logic to skip comments, strings, JSX, and arrow operators.
 */

import { getTokenContextAt, isInJsxTag, isArrowOperator } from './tokenContext.js'

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
    || trimmed.startsWith('import ')
}

function isNearGuardBlocked(line, match, mut) {
  if (!mut.nearGuard) return
  const windowStart = Math.max(0, match.index - 5)
  const windowEnd = Math.min(line.length, match.index + match[0].length + 5)
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

function lineMutationsForPattern(lines, line, lineNum, mut) {
  const matches = [...line.matchAll(mut.globalPattern)]
  if (matches.length === 0) return []

  const mutations = []
  for (let matchIdx = 0; matchIdx < matches.length; matchIdx++) {
    const match = matches[matchIdx]
    if (shouldSkipMatch(line, match, mut)) continue

    const mutatedLine = applyMutation(line, match, mut)
    if (mutatedLine === line) continue

    const suffix = matches.length > 1 ? ` (match ${matchIdx + 1}/${matches.length})` : ''
    const mutatedSource = lines.slice(0, lineNum - 1).concat(mutatedLine, lines.slice(lineNum)).join('\n')
    mutations.push({
      line: lineNum,
      original: line.trim(),
      mutated: mutatedLine.trim(),
      name: mut.name + suffix,
      source: mutatedSource
    })
  }
  return mutations
}

/**
 * Generate one mutation per regex match in source code.
 * @param {string} source - source code to mutate
 * @param {Array} prepared - prepared patterns (from preparePatterns)
 * @param {number} [targetLine] - optional line number to restrict mutations to
 */
export function generateMutations(source, prepared, targetLine) {
  const lines = source.split('\n')
  return lines
    .map((line, index) => [line, index + 1])
    .filter(([line, lineNum]) => !shouldSkipLine(line, lineNum, targetLine))
    .flatMap(([line, lineNum]) =>
      prepared.flatMap(mut => lineMutationsForPattern(lines, line, lineNum, mut)))
}

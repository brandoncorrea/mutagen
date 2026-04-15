/**
 * Token-aware context classification for mutation guards.
 * Uses js-tokens to determine whether a character position in a line
 * falls within code, a string, a comment, or JSX markup.
 */

import jsTokens from 'js-tokens'

export function isArrowOperator(line, position) {
  return position
    && line[position - 1] === '='
    && line[position] === '>'
}

export function getTokenContextAt(line, position) {
  const spans = tokenizeLine(line)
  for (const { start, end, type } of spans)
    if (position >= start && position < end)
      return type === 'whitespace' ? 'code' : type
  return 'code'
}

export function isInJsxTag(line, position) {
  const spans = tokenizeLine(line)
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i]
    if (shouldIgnoreSpan(span, position)) continue
    if (span.value === '>') return false
    if (span.value === '<') return true
  }
}

function shouldIgnoreSpan({ start, type }, position) {
  return start >= position || type === 'whitespace'
}

function tokenizeLine(line) {
  const spans = []
  for (const token of jsTokens(line)) {
    const start = spans.length ? spans[spans.length - 1].end : 0
    spans.push({
      start,
      end: start + token.value.length,
      type: spanType(token.type),
      value: token.value,
      tokenType: token.type
    })
  }
  return spans
}

function spanType(type) {
  return isString(type) ? 'string'
    : isComment(type) ? 'comment'
    : isWhitespace(type) ? 'whitespace'
    : 'code'
}

function isString(type) {
  return type === 'StringLiteral'
    || type === 'NoSubstitutionTemplate'
    || type === 'TemplateHead'
    || type === 'TemplateMiddle'
    || type === 'TemplateTail'
}

function isComment(type) {
  return type === 'SingleLineComment' || type === 'MultiLineComment'
}

function isWhitespace(type) {
  return type === 'WhiteSpace' || type === 'LineTerminatorSequence'
}

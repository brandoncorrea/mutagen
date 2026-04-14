/**
 * Token-aware context classification for mutation guards.
 * Uses js-tokens to determine whether a character position in a line
 * falls within code, a string, a comment, or JSX markup.
 */

// js-tokens v4 is CJS — createRequire is needed because vitest's ESM
// transform handles CJS default interop differently from Node's native loader
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const jsTokens = require('js-tokens')

const regex = jsTokens.default
const matchToToken = jsTokens.matchToToken

function isString(type) {
  return type === 'string' || type === 'template'
}

function isComment(type) {
  return type === 'comment'
}

function isWhitespace(type) {
  return type === 'whitespace'
}

const pattern = new RegExp(regex.source, regex.flags)

function spanType(type) {
  return isString(type) ? 'string'
    : isComment(type) ? 'comment'
    : isWhitespace(type) ? 'whitespace'
    : 'code'
}

function tokenizeLine(line) {
  pattern.lastIndex = 0
  const spans = []
  let match

  while (match = pattern.exec(line)) {
    const token = matchToToken(match)
    const start = match.index
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

export function getTokenContextAt(line, position) {
  const spans = tokenizeLine(line)
  for (const { start, end, type } of spans)
    if (position >= start && position < end)
      return isWhitespace(type) ? 'code' : type
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
  return start >= position || isWhitespace(type)
}

export function isArrowOperator(line, position) {
  return position > 0
    && line[position - 1] === '='
    && line[position] === '>'
}

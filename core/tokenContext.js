/**
 * Token-aware context classification for mutation guards.
 * Uses js-tokens to determine whether a character position in a line
 * falls within code, a string, a comment, or JSX markup.
 */

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const jsTokens = require('js-tokens')

const regex = jsTokens.default
const matchToToken = jsTokens.matchToToken

const STRING_TYPES = new Set(['string', 'template'])
const COMMENT_TYPES = new Set(['comment'])

const pattern = new RegExp(regex.source, regex.flags)

export function tokenizeLine(line) {
  pattern.lastIndex = 0
  const spans = []
  let match

  while ((match = pattern.exec(line)) !== null) {
    const token = matchToToken(match)
    const start = match.index
    const end = start + token.value.length

    let type = 'code'
    if (STRING_TYPES.has(token.type)) type = 'string'
    else if (COMMENT_TYPES.has(token.type)) type = 'comment'
    else if (token.type === 'whitespace') type = 'whitespace'

    spans.push({ type, start, end, value: token.value, tokenType: token.type })
  }

  return spans
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
    const { start, type, value } = spans[i]
    if (start >= position || type === 'whitespace') continue
    if (value === '>') return false
    if (value === '<') return true
  }
  return false
}

export function isArrowOperator(line, position) {
  return position > 0
    && line[position - 1] === '='
    && line[position] === '>'
}

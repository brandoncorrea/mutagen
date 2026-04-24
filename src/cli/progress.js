/**
 * Compact per-file dot notation progress reporter for --progress flag.
 * Writes to stderr so it's compatible with --json output.
 *
 * Legend: . killed  ! survived  T timeout
 */

import { calculateScore, STATUS } from '../core/mutation-status.js'

export function createProgressReporter(files, { write } = {}) {
  const maxWidth = files.reduce((max, file) => Math.max(max, file.length), 0)

  return {
    startFile(filename) {
      write(`${filename.padEnd(maxWidth)} `)
    },
    dot(status) {
      write(dotChar(status))
    },
    endFile() {
      write('\n')
    }
  }
}

export function formatProgressSummary({
  killed, survived, timedOut, fileCount
}) {
  const effectiveKilled = killed + timedOut
  const total = effectiveKilled + survived
  const score = calculateScore(effectiveKilled, total).toFixed(1)
  return `\n  ${fileCount} files | ${total} mutations`
    + ` | ${effectiveKilled} killed`
    + ` | ${survived} survived | ${score}%`
}

export function createOrderedBuffer(onDot) {
  const buffer = new Map()
  let cursor = 0
  return function (index, status) {
    buffer.set(index, status)
    while (buffer.has(cursor)) {
      onDot(buffer.get(cursor))
      buffer.delete(cursor)
      cursor++
    }
  }
}

function dotChar(status) {
  return status === STATUS.SURVIVED ? '!'
    : status === STATUS.TIMEOUT ? 'T'
    : '.'
}

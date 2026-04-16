/**
 * Compact per-file dot notation progress reporter for --progress flag.
 * Writes to stderr so it's compatible with --json output.
 *
 * Legend: . killed  ! survived  T timeout
 */

import { mutationScore } from '../core/mutation-status.js'

export function createProgressReporter(files, { write = text => process.stderr.write(text) } = {}) {
  const maxWidth = files.reduce((max, f) => Math.max(max, f.length), 0)

  return {
    startFile(filename) {
      write(filename.padEnd(maxWidth) + ' ')
    },
    dot(status) {
      write(dotChar(status))
    },
    endFile() {
      write('\n')
    }
  }
}

export function formatProgressSummary({ killed, survived, timedOut, fileCount }) {
  const effectiveKilled = killed + timedOut
  const total = effectiveKilled + survived
  const counts = { killed: effectiveKilled, survived, noCoverage: 0, timeout: 0 }
  const score = mutationScore(counts).toFixed(1)
  return `\n  ${fileCount} files | ${total} mutations | ${effectiveKilled} killed | ${survived} survived | ${score}%`
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
  if (status === 'SURVIVED') return '!'
  if (status === 'TIMEOUT (killed)') return 'T'
  return '.'
}

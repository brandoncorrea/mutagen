/**
 * Shared helpers for mutation runners.
 */

import { HEADER_SEPARATOR } from '../../core/report-data.js'

export async function runPreflightTests(out, runner) {
  if (runner.preflight) {
    if (!runner.preflight.passed) {
      out(`\nABORT: Tests already FAILING on original source. Fix the suite first.`)
      return { error: true }
    }
    return {}
  }
  out(`\nPre-flight: running tests against original source...`)
  const preflight = await runner.run()
  if (preflight.passed) return {}
  out(`\nABORT: Tests already FAILING on original source. Fix the suite first.`)
  return { error: true }
}

export function reportMutation(out, total, { number, id, line, name }, status) {
  const idTag = id ? ` [${id}]` : ''
  out(`[${number}/${total}] Line ${line}: ${name}${idTag} ... ${status}`)
}

export function printBanner(out, label, sourceFile, targetLine, timeout) {
  out(`\n${HEADER_SEPARATOR}`)
  out(label)
  out(HEADER_SEPARATOR)
  out(`Source: ${sourceFile}`)
  if (targetLine) out(`Target: line ${targetLine}`)
  if (timeout) out(`Timeout: ${timeout}ms per mutation`)
}

/**
 * Shared helpers for mutation runners.
 */

import { HEADER_SEPARATOR } from '../../core/report-data.js'

export async function runPreflightTests(out, runner) {
  out(`\nPre-flight: running tests against original source...`)
  const preflight = await runner.run()
  if (preflight.passed) return {}
  out(`\nABORT: Tests already FAILING on original source. Fix the suite first.`)
  return { error: true }
}

export function reportMutation(out, total, { number, line, name }, status) {
  out(`[${number}/${total}] Line ${line}: ${name} ... ${status}`)
}

export function printBanner(out, label, sourceFile, targetLine, timeout) {
  out(`\n${HEADER_SEPARATOR}`)
  out(label)
  out(HEADER_SEPARATOR)
  out(`Source: ${sourceFile}`)
  if (targetLine) out(`Target: line ${targetLine}`)
  if (timeout) out(`Timeout: ${timeout}ms per mutation`)
}

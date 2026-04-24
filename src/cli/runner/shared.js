/**
 * Shared helpers for mutation runners.
 */

import { HEADER_SEPARATOR } from '../shared.js'

export const PREFLIGHT_ABORT_MSG =
  '\nABORT: Tests already FAILING on original source. Fix the suite first.\n'

export async function runPreflightTests(out, runner) {
  if (runner.preflight) {
    if (runner.preflight.passed) return {}
    out.error(PREFLIGHT_ABORT_MSG)
    return { error: true }
  }
  out.log(`\nPre-flight: running tests against original source...`)
  const preflight = await runner.run()
  if (preflight.passed) return {}
  out.error(PREFLIGHT_ABORT_MSG)
  return { error: true }
}

export function reportMutation(out, total, { number, id, line, name }, status) {
  const idTag = id ? ` [${id}]` : ''
  out.log(`[${number}/${total}] Line ${line}: ${name}${idTag} ... ${status}`)
}

export function printBanner(out, label, sourceFile, targetLine, timeout) {
  out.log(`\n${HEADER_SEPARATOR}`)
  out.log(label)
  out.log(HEADER_SEPARATOR)
  out.log(`Source: ${sourceFile}`)
  if (targetLine) out.log(`Target: line ${targetLine}`)
  if (timeout) out.log(`Timeout: ${timeout}ms per mutation`)
}

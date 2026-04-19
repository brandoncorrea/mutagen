/**
 * Shared helpers for CLI modules.
 */

export { STATUS } from '../core/mutation-status.js'

/**
 * Create the default output channel object.
 * log  → stdout (console.log semantics, adds newline)
 * error → stderr (raw write semantics, caller adds newline)
 */
export function defaultOut() {
  return {
    log: console.log,
    error: text => process.stderr.write(text)
  }
}

export function isString(value) {
  return typeof value === 'string'
}

export function parallelWorkerCount(parallel) {
  if (typeof parallel === 'number')
    return parallel
}

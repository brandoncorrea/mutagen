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

export const DEFAULT_WORKER_COUNT = 2

export function parallelWorkerCount(parallel) {
  return typeof parallel === 'number'
    ? parallel : DEFAULT_WORKER_COUNT
}

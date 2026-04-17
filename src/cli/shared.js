/**
 * Shared helpers for CLI modules.
 */

export { STATUS } from '../core/mutation-status.js'

export function isString(value) {
  return typeof value === 'string'
}

export function parallelWorkerCount(parallel) {
  if (typeof parallel === 'number')
    return parallel
}

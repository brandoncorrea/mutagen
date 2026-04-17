/**
 * Shared helpers for CLI modules.
 */

export function isString(value) {
  return typeof value === 'string'
}

export function parallelWorkerCount(parallel) {
  if (typeof parallel === 'number')
    return parallel
}

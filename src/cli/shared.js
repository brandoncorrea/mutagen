/**
 * Shared helpers for CLI modules.
 */

export const STATUS = {
  SURVIVED: 'SURVIVED',
  KILLED: 'killed',
  KILLED_ERROR: 'killed (error)',
  TIMEOUT: 'TIMEOUT (killed)'
}

export function isString(value) {
  return typeof value === 'string'
}

export function parallelWorkerCount(parallel) {
  if (typeof parallel === 'number')
    return parallel
}

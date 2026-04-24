/**
 * Mutation status classification and scoring.
 * Pure functions for categorizing and scoring mutation test results.
 */

export const STATUS = {
  SURVIVED: 'Survived',
  KILLED: 'Killed',
  TIMEOUT: 'Timeout'
}

export function isKilled({ status }) {
  return status === STATUS.KILLED || status === STATUS.TIMEOUT
}

export function isAlive({ status }) {
  return status === STATUS.SURVIVED
}

export function calculateScore(killed, total) {
  return total ? (killed / total) * 100 : 100
}

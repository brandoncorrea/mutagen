/**
 * Mutation status classification and scoring.
 */

export const STATUS = {
  SURVIVED: 'survived',
  KILLED: 'killed',
  TIMEOUT: 'timeout'
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

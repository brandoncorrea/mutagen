/**
 * Mutation status classification and scoring.
 * Pure functions for categorizing and scoring mutation test results.
 */

export const STATUS = {
  SURVIVED: 'Survived',
  KILLED: 'Killed',
  KILLED_ERROR: 'Killed',
  TIMEOUT: 'Timeout',
  NO_COVERAGE: 'NoCoverage'
}

export function isKilled({ status }) {
  return status === STATUS.KILLED || status === STATUS.TIMEOUT
}

export function isAlive({ status }) {
  return status === STATUS.SURVIVED || status === STATUS.NO_COVERAGE
}

export function totalMutants({ killed, survived, noCoverage, timeout }) {
  return killed + survived + noCoverage + timeout
}

export function calculateScore(killed, total) {
  return total ? (killed / total) * 100 : 100
}

export function mutationScore(counts) {
  const total = totalMutants(counts)
  return calculateScore(counts.killed + counts.timeout, total)
}

export function countStatuses(merged) {
  const statuses = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 }
  for (const fileData of Object.values(merged.files))
    if (fileData.mutants)
      for (const mutant of fileData.mutants)
        accumulateStatus(statuses, mutant)
  return statuses
}

function accumulateStatus(statuses, { status }) {
  if (status === STATUS.KILLED)
    statuses.killed++
  else if (status === STATUS.SURVIVED)
    statuses.survived++
  else if (status === STATUS.NO_COVERAGE)
    statuses.noCoverage++
  else if (status === STATUS.TIMEOUT)
    statuses.timeout++
}

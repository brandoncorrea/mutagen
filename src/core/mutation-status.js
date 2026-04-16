/**
 * Mutation status classification and scoring.
 * Pure functions for categorizing and scoring mutation test results.
 */

export function isKilled({ status }) {
  return status === 'Killed' || status === 'Timeout'
}

export function isAlive({ status }) {
  return status === 'Survived' || status === 'NoCoverage'
}

export function totalMutants({ killed, survived, noCoverage, timeout }) {
  return killed + survived + noCoverage + timeout
}

export function mutationScore(counts) {
  const total = totalMutants(counts)
  return total ? (counts.killed + counts.timeout) / total * 100 : 100
}

export function countStatuses(merged) {
  const statuses = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 }
  for (const fileData of Object.values(merged.files))
    for (const mutant of fileData.mutants)
      accumulateStatus(statuses, mutant)
  return statuses
}

function accumulateStatus(statuses, { status }) {
  if (status === 'Killed')
    statuses.killed++
  else if (status === 'Survived')
    statuses.survived++
  else if (status === 'NoCoverage')
    statuses.noCoverage++
  else if (status === 'Timeout')
    statuses.timeout++
}

/**
 * Auto-diff: compare current mutation results against a previous report.
 * Produces a one-line summary for stderr after report writes.
 */

import { isKilled, isAlive } from '../core/mutation-status.js'

/**
 * Compare current file results against a previous report.
 * Returns a one-line summary, or null if no comparison possible.
 *
 * @param {Object|null} previousReport - previous report
 * @param {Object} currentFileResults - { [path]: { mutants: [...] } }
 * @returns {string|null}
 */
export function autoDiffSummary(previousReport, currentFileResults) {
  if (!previousReport) return null
  const prevSurvivorIds = collectSurvivorIds(previousReport)
  if (!prevSurvivorIds.size) return null
  const summary = compileSummary(prevSurvivorIds, currentFileResults)
  if (isUnchanged(summary)) return null
  return formatSummary(summary)
}

function collectSurvivorIds({ survivors }) {
  const ids = new Set()
  if (survivors)
    for (const { id } of survivors)
      if (id) ids.add(id)
  return ids
}

function compileSummary(prevSurvivorIds, currentFileResults) {
  const summary = {
    newlyKilled: 0,
    unchangedSurvivors: 0
  }

  for (const { mutants } of Object.values(currentFileResults))
    if (Array.isArray(mutants))
      for (const mutant of mutants)
        if (prevSurvivorIds.has(mutant.id))
          summarizeMutant(summary, mutant)

  return summary
}

function summarizeMutant(summary, mutant) {
  if (isKilled(mutant))
    summary.newlyKilled += 1
  else if (isAlive(mutant))
    summary.unchangedSurvivors += 1
}

function isUnchanged(summary) {
  return !summary.newlyKilled
    && !summary.unchangedSurvivors
}

function formatSummary({ newlyKilled, unchangedSurvivors }) {
  return [
    `+${newlyKilled} newly killed`,
    `${unchangedSurvivors} unchanged`
    + ` survivor${unchangedSurvivors !== 1 ? 's' : ''}`
  ].join(', ')
}

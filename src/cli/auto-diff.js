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
  const prevIds = buildPreviousIdMap(previousReport)
  if (!prevIds) return null
  const summary = compileSummary(prevIds, currentFileResults)
  if (isUnchanged(summary)) return null
  return formatSummary(summary)
}

function buildPreviousIdMap({ survivors }) {
  if (!survivors) return null
  const map = new Map()
  for (const { id } of survivors)
    if (id)
      map.set(id, 'survived')
  if (map.size) return map
}

function compileSummary(prevIds, currentFileResults) {
  const summary = {
    newlyKilled: 0,
    unchangedSurvivors: 0
  }

  for (const { mutants } of Object.values(currentFileResults))
    if (Array.isArray(mutants))
      for (const mutant of mutants)
        summarizeMutant(summary, prevIds, mutant)

  return summary
}

function summarizeMutant(summary, prevIds, mutant) {
  const prev = prevIds.get(mutant.id)
  if (prev !== 'survived') return
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
    `${unchangedSurvivors} unchanged` +
    ` survivor${unchangedSurvivors !== 1 ? 's' : ''}`
  ].join(', ')
}

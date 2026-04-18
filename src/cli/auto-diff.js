/**
 * Auto-diff: compare current mutation results against a previous report.
 * Produces a one-line summary for stderr after report writes.
 */

import { isKilled, isAlive } from '../core/mutation-status.js'

/**
 * Compare current file results against a previous report object.
 * Returns a one-line summary string, or null if no comparison is possible.
 *
 * @param {Object|null} previousReport - the previously saved report (legacy or structured format)
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

function buildPreviousIdMap(report) {
  return buildFromLegacyFormat(report)
    || buildFromStructuredFormat(report)
    || null
}

function buildFromLegacyFormat(report) {
  if (!report.files) return null
  const map = new Map()
  for (const fileData of Object.values(report.files)) {
    if (!Array.isArray(fileData.mutants)) continue
    for (const m of fileData.mutants)
      if (m.id) map.set(m.id, isAlive(m) ? 'survived' : 'killed')
  }
  return map.size > 0 ? map : null
}

function buildFromStructuredFormat(report) {
  if (!report.survivors) return null
  const map = new Map()
  for (const s of report.survivors)
    if (s.id) map.set(s.id, 'survived')
  return map.size > 0 ? map : null
}

function compileSummary(prevIds, currentFileResults) {
  const summary = {
    newlyKilled: 0,
    regressions: 0,
    unchangedSurvivors: 0
  }

  for (const { mutants } of Object.values(currentFileResults))
    for (const mutant of mutants)
      summarizeMutant(summary, prevIds, mutant)

  return summary
}

function summarizeMutant(summary, prevIds, mutant) {
  if (!mutant.id) return
  const prev = prevIds.get(mutant.id)
  if (prev === 'survived') {
    if (isKilled(mutant))
      summary.newlyKilled += 1
    else if (isAlive(mutant))
      summary.unchangedSurvivors += 1
  } else if (prev === 'killed' && isAlive(mutant)) {
    summary.regressions += 1
  }
}

function isUnchanged(summary) {
  return !summary.newlyKilled
    && !summary.regressions
    && !summary.unchangedSurvivors
}

function formatSummary({ newlyKilled, regressions, unchangedSurvivors }) {
  return [
    `+${newlyKilled} newly killed`,
    `${regressions} regression${regressions !== 1 ? 's' : ''}`,
    `${unchangedSurvivors} unchanged survivor${unchangedSurvivors !== 1 ? 's' : ''}`
  ].join(', ')
}

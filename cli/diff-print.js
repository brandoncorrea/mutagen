/**
 * Display formatting for mutation diff reports.
 */

import { countStatuses, totalMutants, mutationScore, isAlive, HEADER_SEPARATOR } from '../core/report-data.js'

export function printDiffReport({ beforeFile, afterFile, before, after }, changes, fileDeltas, out) {
  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTATION DIFF`)
  out(`${HEADER_SEPARATOR}`)
  out(`Before: ${beforeFile}`)
  out(`After:  ${afterFile}\n`)

  printDiffSummary(out, before, after)
  printCategory(out, '✓ NEWLY KILLED', changes.newlyKilled)
  printCategory(out, '✗ REGRESSIONS', changes.regressions)
  printNewMutants(out, changes.newMutants)
  printRemovedMutants(out, changes.removedMutants)
  printFileDeltas(out, fileDeltas)
  out(`\n${HEADER_SEPARATOR}\n`)
}

function printDiffSummary(out, before, after) {
  const bCounts = countStatuses(before)
  const aCounts = countStatuses(after)
  const bTotal = totalMutants(bCounts)
  const aTotal = totalMutants(aCounts)
  const bScore = mutationScore(bCounts)
  const aScore = mutationScore(aCounts)
  const delta = aScore - bScore

  out(`Overall: ${formatTenth(bScore)}% → ${formatTenth(aScore)}% (${formatSigned(delta)}%)`)
  out(`Mutations: ${bTotal} → ${aTotal}`)
  out(`Killed: ${bCounts.killed} → ${aCounts.killed}  |  Survived: ${bCounts.survived} → ${aCounts.survived}`)
}

function printCategory(out, label, results) {
  if (!results.length) return
  out(`\n${label} (${results.length})`)
  for (const { after: a } of results)
    out(`  ${a.file}:${a.line} ${a.mutatorName}`)
}

function printNewMutants(out, newMutants) {
  if (!newMutants.length) return
  const newSurvived = newMutants.filter(isAlive)
  const newKilled = newMutants.length - newSurvived.length
  out(`\n+ NEW MUTANTS: ${newMutants.length} (${newKilled} killed, ${newSurvived.length} survived)`)
  if (newSurvived.length)
    for (const { file, line, mutatorName } of newSurvived)
      out(`  ${file}:${line} ${mutatorName} — SURVIVED`)
}

function printRemovedMutants(out, removedMutants) {
  const total = removedMutants.length
  if (total)
    out(`\n- REMOVED MUTANTS: ${total}`)
}

function printFileDeltas(out, fileDeltas) {
  if (!fileDeltas.length) return
  fileDeltas.sort((a, b) => b.delta - a.delta)
  out(`\nPER-FILE CHANGES:`)
  fileDeltas.forEach(d => printFileDelta(out, d))
}

function printFileDelta(out, { label, file, after, before, delta }) {
  if (label === 'NEW')
    out(`  ${file}: NEW (${formatTenth(after)}%)`)
  else if (label === 'REMOVED')
    out(`  ${file}: REMOVED (was ${formatTenth(before)}%)`)
  else
    out(`  ${file}: ${formatTenth(before)}% → ${formatTenth(after)}% (${formatSigned(delta)}%)`)
}

export function formatTenth(value) {
  return value.toFixed(1)
}

export function formatSigned(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}`
}

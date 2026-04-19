/**
 * Display formatting for mutation diff reports.
 */

import { countStatuses, totalMutants, mutationScore, isAlive } from '../core/mutation-status.js'
import { HEADER_SEPARATOR } from '../core/report-data.js'

export function printDiffReport({ beforeFile, afterFile, before, after }, changes, fileDeltas, out) {
  out.log(`\n${HEADER_SEPARATOR}`)
  out.log(`MUTATION DIFF`)
  out.log(`${HEADER_SEPARATOR}`)
  out.log(`Before: ${beforeFile}`)
  out.log(`After:  ${afterFile}\n`)

  printDiffSummary(out, before, after)
  printCategory(out, '✓ NEWLY KILLED', changes.newlyKilled)
  printCategory(out, '✗ REGRESSIONS', changes.regressions)
  printNewMutants(out, changes.newMutants)
  printRemovedMutants(out, changes.removedMutants)
  printFileDeltas(out, fileDeltas)
  out.log(`\n${HEADER_SEPARATOR}\n`)
}

function printDiffSummary(out, before, after) {
  const bCounts = countStatuses(before)
  const aCounts = countStatuses(after)
  const bTotal = totalMutants(bCounts)
  const aTotal = totalMutants(aCounts)
  const bScore = mutationScore(bCounts)
  const aScore = mutationScore(aCounts)
  const delta = aScore - bScore

  out.log(`Overall: ${formatTenth(bScore)}% → ${formatTenth(aScore)}% (${formatSigned(delta)}%)`)
  out.log(`Mutations: ${bTotal} → ${aTotal}`)
  out.log(`Killed: ${bCounts.killed} → ${aCounts.killed}  |  Survived: ${bCounts.survived} → ${aCounts.survived}`)
}

function printCategory(out, label, results) {
  if (!results.length) return
  out.log(`\n${label} (${results.length})`)
  for (const { after } of results)
    out.log(`  ${after.file}:${after.line} ${after.mutatorName}`)
}

function printNewMutants(out, newMutants) {
  if (!newMutants.length) return
  const newSurvived = newMutants.filter(isAlive)
  const newKilled = newMutants.length - newSurvived.length
  out.log(`\n+ NEW MUTANTS: ${newMutants.length} (${newKilled} killed, ${newSurvived.length} survived)`)
  for (const { file, line, mutatorName } of newSurvived)
    out.log(`  ${file}:${line} ${mutatorName} — SURVIVED`)
}

function printRemovedMutants(out, removedMutants) {
  if (!removedMutants.length) return
  out.log(`\n- REMOVED MUTANTS: ${removedMutants.length}`)
}

function printFileDeltas(out, fileDeltas) {
  if (!fileDeltas.length) return
  fileDeltas.sort((a, b) => b.delta - a.delta)
  out.log(`\nPER-FILE CHANGES:`)
  for (const d of fileDeltas)
    printFileDelta(out, d)
}

function printFileDelta(out, { label, file, after, before, delta }) {
  if (label === 'NEW')
    out.log(`  ${file}: NEW (${formatTenth(after)}%)`)
  else if (label === 'REMOVED')
    out.log(`  ${file}: REMOVED (was ${formatTenth(before)}%)`)
  else
    out.log(`  ${file}: ${formatTenth(before)}% → ${formatTenth(after)}% (${formatSigned(delta)}%)`)
}

function formatSigned(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${formatTenth(value)}`
}

function formatTenth(value) {
  return value.toFixed(1)
}

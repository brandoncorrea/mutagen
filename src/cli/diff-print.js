/**
 * Display formatting for mutation diff reports.
 */

import {
  countStatuses, totalMutants, mutationScore, isAlive
} from '../core/mutation-status.js'
import { HEADER_SEPARATOR } from '../core/report-data.js'

export function printDiffReport(
  { beforeFile, afterFile, before, after },
  changes, fileDeltas, out
) {
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

  out.log(
    `Overall: ${bScore.toFixed(1)}%` +
    ` → ${aScore.toFixed(1)}% (${formatSigned(delta)}%)`
  )
  out.log(`Mutations: ${bTotal} → ${aTotal}`)
  out.log(
    `Killed: ${bCounts.killed} → ${aCounts.killed}` +
    `  |  Survived: ${bCounts.survived} → ${aCounts.survived}`
  )
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
  out.log(
    `\n+ NEW MUTANTS: ${newMutants.length}` +
    ` (${newKilled} killed, ${newSurvived.length} survived)`
  )
  for (const { file, line, mutatorName } of newSurvived)
    out.log(`  ${file}:${line} ${mutatorName} — SURVIVED`)
}

function printRemovedMutants(out, removedMutants) {
  if (removedMutants.length)
    out.log(`\n- REMOVED MUTANTS: ${removedMutants.length}`)
}

function printFileDeltas(out, fileDeltas) {
  if (!fileDeltas.length) return
  fileDeltas.sort((a, b) => b.delta - a.delta)
  out.log(`\nPER-FILE CHANGES:`)
  for (const delta of fileDeltas)
    printFileDelta(out, delta)
}

function printFileDelta(out, { label, file, after, before, delta }) {
  if (label === 'NEW')
    out.log(`  ${file}: NEW (${after.toFixed(1)}%)`)
  else if (label === 'REMOVED')
    out.log(`  ${file}: REMOVED (was ${before.toFixed(1)}%)`)
  else
    out.log(
      `  ${file}: ${before.toFixed(1)}%` +
      ` → ${after.toFixed(1)}% (${delta.toFixed(1)}%)`
    )
}

function formatSigned(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}`
}

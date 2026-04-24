/**
 * Display formatting for mutation diff reports.
 */

import { isKilled, isAlive, calculateScore } from '../core/mutation-status.js'
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
  const bStats = countReport(before)
  const aStats = countReport(after)
  const delta = aStats.score - bStats.score

  out.log(
    `Overall: ${bStats.score.toFixed(1)}%`
    + ` → ${aStats.score.toFixed(1)}% (${formatSigned(delta)}%)`
  )
  out.log(`Mutations: ${bStats.total} → ${aStats.total}`)
  out.log(
    `Killed: ${bStats.killed} → ${aStats.killed}`
    + `  |  Survived: ${bStats.survived} → ${aStats.survived}`
  )
}

function countReport(report) {
  let killed = 0
  let survived = 0
  for (const fileData of Object.values(report.files)) {
    if (fileData.mutants) {
      for (const mutant of fileData.mutants) {
        if (isKilled(mutant)) killed++
        else if (isAlive(mutant)) survived++
      }
    } else {
      killed += fileData.killed || 0
      survived += (fileData.total || 0) - (fileData.killed || 0)
    }
  }
  const total = killed + survived
  return { killed, survived, total, score: calculateScore(killed, total) }
}

function printCategory(out, label, results) {
  if (!results.length) return
  out.log(`\n${label} (${results.length})`)
  for (const { after } of results)
    out.log(`  ${after.file}:${after.line} ${after.name}`)
}

function printNewMutants(out, newMutants) {
  if (!newMutants.length) return
  const newSurvived = newMutants.filter(isAlive)
  const newKilled = newMutants.length - newSurvived.length
  out.log(
    `\n+ NEW MUTANTS: ${newMutants.length}`
    + ` (${newKilled} killed, ${newSurvived.length} survived)`
  )
  for (const { file, line, name } of newSurvived)
    out.log(`  ${file}:${line} ${name} — SURVIVED`)
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
      `  ${file}: ${before.toFixed(1)}%`
      + ` → ${after.toFixed(1)}% (${delta.toFixed(1)}%)`
    )
}

function formatSigned(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}`
}

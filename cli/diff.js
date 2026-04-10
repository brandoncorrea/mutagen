/**
 * Cross-run mutation report comparison and merging.
 * Compare two reports to find regressions, improvements, and new mutants.
 */

import { mutantKey, countStatuses, totalMutants, mutationScore, isKilled, isAlive, SEPARATOR, tryLoadJson } from '../core/report-data.js'

/**
 * Diff two mutation reports and print a summary of changes.
 * @param {string} beforeFile - path to the baseline report JSON
 * @param {string} afterFile - path to the new report JSON
 */
export function diffReports(beforeFile, afterFile, out = console.log) {
  const before = tryLoadJson(beforeFile, out)
  const after = tryLoadJson(afterFile, out)

  if (!before || !after) return null

  const changes = classifyChanges(before, after)
  const fileDeltas = computeFileDeltas(before, after)

  printDiffReport({ beforeFile, afterFile, before, after }, changes, fileDeltas, out)

  return {
    newlyKilled: changes.newlyKilled.length,
    regressions: changes.regressions.length,
    newMutants: changes.newMutants.length,
    removedMutants: changes.removedMutants.length
  }
}

function classifyChanges(beforeData, afterData) {
  const beforeMap = buildMutantMap(beforeData)
  const afterMap = buildMutantMap(afterData)
  const allKeys = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])
  const changes = {
    newlyKilled: [],
    regressions: [],
    newMutants: [],
    removedMutants: []
  }

  for (const key of allKeys)
    classifyChange(changes, beforeMap, afterMap, key)

  return changes
}

function classifyChange(changes, beforeMap, afterMap, key) {
  const before = beforeMap[key]
  const after = afterMap[key]

  if (!before) {
    changes.newMutants.push(after)
  } else if (!after) {
    changes.removedMutants.push(before)
  } else {
    const bAlive = isAlive(before)
    const aAlive = isAlive(after)
    if (bAlive && !aAlive)
      changes.newlyKilled.push({ before, after })
    else if (!bAlive && aAlive)
      changes.regressions.push({ before, after })
  }
}

function computeFileDeltas(before, after) {
  const beforeScores = fileScores(before)
  const afterScores = fileScores(after)
  const allFiles = new Set([
    ...Object.keys(beforeScores),
    ...Object.keys(afterScores)
  ])

  return Array.from(allFiles)
    .map(file => computeFileDelta(beforeScores, afterScores, file))
    .filter(Boolean)
}

function computeFileDelta(beforeScores, afterScores, file) {
  const bs = beforeScores[file]
  const as = afterScores[file]
  const before = bs?.score
  const after = as?.score
  if (!bs)
    return { file, after, delta: 0, label: 'NEW' }
  else if (!as)
    return { file, before, delta: 0, label: 'REMOVED' }

  const delta = after - before
  if (Math.abs(delta) > 0.05)
    return { file, before, after, delta }
}

function printDiffReport({ beforeFile, afterFile, before, after }, changes, fileDeltas, out) {
  out(`\n${SEPARATOR}`)
  out(`MUTATION DIFF`)
  out(`${SEPARATOR}`)
  out(`Before: ${beforeFile}`)
  out(`After:  ${afterFile}\n`)

  printDiffSummary(out, before, after)
  printCategory(out, '✓ NEWLY KILLED', changes.newlyKilled)
  printCategory(out, '✗ REGRESSIONS', changes.regressions)
  printNewMutants(out, changes.newMutants)
  printRemovedMutants(out, changes.removedMutants)
  printFileDeltas(out, fileDeltas)
  out(`\n${SEPARATOR}\n`)
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

function formatTenth(value) {
  return value.toFixed(1)
}

function formatSigned(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}`
}

function buildMutantMap(report) {
  const map = {}
  for (const [path, fileData] of Object.entries(report.files)) {
    for (const m of fileData.mutants) {
      const key = m.id || mutantKey(path, m)
      map[key] = {
        ...m,
        file: path,
        line: m.location?.start?.line || 0
      }
    }
  }
  return map
}

function fileScores(report) {
  const scores = {}
  for (const [path, { mutants }] of Object.entries(report.files)) {
    const total = mutants.length
    const killed = mutants.filter(isKilled).length
    const score = total ? (killed / total * 100) : 100
    scores[path] = { killed, total, score }
  }
  return scores
}


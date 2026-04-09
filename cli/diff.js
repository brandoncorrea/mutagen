/**
 * Cross-run mutation report comparison and merging.
 * Compare two reports to find regressions, improvements, and new mutants.
 */

import { readFileSync } from 'node:fs'

import { mutantKey, countStatuses, SEPARATOR } from './report.js'

export function combineReportData(files) {
  const mergedFiles = {}
  const seen = new Set()
  let duplicates = 0

  const filesFromJson = files
    .map(tryLoadJson)
    .filter(Boolean)
    .flatMap(({ files }) => Object.entries(files))

  for (const [path, fileData] of filesFromJson) {
    if (!mergedFiles[path])
      mergedFiles[path] = { ...fileData, mutants: [] }
    for (const mut of fileData.mutants) {
      const key = mutantKey(path, mut)
      if (seen.has(key)) {
        duplicates++
      } else {
        seen.add(key)
        mergedFiles[path].mutants.push(mut)
      }
    }
  }

  if (duplicates > 0)
    console.log(`  Deduplicated: ${duplicates} duplicate mutant(s) removed`)

  return {
    files: mergedFiles,
    schemaVersion: '1',
    thresholds: { high: 80, low: 60 }
  }
}

/**
 * Diff two mutation reports and print a summary of changes.
 * @param {string} beforeFile - path to the baseline report JSON
 * @param {string} afterFile - path to the new report JSON
 */
export function diffReports(beforeFile, afterFile) {
  const before = loadJson(beforeFile)
  const after = loadJson(afterFile)

  const changes = classifyChanges(before, after)
  const fileDeltas = computeFileDeltas(before, after)

  printDiffReport(beforeFile, afterFile, before, after, changes, fileDeltas)

  return {
    newlyKilled: changes.newlyKilled.length,
    regressions: changes.regressions.length,
    newMutants: changes.newMutants.length,
    removedMutants: changes.removedMutants.length
  }
}

function tryLoadJson(file) {
  try {
    return loadJson(file)
  } catch (err) {
    console.log(`  Warning: could not read ${file}: ${err.message}`)
  }
}

function loadJson(file) {
  return JSON.parse(readFileSync(file, 'utf-8'))
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
    const bAlive = isAlive(before.status)
    const aAlive = isAlive(after.status)
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

function printDiffReport(beforeFile, afterFile, before, after, changes, fileDeltas) {
  console.log(`\n${SEPARATOR}`)
  console.log(`MUTATION DIFF`)
  console.log(`${SEPARATOR}`)
  console.log(`Before: ${beforeFile}`)
  console.log(`After:  ${afterFile}\n`)

  printSummary(before, after)
  printCategory('✓ NEWLY KILLED', changes.newlyKilled)
  printCategory('✗ REGRESSIONS', changes.regressions)
  printNewMutants(changes.newMutants)
  printRemovedMutants(changes.removedMutants)
  printFileDeltas(fileDeltas)
  console.log(`\n${SEPARATOR}\n`)
}

function printSummary(before, after) {
  const bCounts = countStatuses(before)
  const aCounts = countStatuses(after)
  const bTotal = totalCounts(bCounts)
  const aTotal = totalCounts(aCounts)
  const bScore = scoreCounts(bCounts, bTotal)
  const aScore = scoreCounts(aCounts, aTotal)
  const delta = aScore - bScore

  console.log(`Overall: ${formatTenth(bScore)}% → ${formatTenth(aScore)}% (${formatSigned(delta)}%)`)
  console.log(`Mutations: ${bTotal} → ${aTotal}`)
  console.log(`Killed: ${bCounts.killed} → ${aCounts.killed}  |  Survived: ${bCounts.survived} → ${aCounts.survived}`)
}

function printCategory(label, results) {
  if (!results.length) return
  console.log(`\n${label} (${results.length})`)
  for (const { after: a } of results)
    console.log(`  ${a.file}:${a.line} ${a.mutatorName}`)
}

function printNewMutants(newMutants) {
  if (!newMutants.length) return
  const newSurvived = newMutants.filter(m => isAlive(m.status))
  const newKilled = newMutants.length - newSurvived.length
  console.log(`\n+ NEW MUTANTS: ${newMutants.length} (${newKilled} killed, ${newSurvived.length} survived)`)
  if (newSurvived.length > 0)
    for (const { file, line, mutatorName } of newSurvived)
      console.log(`  ${file}:${line} ${mutatorName} — SURVIVED`)
}

function printRemovedMutants(removedMutants) {
  const total = removedMutants.length
  if (total)
    console.log(`\n- REMOVED MUTANTS: ${total}`)
}

function printFileDeltas(fileDeltas) {
  if (!fileDeltas.length) return
  fileDeltas.sort((a, b) => b.delta - a.delta)
  console.log(`\nPER-FILE CHANGES:`)
  fileDeltas.forEach(printFileDelta)
}

function printFileDelta({ label, file, after, before, delta }) {
  if (label === 'NEW')
    console.log(`  ${file}: NEW (${formatTenth(after)}%)`)
  else if (label === 'REMOVED')
    console.log(`  ${file}: REMOVED (was ${formatTenth(before)}%)`)
  else
    console.log(`  ${file}: ${formatTenth(before)}% → ${formatTenth(after)}% (${formatSigned(delta)}%)`)
}

function formatTenth(value) {
  return value.toFixed(1)
}

function formatSigned(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}`
}

function scoreCounts(counts, total) {
  if (total > 0)
    return (counts.killed + counts.timeout) / total * 100
  return 100
}

function totalCounts({ killed, survived, noCoverage, timeout }) {
  return killed + survived + noCoverage + timeout
}

function buildMutantMap(report) {
  const map = {}
  for (const [path, fileData] of Object.entries(report.files)) {
    for (const m of fileData.mutants) {
      const key = m.id || mutantKey(path, m)
      map[key] = { ...m, file: path, line: m.location?.start?.line || 0 }
    }
  }
  return map
}

function fileScores(report) {
  const scores = {}
  for (const [path, { mutants }] of Object.entries(report.files)) {
    const total = mutants.length
    const killed = mutants.filter(isKilled).length
    const score = total > 0 ? (killed / total * 100) : 100
    scores[path] = { killed, total, score }
  }
  return scores
}

function isKilled(mutation) {
  return mutation.status === 'Killed' || mutation.status === 'Timeout'
}

function isAlive(status) {
  return status === 'Survived' || status === 'NoCoverage'
}
/**
 * Cross-run mutation report comparison and merging.
 * Compare two reports to find regressions, improvements, and new mutants.
 */

import { mutantKey, isKilled, isAlive, tryLoadJson, countStatuses, mutationScore } from '../core/report-data.js'
import { printDiffReport } from './diff-print.js'

/**
 * Diff two mutation reports and print a summary of changes.
 * @param {string} beforeFile - path to the baseline report JSON
 * @param {string} afterFile - path to the new report JSON
 * @param {Function} [out=console.log] - output function
 * @param {boolean} [jsonOutput=false] - when true, output structured JSON instead of text
 */
export function diffReports(beforeFile, afterFile, out = console.log, jsonOutput = false) {
  const before = tryLoadJson(beforeFile, out)
  const after = tryLoadJson(afterFile, out)

  if (!before?.files || !after?.files) return

  const changes = classifyChanges(before, after)
  const fileDeltas = computeFileDeltas(before, after)

  if (jsonOutput)
    printJsonDiff(before, after, changes, fileDeltas, out)
  else
    printDiffReport({ beforeFile, afterFile, before, after }, changes, fileDeltas, out)

  return {
    newlyKilled: changes.newlyKilled.length,
    regressions: changes.regressions.length,
    newMutants: changes.newMutants.length,
    removedMutants: changes.removedMutants.length
  }
}

function printJsonDiff(before, after, changes, fileDeltas, out) {
  const bCounts = countStatuses(before)
  const aCounts = countStatuses(after)
  const beforeScore = mutationScore(bCounts)
  const afterScore = mutationScore(aCounts)

  const fileDeltaMap = {}
  for (const delta of fileDeltas)
    fileDeltaMap[delta.file] = {
      before: delta.before ?? null,
      after: delta.after ?? null,
      delta: delta.delta
    }

  out(JSON.stringify({
    beforeScore,
    afterScore,
    delta: afterScore - beforeScore,
    newlyKilled: changes.newlyKilled.map(({ after }) => formatMutant(after)),
    regressions: changes.regressions.map(({ after }) => formatMutant(after)),
    newMutants: changes.newMutants.map(formatMutant),
    removedMutants: changes.removedMutants.map(formatMutant),
    fileDeltas: fileDeltaMap
  }, null, 2))
}

function formatMutant({ id, file, line, mutatorName, status }) {
  return { id, file, line, mutatorName, status }
}

function classifyChanges(beforeData, afterData) {
  const beforeMap = buildMutantMap(beforeData)
  const afterMap = buildMutantMap(afterData)
  const allKeys = new Set([
    ...Object.keys(beforeMap),
    ...Object.keys(afterMap)
  ])
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
    const beforeAlive = isAlive(before)
    const afterAlive = isAlive(after)
    if (beforeAlive && !afterAlive)
      changes.newlyKilled.push({ before, after })
    else if (!beforeAlive && afterAlive)
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
  const beforeScore = beforeScores[file]
  const afterScore = afterScores[file]
  const before = beforeScore?.score
  const after = afterScore?.score
  if (!beforeScore)
    return { file, after, delta: 0, label: 'NEW' }
  else if (!afterScore)
    return { file, before, delta: 0, label: 'REMOVED' }

  const delta = after - before
  if (Math.abs(delta) > 0.05)
    return { file, before, after, delta }
}

function buildMutantMap(report) {
  const map = {}
  for (const [path, fileData] of Object.entries(report.files)) {
    for (const mutant of fileData.mutants) {
      const key = mutant.id || mutantKey(path, mutant)
      map[key] = {
        ...mutant,
        file: path,
        line: mutant.location?.start?.line || 0
      }
    }
  }
  return map
}

function fileScores(report) {
  const scores = {}
  for (const [path, { mutants }] of Object.entries(report.files))
    scores[path] = evaluateMutants(mutants)
  return scores
}

function evaluateMutants(mutants) {
  const total = mutants.length
  const killed = mutants.filter(isKilled).length
  const score = total ? (killed / total * 100) : 100
  return { killed, total, score }
}

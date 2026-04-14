/**
 * Cross-run mutation report comparison and merging.
 * Compare two reports to find regressions, improvements, and new mutants.
 */

import { mutantKey, isKilled, isAlive, tryLoadJson } from '../core/report-data.js'
import { printDiffReport } from './diff-print.js'

/**
 * Diff two mutation reports and print a summary of changes.
 * @param {string} beforeFile - path to the baseline report JSON
 * @param {string} afterFile - path to the new report JSON
 */
export function diffReports(beforeFile, afterFile, out = console.log) {
  const before = tryLoadJson(beforeFile, out)
  const after = tryLoadJson(afterFile, out)

  if (!before || !after) return

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
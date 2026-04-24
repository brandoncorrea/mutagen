/**
 * Shared data utilities for mutation reports.
 *
 * Mutation identity (mutationId) → core/mutation-id.js
 * Mutation status (isKilled, isAlive, scoring) → core/mutation-status.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'

import { mutationId } from './mutation-id.js'
import { STATUS, isKilled, isAlive, calculateScore } from './mutation-status.js'

const SEPARATOR_WIDTH = 60

export const HEADER_SEPARATOR = '═'.repeat(SEPARATOR_WIDTH)
export const SECTION_SEPARATOR = '─'.repeat(SEPARATOR_WIDTH)

export function tryLoadJson(path, out) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    if (out)
      out.log(`Warning: could not read ${path}: ${err.message}`)
  }
}

export function toJsonMutants(sourceFile, results, { survivorsOnly } = {}) {
  const relPath = relative(process.cwd(), sourceFile)

  const mutants = survivorsOnly
    ? results.survived.map(mutation => toMutant(relPath, mutation, STATUS.SURVIVED))
    : [
      ...results.killed.map(mutation => toMutant(relPath, mutation, STATUS.KILLED)),
      ...results.survived.map(mutation => toMutant(relPath, mutation, STATUS.SURVIVED)),
      ...(results.timedOut || []).map(mutation => toMutant(relPath, mutation, STATUS.TIMEOUT))
    ]

  return { path: relPath, mutants }
}

/**
 * Pure computation: build a structured report from file results.
 * Returns both the full report object and summary stats.
 *
 * @param {Object} fileResults - { [path]: { mutants: [...] } }
 * @param {Object} [deltas] - incremental deltas
 * @returns {{ report, stats }}
 */
export function buildStructuredReport(fileResults, deltas) {
  const {
    files, survivors, totalKilled, totalSurvived, totalTimedOut
  } = collectStats(fileResults)
  const total = totalKilled + totalSurvived
  const score = calculateScore(totalKilled, total)
  const stats = {
    score: roundToOneDecimal(score),
    total,
    killed: totalKilled,
    survived: totalSurvived,
    timedOut: totalTimedOut
  }

  return {
    report: {
      ...stats,
      files,
      survivors,
      ...(deltas && { deltas })
    },
    stats
  }
}

/**
 * Build a structured report from file results and write to outputPath.
 * Returns computed stats for callers that need to display a summary.
 *
 * @param {string} outputPath - path to write the JSON report
 * @param {Object} fileResults - { [path]: { mutants: [...] } }
 * @param {Object} [deltas] - incremental deltas
 * @returns {{ score, total, killed, survived, timedOut }}
 */
export function writeStructuredReportFile(outputPath, fileResults, deltas, extra) {
  const { report, stats } = buildStructuredReport(fileResults, deltas)
  const absPath = resolve(outputPath)
  mkdirSync(dirname(absPath), { recursive: true })
  const output = extra ? { ...report, ...extra } : report
  writeFileSync(absPath, JSON.stringify(output, null, 2))
  return stats
}

function collectStats(fileResults) {
  const stats = {
    totalKilled: 0,
    totalSurvived: 0,
    totalTimedOut: 0,
    files: {},
    survivors: []
  }

  for (const entry of Object.entries(fileResults))
    collectStat(stats, entry)

  return stats
}

function collectStat(stats, [path, fileData]) {
  if (!fileData.mutants) {
    stats.totalKilled += fileData.killed || 0
    stats.files[path] = {
      score: fileData.score ?? 100,
      killed: fileData.killed || 0,
      total: fileData.total || 0
    }
    return
  }
  const tally = tallyFileMutants(path, fileData.mutants)
  stats.totalKilled += tally.killed
  stats.totalSurvived += tally.survived
  stats.totalTimedOut += tally.timedOut
  stats.survivors.push(...tally.survivors)
  stats.files[path] = {
    score: tally.score,
    killed: tally.killed,
    total: tally.total,
    mutants: fileData.mutants
  }
}

function tallyFileMutants(path, mutants) {
  const tallies = {
    killed: 0,
    timedOut: 0,
    survived: 0,
    survivors: []
  }

  for (const mutant of mutants)
    tallyMutant(tallies, path, mutant)

  const total = mutants.length
  const score = calculateScore(tallies.killed, total)
  return {
    ...tallies,
    score: roundToOneDecimal(score),
    total
  }
}

function tallyMutant(tallies, path, mutant) {
  if (isKilled(mutant)) {
    tallies.killed++
    if (mutant.status === STATUS.TIMEOUT)
      tallies.timedOut++
  } else if (isAlive(mutant)) {
    tallies.survived++
    tallies.survivors.push(toSurvivor(path, mutant))
  }
}

function toSurvivor(file, mutation) {
  const { location, mutatorName, description, coveredBy } = mutation
  const line = location?.start?.line || 0
  return {
    id: mutationId(file, line, mutatorName),
    file,
    line,
    name: mutatorName,
    original: extractDescription(description, 0),
    mutated: extractDescription(description, 1),
    ...(coveredBy?.length && { coveredBy })
  }
}

function roundToOneDecimal(n) {
  return parseFloat(n.toFixed(1))
}

function extractDescription(description, index) {
  return description?.split(' → ')[index] || ''
}

function toMutant(relPath, mutation, status) {
  const { line, name, original, mutated, killedBy, coveredBy } = mutation
  return {
    id: mutationId(relPath, line, name),
    mutatorName: name,
    status,
    location: {
      start: { line, column: 0 },
      end: { line, column: 0 }
    },
    description: `${original} → ${mutated}`,
    ...(killedBy?.length && { killedBy }),
    ...(coveredBy?.length && { coveredBy })
  }
}

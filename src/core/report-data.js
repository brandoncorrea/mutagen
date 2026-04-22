/**
 * Shared data utilities for mutation reports.
 * Used by CLI, Stryker integration, and diff/incremental modules.
 *
 * Mutation identity (mutationId, mutantKey) → core/mutation-id.js
 * Mutation status (isKilled, isAlive, scoring) → core/mutation-status.js
 */

const SEPARATOR_WIDTH = 60

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'

import { mutationId, mutantKey } from './mutation-id.js'
import { STATUS, isKilled, isAlive } from './mutation-status.js'

export const HEADER_SEPARATOR = '═'.repeat(SEPARATOR_WIDTH)
export const SECTION_SEPARATOR = '─'.repeat(SEPARATOR_WIDTH)

export function createReport(files, extra) {
  return {
    schemaVersion: '1',
    thresholds: { high: 80, low: 60 },
    files,
    ...extra
  }
}

export function writeReportFile(reportDir, reportPath, report, out) {
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  out?.log(`JSON report: ${reportPath}`)
}

export function tryLoadJson(path, out) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    if (out)
      out.log(`Warning: could not read ${path}: ${err.message}`)
  }
}

export function combineReportData(reports, out) {
  const entries = loadAllEntries(reports, out)
  const { mergedFiles, duplicates } = deduplicateMutants(entries)

  if (duplicates)
    out.log(`  Deduplicated: ${duplicates} duplicate mutant(s) removed`)

  return createReport(mergedFiles)
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
  const score = total ? (totalKilled / total) * 100 : 100
  const stats = {
    score: round1(score),
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
  const score = total ? (tallies.killed / total) * 100 : 100
  return {
    ...tallies,
    score: round1(score),
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

function round1(n) {
  return Math.round(n * 10) / 10
}

function extractDescription(description, index) {
  return description?.split(' → ')[index] || ''
}

function loadAllEntries(reports, out) {
  return reports
    .map(filePath => tryLoadJson(filePath, out))
    .filter(Boolean)
    .flatMap(({ files }) => Object.entries(files))
}

function deduplicateMutants(entries) {
  const mergedFiles = {}
  const seen = new Set()
  let duplicates = 0

  for (const [path, fileData] of entries) {
    if (!mergedFiles[path])
      mergedFiles[path] = { ...fileData, mutants: [] }
    for (const mutant of fileData.mutants) {
      const key = mutantKey(path, mutant)
      if (seen.has(key)) {
        duplicates++
      } else {
        seen.add(key)
        mergedFiles[path].mutants.push(mutant)
      }
    }
  }

  return { mergedFiles, duplicates }
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

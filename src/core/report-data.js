/**
 * Shared data utilities for mutation reports.
 * Used by CLI, Stryker integration, and diff/incremental modules.
 *
 * Mutation identity (mutationId, mutantKey) → core/mutation-id.js
 * Mutation status (isKilled, isAlive, scoring) → core/mutation-status.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'

import { mutationId, mutantKey } from './mutation-id.js'
import { isKilled, isAlive } from './mutation-status.js'

export const HEADER_SEPARATOR = '═'.repeat(60)
export const SECTION_SEPARATOR = '─'.repeat(60)

export function createReport(files, extra) {
  return {
    schemaVersion: '1',
    thresholds: { high: 80, low: 60 },
    files,
    ...extra
  }
}

export function writeReportFile(reportDir, reportPath, report, out = console.log) {
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  out(`JSON report: ${reportPath}`)
}

export function tryLoadJson(path, out) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    if (out)
      out(`Warning: could not read ${path}: ${err.message}`)
  }
}

export function combineReportData(reports, out = console.log) {
  const { mergedFiles, duplicates } = deduplicateMutants(loadAllEntries(reports, out))

  if (duplicates)
    out(`  Deduplicated: ${duplicates} duplicate mutant(s) removed`)

  return createReport(mergedFiles)
}

export function toJsonMutants(sourceFile, results, { survivorsOnly } = {}) {
  const relPath = relative(process.cwd(), sourceFile)

  const mutants = survivorsOnly
    ? results.survived.map(m => toMutant(relPath, m, 'Survived'))
    : [
      ...results.killed.map(m => toMutant(relPath, m, 'Killed')),
      ...results.survived.map(m => toMutant(relPath, m, 'Survived')),
      ...(results.timedOut || []).map(m => toMutant(relPath, m, 'Timeout'))
    ]

  return { path: relPath, mutants }
}

/**
 * Build a structured report from file results and write to outputPath.
 * Returns computed stats for callers that need to display a summary.
 *
 * @param {string} outputPath - path to write the JSON report
 * @param {Object} fileResults - { [path]: { mutants: [...] } }
 * @param {Object} [deltas] - incremental deltas (fixes, regressions, rerunFiles, cachedFiles)
 * @returns {{ score: number, total: number, killed: number, survived: number, timedOut: number }}
 */
export function writeStructuredReportFile(outputPath, fileResults, deltas) {
  const { files, survivors, totalKilled, totalSurvived, totalTimedOut } = collectStats(fileResults)
  const total = totalKilled + totalSurvived
  const score = total ? (totalKilled / total) * 100 : 100

  const report = {
    score: round1(score),
    total,
    killed: totalKilled,
    survived: totalSurvived,
    timedOut: totalTimedOut,
    files,
    survivors,
    ...(deltas && { deltas })
  }

  const absPath = resolve(outputPath)
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, JSON.stringify(report, null, 2))

  return {
    score: round1(score),
    total,
    killed: totalKilled,
    survived: totalSurvived,
    timedOut: totalTimedOut
  }
}

function collectStats(fileResults) {
  let totalKilled = 0
  let totalSurvived = 0
  let totalTimedOut = 0
  const files = {}
  const survivors = []

  for (const [path, fileData] of Object.entries(fileResults)) {
    const mutants = fileData.mutants
    let fileKilled = 0

    for (const mutant of mutants) {
      if (isKilled(mutant)) {
        fileKilled++
        totalKilled++
        if (mutant.status === 'Timeout') totalTimedOut++
      } else if (isAlive(mutant)) {
        totalSurvived++
        survivors.push(toSurvivor(path, mutant))
      }
    }

    const fileTotal = mutants.length
    const fileScore = fileTotal ? (fileKilled / fileTotal) * 100 : 100
    files[path] = { score: round1(fileScore), killed: fileKilled, total: fileTotal }
  }

  return { files, survivors, totalKilled, totalSurvived, totalTimedOut }
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
  if (!description) return ''
  return description.split(' → ')[index] || ''
}

function loadAllEntries(reports, out) {
  return reports
    .map(f => tryLoadJson(f, out))
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

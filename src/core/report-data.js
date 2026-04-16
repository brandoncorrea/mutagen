/**
 * Shared data utilities for mutation reports.
 * Used by CLI, Stryker integration, and diff/incremental modules.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'

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

export function mutationId(file, line, name) {
  return createHash('sha256').update(`${file}:${line}:${name}`).digest('hex').slice(0, 8)
}

export function assignMutationIds(mutations, filePath) {
  for (const m of mutations)
    m.id = mutationId(filePath, m.line, m.name)
  return mutations
}

export function mutantKey(path, { location, mutatorName, replacement }) {
  const line = location?.start?.line || 0
  return `${path}:${line}:${mutatorName || ''}:${replacement || ''}`
}

export function isKilled({ status }) {
  return status === 'Killed' || status === 'Timeout'
}

export function isAlive({ status }) {
  return status === 'Survived' || status === 'NoCoverage'
}

export function totalMutants({ killed, survived, noCoverage, timeout }) {
  return killed + survived + noCoverage + timeout
}

export function mutationScore(counts) {
  const total = totalMutants(counts)
  return total ? (counts.killed + counts.timeout) / total * 100 : 100
}

export function countStatuses(merged) {
  const statuses = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 }
  for (const fileData of Object.values(merged.files))
    for (const mutant of fileData.mutants)
      accumulateStatus(statuses, mutant)
  return statuses
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
 * Prints a one-line score summary to stderr.
 *
 * @param {string} outputPath - path to write the JSON report
 * @param {number} fileCount - number of source files (for summary line)
 * @param {Object} fileResults - { [path]: { mutants: [...] } }
 * @param {Object} [deltas] - incremental deltas (fixes, regressions, rerunFiles, cachedFiles)
 */
export function writeStructuredReportFile(outputPath, fileCount, fileResults, deltas) {
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

  process.stderr.write(`Score: ${round1(score)}% (${totalKilled}/${total}) | ${totalSurvived} survivors | ${fileCount} files → ${outputPath}\n`)
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

    for (const m of mutants) {
      if (isKilled(m)) {
        fileKilled++
        totalKilled++
        if (m.status === 'Timeout') totalTimedOut++
      } else if (isAlive(m)) {
        totalSurvived++
        survivors.push(toSurvivor(path, m))
      }
    }

    const fileTotal = mutants.length
    const fileScore = fileTotal ? (fileKilled / fileTotal) * 100 : 100
    files[path] = { score: round1(fileScore), killed: fileKilled, total: fileTotal }
  }

  return { files, survivors, totalKilled, totalSurvived, totalTimedOut }
}

function toSurvivor(file, m) {
  const line = m.location?.start?.line || 0
  return {
    id: mutationId(file, line, m.mutatorName),
    file,
    line,
    name: m.mutatorName,
    original: extractDescription(m.description, 0),
    mutated: extractDescription(m.description, 1),
    ...(m.coveredBy?.length && { coveredBy: m.coveredBy })
  }
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function extractDescription(description, index) {
  if (!description) return ''
  return description.split(' → ')[index] || ''
}

function accumulateStatus(statuses, { status }) {
  if (status === 'Killed')
    statuses.killed++
  else if (status === 'Survived')
    statuses.survived++
  else if (status === 'NoCoverage')
    statuses.noCoverage++
  else if (status === 'Timeout')
    statuses.timeout++
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

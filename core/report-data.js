/**
 * Shared data utilities for mutation reports.
 * Used by CLI, Stryker integration, and diff/incremental modules.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { relative } from 'node:path'

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

export function countStatuses(merged) {
  const statuses = {
    killed: 0,
    survived: 0,
    noCoverage: 0,
    timeout: 0
  }
  for (const fileData of Object.values(merged.files))
    for (const mutant of fileData.mutants)
      countStatus(statuses, mutant)
  return statuses
}

function countStatus(statuses, { status }) {
  if (status === 'Killed')
    statuses.killed++
  else if (status === 'Survived')
    statuses.survived++
  else if (status === 'NoCoverage')
    statuses.noCoverage++
  else if (status === 'Timeout')
    statuses.timeout++
}

export function combineReportData(files, out = console.log) {
  const { mergedFiles, duplicates } = deduplicateMutants(loadAllEntries(files, out))

  if (duplicates)
    out(`  Deduplicated: ${duplicates} duplicate mutant(s) removed`)

  return createReport(mergedFiles)
}

function loadAllEntries(files, out) {
  return files
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

  return { mergedFiles, duplicates }
}

export function totalMutants({ killed, survived, noCoverage, timeout }) {
  return killed + survived + noCoverage + timeout
}

export function mutationScore(counts) {
  const total = totalMutants(counts)
  return total ? (counts.killed + counts.timeout) / total * 100 : 100
}

export function toJsonMutants(sourceFile, results) {
  const relPath = relative(process.cwd(), sourceFile)

  return {
    path: relPath,
    mutants: [
      ...results.killed.map(m => toMutant(relPath, m, 'Killed')),
      ...results.survived.map(m => toMutant(relPath, m, 'Survived')),
      ...(results.timedOut || []).map(m => toMutant(relPath, m, 'Timeout'))
    ]
  }
}

function toMutant(relPath, mutation, status) {
  const { line, name, original, mutated, killedBy } = mutation
  return {
    id: `mutagen-${relPath}-${line}-${name}`,
    mutatorName: name,
    status,
    location: {
      start: { line, column: 0 },
      end: { line, column: 0 }
    },
    description: `${original} → ${mutated}`,
    ...(killedBy?.length && { killedBy })
  }
}

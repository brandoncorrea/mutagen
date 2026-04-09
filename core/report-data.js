/**
 * Shared data utilities for mutation reports.
 * Used by CLI, Stryker integration, and diff/incremental modules.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { relative } from 'node:path'

export const SEPARATOR = '═'.repeat(60)

export function createReport(files, extra) {
  return {
    schemaVersion: '1',
    thresholds: { high: 80, low: 60 },
    files,
    ...extra
  }
}

export function writeReportFile(reportDir, reportPath, report) {
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`JSON report: ${reportPath}`)
}

export function tryLoadJson(path, out) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    if (out) out(`Warning: could not read ${path}: ${err.message}`)
  }
}

export function mutantKey(path, { location, mutatorName, replacement }) {
  const line = location?.start?.line || 0
  return `${path}:${line}:${mutatorName || ''}:${replacement || ''}`
}

export function isKilled(mutation) {
  return mutation.status === 'Killed' || mutation.status === 'Timeout'
}

export function isAlive(mutation) {
  return mutation.status === 'Survived' || mutation.status === 'NoCoverage'
}

export function countStatuses(merged) {
  let killed = 0, survived = 0, noCoverage = 0, timeout = 0
  for (const fileData of Object.values(merged.files)) {
    for (const { status } of fileData.mutants) {
      if (status === 'Killed') killed++
      else if (status === 'Survived') survived++
      else if (status === 'NoCoverage') noCoverage++
      else if (status === 'Timeout') timeout++
    }
  }
  return { killed, survived, noCoverage, timeout }
}

export function toJsonMutants(sourceFile, results) {
  const relPath = relative(process.cwd(), sourceFile)

  return {
    path: relPath,
    mutants: [
      ...results.killed.map(m => toMutant(relPath, m, 'Killed')),
      ...results.survived.map(m => toMutant(relPath, m, 'Survived'))
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

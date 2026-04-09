/**
 * Shared data utilities for mutation reports.
 * Used by CLI, Stryker integration, and diff/incremental modules.
 */

import { relative } from 'node:path'

export const SEPARATOR = '═'.repeat(60)

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

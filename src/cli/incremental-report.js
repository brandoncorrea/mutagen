/**
 * Incremental-mode reporting: print summaries,
 * merge reports, count cached results.
 * Extracted from cli/incremental.js to separate
 * hashing/classification from presentation.
 */

import { writeFileSync } from 'node:fs'

import { mutantKey } from '../core/mutation-id.js'
import {
  STATUS, isKilled, isAlive
} from '../core/mutation-status.js'
import {
  HEADER_SEPARATOR, createReport, writeReportFile
} from '../core/report-data.js'

export function printIncrementalSummary(
  out, batchResult, sources, previous, classification
) {
  const { totalSurvived, totalKilled, failures } = batchResult
  const { unchangedSources, changedSources } = classification
  const cachedCounts = countCachedResults(
    previous.previousReport, unchangedSources
  )
  const grandKilled = totalKilled + cachedCounts.killed
  const grandSurvived = totalSurvived + cachedCounts.survived

  out.log(`\n${HEADER_SEPARATOR}`)
  out.log(`INCREMENTAL SUMMARY`)
  out.log(HEADER_SEPARATOR)
  out.log(
    `Rerun: ${changedSources.length} files` +
    `  |  Killed: ${totalKilled}` +
    `  |  Survived: ${totalSurvived}` +
    `  |  Errors: ${failures}`
  )
  out.log(
    `Cached: ${unchangedSources.length} files` +
    `  |  Killed: ${cachedCounts.killed}` +
    `  |  Survived: ${cachedCounts.survived}`
  )
  out.log(
    `Total: ${sources.length} files` +
    `  |  Killed: ${grandKilled}` +
    `  |  Survived: ${grandSurvived}`
  )
  out.log(`${HEADER_SEPARATOR}\n`)

  return {
    totalSurvived: grandSurvived,
    totalKilled: grandKilled,
    failures
  }
}

function countCachedResults(report, relPaths) {
  const results = { killed: 0, survived: 0 }
  if (report)
    for (const relPath of relPaths)
      countCachedResult(results, report, relPath)
  return results
}

function countCachedResult(results, report, relPath) {
  const mutants = report.files[relPath]?.mutants
  if (mutants)
    for (const mutant of mutants)
      countCachedMutation(results, mutant)
}

function countCachedMutation(results, mutation) {
  if (isKilled(mutation))
    results.killed++
  else if (mutation.status === STATUS.SURVIVED)
    results.survived++
}

export function printIncrementalHeader(
  out, sources, classification
) {
  const {
    changedSources, unchangedSources,
    changedTestFiles, testInvalidated
  } = classification
  out.log(`\n${HEADER_SEPARATOR}`)
  out.log(`MUTAGEN — INCREMENTAL MODE`)
  out.log(HEADER_SEPARATOR)
  out.log(`Total sources: ${sources.length}`)
  const testNote = testInvalidated.size
    ? ` (${testInvalidated.size} from test changes)`
    : ''
  out.log(`Changed/new:   ${changedSources.length}${testNote}`)
  out.log(`Cached:        ${unchangedSources.length}`)
  if (changedTestFiles.length)
    out.log(`Changed tests: ${changedTestFiles.length}`)
}

export function updateCachedReportHashes(
  reportPath, previousReport, classification
) {
  const { currentHashes, currentTestHashes } = classification
  previousReport.sourceHashes = currentHashes
  previousReport.testHashes = currentTestHashes
  writeFileSync(reportPath, JSON.stringify(previousReport, null, 2))
}

export function printAllCachedSummary(
  out, sources, previous, classification
) {
  const cachedCounts = countCachedResults(
    previous.previousReport,
    classification.unchangedSources
  )

  out.log(`\nNo files changed since last report. Nothing to do.`)
  out.log(`\n${HEADER_SEPARATOR}`)
  out.log(`INCREMENTAL SUMMARY (all cached)`)
  out.log(HEADER_SEPARATOR)
  out.log(
    `Files: ${sources.length}` +
    `  |  Killed: ${cachedCounts.killed}` +
    `  |  Survived: ${cachedCounts.survived}` +
    `  |  Rerun: 0`
  )
  out.log(`${HEADER_SEPARATOR}\n`)
  return {
    totalSurvived: cachedCounts.survived,
    totalKilled: cachedCounts.killed,
    failures: 0
  }
}

export function computeDeltas(
  previousReport, newFileResults, classification
) {
  if (!previousReport) return

  const { unchangedSources } = classification
  const fixes = []
  const regressions = []

  const previousIndex = buildMutantIndex(previousReport)

  for (const [filePath, fileData] of Object.entries(newFileResults)) {
    for (const mutant of fileData.mutants) {
      const key = mutantKey(filePath, mutant)
      const prevStatus = previousIndex.get(key)
      const entry = {
        file: filePath,
        line: mutant.location?.start?.line || 0,
        name: mutant.mutatorName,
        description: mutant.description || ''
      }

      if (prevStatus && isAlive(prevStatus) && isKilled(mutant))
        fixes.push(entry)
      else if (isAlive(mutant) && (!prevStatus || isKilled(prevStatus)))
        regressions.push(entry)
    }
  }

  const rerunFiles = Object.keys(newFileResults)
  const cachedFiles = [...unchangedSources]

  return { fixes, regressions, rerunFiles, cachedFiles }
}

function buildMutantIndex(report) {
  const index = new Map()
  for (const [filePath, fileData] of Object.entries(report.files))
    if (fileData.mutants)
      for (const mutant of fileData.mutants)
        index.set(mutantKey(filePath, mutant), mutant)
  return index
}

export function writeMergedReport(
  out, { config, previous, classification, fileResults }
) {
  const { reportDir, reportPath } = config
  const {
    unchangedSources, currentHashes, currentTestHashes
  } = classification
  const mergedFiles = { ...fileResults }

  if (previous.previousReport)
    for (const relPath of unchangedSources)
      if (previous.previousReport.files[relPath])
        mergedFiles[relPath] = previous.previousReport.files[relPath]

  const extra = {
    sourceHashes: currentHashes,
    testHashes: currentTestHashes
  }
  const deltas = computeDeltas(
    previous.previousReport, fileResults, classification
  )
  if (deltas) extra.deltas = deltas

  const report = createReport(mergedFiles, extra)
  writeReportFile(reportDir, reportPath, report, out)
}

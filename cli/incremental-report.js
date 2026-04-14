/**
 * Incremental-mode reporting: print summaries, merge reports, count cached results.
 * Extracted from cli/incremental.js to separate hashing/classification from presentation.
 */

import { writeFileSync } from 'node:fs'

import { HEADER_SEPARATOR, isKilled, createReport, writeReportFile } from '../core/report-data.js'

export function printIncrementalSummary(out, batchResult, sources, previous, classification) {
  const { totalSurvived, totalKilled, failures } = batchResult
  const { unchangedSources, changedSources } = classification
  const cachedCounts = countCachedResults(previous.previousReport, unchangedSources)
  const grandKilled = totalKilled + cachedCounts.killed
  const grandSurvived = totalSurvived + cachedCounts.survived

  out(`\n${HEADER_SEPARATOR}`)
  out(`INCREMENTAL SUMMARY`)
  out(HEADER_SEPARATOR)
  out(`Rerun: ${changedSources.length} files  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
  out(`Cached: ${unchangedSources.length} files  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}`)
  out(`Total: ${sources.length} files  |  Killed: ${grandKilled}  |  Survived: ${grandSurvived}`)
  out(`${HEADER_SEPARATOR}\n`)

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
  const fileData = report.files[relPath]
  if (fileData)
    for (const mutant of fileData.mutants)
      countCachedMutation(results, mutant)
}

function countCachedMutation(results, mutation) {
  if (isKilled(mutation))
    results.killed++
  else if (mutation.status === 'Survived')
    results.survived++
}

export function printIncrementalHeader(out, sources, classification) {
  const { changedSources, unchangedSources, changedTestFiles, testInvalidated } = classification
  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTAGEN — INCREMENTAL MODE`)
  out(HEADER_SEPARATOR)
  out(`Total sources: ${sources.length}`)
  out(`Changed/new:   ${changedSources.length}${testInvalidated.size ? ` (${testInvalidated.size} from test changes)` : ''}`)
  out(`Cached:        ${unchangedSources.length}`)
  if (changedTestFiles.length)
    out(`Changed tests: ${changedTestFiles.length}`)
}

export function updateCachedReportHashes(reportPath, previousReport, classification) {
  const { currentHashes, currentTestHashes } = classification
  previousReport.sourceHashes = currentHashes
  previousReport.testHashes = currentTestHashes
  writeFileSync(reportPath, JSON.stringify(previousReport, null, 2))
}

export function printAllCachedSummary(out, sources, previous, classification) {
  const cachedCounts = countCachedResults(previous.previousReport, classification.unchangedSources)

  out(`\nNo files changed since last report. Nothing to do.`)
  out(`\n${HEADER_SEPARATOR}`)
  out(`INCREMENTAL SUMMARY (all cached)`)
  out(HEADER_SEPARATOR)
  out(`Files: ${sources.length}  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}  |  Rerun: 0`)
  out(`${HEADER_SEPARATOR}\n`)
  return {
    totalSurvived: cachedCounts.survived,
    totalKilled: cachedCounts.killed,
    failures: 0
  }
}

export function writeMergedReport(out, { config, previous, classification, fileResults }) {
  const { reportDir, reportPath } = config
  const { unchangedSources, currentHashes, currentTestHashes } = classification
  const mergedFiles = { ...fileResults }

  if (previous.previousReport)
    for (const relPath of unchangedSources)
      if (previous.previousReport.files[relPath])
        mergedFiles[relPath] = previous.previousReport.files[relPath]

  const report = createReport(mergedFiles, { sourceHashes: currentHashes, testHashes: currentTestHashes })
  writeReportFile(reportDir, reportPath, report, out)
}

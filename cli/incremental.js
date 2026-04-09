/**
 * Incremental mutation runner.
 * Tracks file hashes to skip unchanged sources between runs.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

import { SEPARATOR, isKilled, createReport, writeReportFile, tryLoadJson } from '../core/report-data.js'

export const HASH_PREFIX_LENGTH = 16

export function countCachedResults(report, relPaths) {
  const results = { killed: 0, survived: 0 }
  if (report)
    for (const relPath of relPaths)
      countCachedResult(results, report, relPath)
  return results
}

function countCachedResult(results, report, relPath) {
  const fileData = report.files[relPath]
  if (fileData)
    for (const m of fileData.mutants)
      countCachedMutation(results, m)
}

function countCachedMutation(results, mutation) {
  if (isKilled(mutation))
    results.killed++
  else if (mutation.status === 'Survived')
    results.survived++
}

/**
 * Run mutations incrementally, skipping unchanged files.
 *
 * @param {Object} config
 * @param {Array<string>} config.sources - all source files
 * @param {Array<string>} config.testSources - test files to track for invalidation
 * @param {string} config.reportDir - directory for JSON reports
 * @param {string} config.reportPath - full path to the report file
 * @param {Function} config.runBatch - batch runner function
 * @param {boolean} jsonOutput - whether to write JSON report
 * @param {number} timeout - per-mutation timeout in ms
 */
export async function runIncremental(config, jsonOutput, timeout, out = console.log) {
  const { sources, testSources, reportPath, runBatch } = config
  const previous = loadPreviousReport(reportPath, out)
  const classification = classifyAllSources(sources, testSources, previous)

  printIncrementalHeader(out, sources, classification)

  if (!classification.changedSources.length)
    return handleAllCached(out, config, previous, classification, jsonOutput)

  const batchResult = await runBatch(false, timeout, classification.changedSources)

  if (jsonOutput)
    writeMergedReport(out, config, previous, classification, batchResult.fileResults)

  return printIncrementalSummary(out, batchResult, sources, previous, classification)
}

function classifyAllSources(sources, testSources, previous) {
  const { currentTestHashes, changedTestFiles } = hashTestFiles(testSources, previous.previousTestHashes)
  const testInvalidated = findTestInvalidatedSources(changedTestFiles, previous.previousReport)
  const classification = classifySources(sources, previous.previousHashes, testInvalidated)
  return {
    ...classification,
    currentTestHashes,
    changedTestFiles,
    testInvalidated
  }
}

function classifySources(sources, previousHashes, testInvalidated) {
  const currentHashes = {}
  const changedSources = []
  const unchangedSources = []

  for (const source of sources) {
    const absPath = resolve(source)
    const relPath = relative(process.cwd(), absPath)
    const hash = hashFile(absPath)
    currentHashes[relPath] = hash

    if (previousHashes[relPath] !== hash || testInvalidated.has(relPath))
      changedSources.push(source)
    else
      unchangedSources.push(relPath)
  }

  return { currentHashes, changedSources, unchangedSources }
}

export function loadPreviousReport(reportPath, out = console.log) {
  const previousReport = existsSync(reportPath) ? tryLoadJson(reportPath, out) : undefined
  return {
    previousReport,
    previousHashes: previousReport?.sourceHashes || {},
    previousTestHashes: previousReport?.testHashes || {}
  }
}

function hashTestFiles(testSources, previousTestHashes) {
  const currentTestHashes = {}
  const changedTestFiles = []
  for (const testFile of testSources) {
    const absPath = resolve(testFile)
    const relPath = relative(process.cwd(), absPath)
    const hash = hashFile(absPath)
    currentTestHashes[relPath] = hash
    if (previousTestHashes[relPath] !== hash)
      changedTestFiles.push(relPath)
  }
  return { currentTestHashes, changedTestFiles }
}

function hashFile(filePath) {
  return createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex')
    .slice(0, HASH_PREFIX_LENGTH)
}

function findTestInvalidatedSources(changedTestFiles, previousReport) {
  const testInvalidated = new Set()
  if (!changedTestFiles.length || !previousReport)
    return testInvalidated

  const changedTestAbs = new Set(changedTestFiles.map(t => resolve(t)))
  for (const [sourcePath, fileData] of Object.entries(previousReport.files)) {
    for (const mutant of fileData.mutants) {
      if (isInvalidatedMutant(mutant, changedTestAbs)) {
        testInvalidated.add(sourcePath)
        break
      }
    }
  }
  return testInvalidated
}

function isInvalidatedMutant(mutant, changedTestAbs) {
  return mutant.killedBy?.some(t => changedTestAbs.has(t))
    || mutant.status === 'Survived'
}

function printIncrementalSummary(out, batchResult, sources, previous, classification) {
  const { totalSurvived, totalKilled, failures } = batchResult
  const { unchangedSources, changedSources } = classification
  const cachedCounts = countCachedResults(previous.previousReport, unchangedSources)
  const grandKilled = totalKilled + cachedCounts.killed
  const grandSurvived = totalSurvived + cachedCounts.survived

  out(`\n${SEPARATOR}`)
  out(`INCREMENTAL SUMMARY`)
  out(SEPARATOR)
  out(`Rerun: ${changedSources.length} files  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
  out(`Cached: ${unchangedSources.length} files  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}`)
  out(`Total: ${sources.length} files  |  Killed: ${grandKilled}  |  Survived: ${grandSurvived}`)
  out(`${SEPARATOR}\n`)

  return { totalSurvived: grandSurvived, totalKilled: grandKilled, failures }
}

function printIncrementalHeader(out, sources, classification) {
  const { changedSources, unchangedSources, changedTestFiles, testInvalidated } = classification
  out(`\n${SEPARATOR}`)
  out(`MUTAGEN — INCREMENTAL MODE`)
  out(SEPARATOR)
  out(`Total sources: ${sources.length}`)
  out(`Changed/new:   ${changedSources.length}${testInvalidated.size ? ` (${testInvalidated.size} from test changes)` : ''}`)
  out(`Cached:        ${unchangedSources.length}`)
  if (changedTestFiles.length)
    out(`Changed tests: ${changedTestFiles.length}`)
}

function handleAllCached(out, config, previous, classification, jsonOutput) {
  const { sources, reportPath } = config
  const { unchangedSources, currentHashes, currentTestHashes } = classification

  out(`\nNo files changed since last report. Nothing to do.`)

  if (jsonOutput && previous.previousReport) {
    previous.previousReport.sourceHashes = currentHashes
    previous.previousReport.testHashes = currentTestHashes
    writeFileSync(reportPath, JSON.stringify(previous.previousReport, null, 2))
  }

  const cachedCounts = countCachedResults(previous.previousReport, unchangedSources)
  out(`\n${SEPARATOR}`)
  out(`INCREMENTAL SUMMARY (all cached)`)
  out(SEPARATOR)
  out(`Files: ${sources.length}  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}  |  Rerun: 0`)
  out(`${SEPARATOR}\n`)
  return { totalSurvived: cachedCounts.survived, totalKilled: cachedCounts.killed, failures: 0 }
}

function writeMergedReport(out, config, previous, classification, fileResults) {
  const { sources, reportDir, reportPath } = config
  const { unchangedSources, currentHashes, currentTestHashes } = classification
  const mergedFiles = { ...fileResults }

  if (previous.previousReport)
    for (const relPath of unchangedSources)
      if (previous.previousReport.files[relPath])
        mergedFiles[relPath] = previous.previousReport.files[relPath]

  const currentRelPaths = new Set(sources.map(s => relative(process.cwd(), resolve(s))))
  for (const key of Object.keys(mergedFiles))
    if (!currentRelPaths.has(key))
      delete mergedFiles[key]

  const report = createReport(mergedFiles, { sourceHashes: currentHashes, testHashes: currentTestHashes })
  writeReportFile(reportDir, reportPath, report, out)
}
/**
 * Incremental mutation runner.
 * Tracks file hashes to skip unchanged sources between runs.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

import { SEPARATOR, isKilled } from '../core/report-data.js'

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
export async function runIncremental(config, jsonOutput, timeout) {
  const { sources, testSources, reportPath, runBatch } = config
  const previous = loadPreviousReport(reportPath)
  const classification = classifyAllSources(sources, testSources, previous)

  printIncrementalHeader(sources, classification)

  if (!classification.changedSources.length)
    return handleAllCached(config, previous, classification, jsonOutput)

  const batchResult = await runBatch(false, timeout, classification.changedSources)

  if (jsonOutput)
    writeMergedReport(config, previous, classification, batchResult.fileResults)

  return printIncrementalSummary(batchResult, sources, previous, classification)
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
  const previousReport = tryLoadJson(reportPath, out)
  return {
    previousReport,
    previousHashes: previousReport?.sourceHashes || {},
    previousTestHashes: previousReport?.testHashes || {}
  }
}

function tryLoadJson(path, out) {
  if (!existsSync(path)) return
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    out(`Warning: could not parse previous report ${path} — discarding cache (${err.message})`)
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

function printIncrementalSummary(batchResult, sources, previous, classification) {
  const { totalSurvived, totalKilled, failures } = batchResult
  const { unchangedSources, changedSources } = classification
  const cachedCounts = countCachedResults(previous.previousReport, unchangedSources)
  const grandKilled = totalKilled + cachedCounts.killed
  const grandSurvived = totalSurvived + cachedCounts.survived

  console.log(`\n${SEPARATOR}`)
  console.log(`INCREMENTAL SUMMARY`)
  console.log(SEPARATOR)
  console.log(`Rerun: ${changedSources.length} files  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
  console.log(`Cached: ${unchangedSources.length} files  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}`)
  console.log(`Total: ${sources.length} files  |  Killed: ${grandKilled}  |  Survived: ${grandSurvived}`)
  console.log(`${SEPARATOR}\n`)

  return { totalSurvived: grandSurvived, totalKilled: grandKilled, failures }
}

function printIncrementalHeader(sources, classification) {
  const { changedSources, unchangedSources, changedTestFiles, testInvalidated } = classification
  console.log(`\n${SEPARATOR}`)
  console.log(`MUTAGEN — INCREMENTAL MODE`)
  console.log(SEPARATOR)
  console.log(`Total sources: ${sources.length}`)
  console.log(`Changed/new:   ${changedSources.length}${testInvalidated.size ? ` (${testInvalidated.size} from test changes)` : ''}`)
  console.log(`Cached:        ${unchangedSources.length}`)
  if (changedTestFiles.length)
    console.log(`Changed tests: ${changedTestFiles.length}`)
}

function handleAllCached(config, previous, classification, jsonOutput) {
  const { sources, reportPath } = config
  const { unchangedSources, currentHashes, currentTestHashes } = classification

  console.log(`\nNo files changed since last report. Nothing to do.`)

  if (jsonOutput && previous.previousReport) {
    previous.previousReport.sourceHashes = currentHashes
    previous.previousReport.testHashes = currentTestHashes
    writeFileSync(reportPath, JSON.stringify(previous.previousReport, null, 2))
  }

  const cachedCounts = countCachedResults(previous.previousReport, unchangedSources)
  console.log(`\n${SEPARATOR}`)
  console.log(`INCREMENTAL SUMMARY (all cached)`)
  console.log(SEPARATOR)
  console.log(`Files: ${sources.length}  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}  |  Rerun: 0`)
  console.log(`${SEPARATOR}\n`)
  return { totalSurvived: cachedCounts.survived, totalKilled: cachedCounts.killed, failures: 0 }
}

function writeMergedReport(config, previous, classification, fileResults) {
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

  mkdirSync(reportDir, { recursive: true })
  const report = {
    schemaVersion: '1',
    thresholds: { high: 80, low: 60 },
    files: mergedFiles,
    sourceHashes: currentHashes,
    testHashes: currentTestHashes
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`JSON report: ${reportPath}`)
}
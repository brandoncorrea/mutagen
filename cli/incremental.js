/**
 * Incremental mutation runner.
 * Tracks file hashes to skip unchanged sources between runs.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

import { SEPARATOR } from './report.js'

export const HASH_PREFIX_LENGTH = 16

function hashFile(filePath) {
  return createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex')
    .slice(0, HASH_PREFIX_LENGTH)
}

export function countCachedResults(report, relPaths) {
  let killed = 0, survived = 0
  if (!report) return { killed, survived }
  for (const relPath of relPaths) {
    const fileData = report.files[relPath]
    if (!fileData) continue
    for (const m of fileData.mutants) {
      if (m.status === 'Killed' || m.status === 'Timeout') killed++
      else if (m.status === 'Survived') survived++
    }
  }
  return { killed, survived }
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
  const { sources, testSources, reportDir, reportPath, runBatch } = config
  const sep = SEPARATOR

  const { previousReport, previousHashes, previousTestHashes } = loadPreviousReport(reportPath)

  const { currentTestHashes, changedTestFiles } = hashTestFiles(testSources, previousTestHashes)

  const testInvalidated = findTestInvalidatedSources(changedTestFiles, previousReport)

  const { currentHashes, changedSources, unchangedSources } =
    classifySources(sources, previousHashes, testInvalidated)

  printIncrementalHeader(sep, sources, changedSources, unchangedSources, changedTestFiles, testInvalidated)

  if (changedSources.length === 0)
    return handleAllCached(
      sep, sources, previousReport, unchangedSources, currentHashes, currentTestHashes,
      jsonOutput, reportPath
    )

  const { totalSurvived, totalKilled, failures, fileResults } =
    await runBatch(false, timeout, changedSources)

  if (jsonOutput)
    writeMergedReport(
      fileResults, previousReport, unchangedSources, sources, currentHashes,
      currentTestHashes, reportDir, reportPath
    )

  const cachedCounts = countCachedResults(previousReport, unchangedSources)
  const grandKilled = totalKilled + cachedCounts.killed
  const grandSurvived = totalSurvived + cachedCounts.survived

  console.log(`\n${sep}`)
  console.log(`INCREMENTAL SUMMARY`)
  console.log(sep)
  console.log(`Rerun: ${changedSources.length} files  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
  console.log(`Cached: ${unchangedSources.length} files  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}`)
  console.log(`Total: ${sources.length} files  |  Killed: ${grandKilled}  |  Survived: ${grandSurvived}`)
  console.log(`${sep}\n`)

  return { totalSurvived: grandSurvived, totalKilled: grandKilled, failures }
}

export function loadPreviousReport(reportPath) {
  let previousReport = null
  let previousHashes = {}
  let previousTestHashes = {}
  if (existsSync(reportPath)) {
    try {
      previousReport = JSON.parse(readFileSync(reportPath, 'utf-8'))
      previousHashes = previousReport.sourceHashes || {}
      previousTestHashes = previousReport.testHashes || {}
    } catch (err) {
      console.warn(`Warning: could not parse previous report ${reportPath} — discarding cache (${err.message})`)
    }
  }
  return { previousReport, previousHashes, previousTestHashes }
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

function findTestInvalidatedSources(changedTestFiles, previousReport) {
  const testInvalidated = new Set()
  if (changedTestFiles.length === 0 || !previousReport) return testInvalidated

  const changedTestAbs = new Set(changedTestFiles.map(t => resolve(t)))
  for (const [sourcePath, fileData] of Object.entries(previousReport.files)) {
    for (const m of fileData.mutants) {
      if (m.killedBy?.some(t => changedTestAbs.has(t))) {
        testInvalidated.add(sourcePath)
        break
      }
      if (m.status === 'Survived') {
        testInvalidated.add(sourcePath)
        break
      }
    }
  }
  return testInvalidated
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

function printIncrementalHeader(sep, sources, changedSources, unchangedSources, changedTestFiles, testInvalidated) {
  console.log(`\n${sep}`)
  console.log(`MUTAGEN — INCREMENTAL MODE`)
  console.log(sep)
  console.log(`Total sources: ${sources.length}`)
  console.log(`Changed/new:   ${changedSources.length}${testInvalidated.size > 0 ? ` (${testInvalidated.size} from test changes)` : ''}`)
  console.log(`Cached:        ${unchangedSources.length}`)
  if (changedTestFiles.length > 0)
    console.log(`Changed tests: ${changedTestFiles.length}`)
}

function handleAllCached(sep, sources, previousReport, unchangedSources, currentHashes, currentTestHashes, jsonOutput, reportPath) {
  console.log(`\nNo files changed since last report. Nothing to do.`)

  if (jsonOutput && previousReport) {
    previousReport.sourceHashes = currentHashes
    previousReport.testHashes = currentTestHashes
    writeFileSync(reportPath, JSON.stringify(previousReport, null, 2))
  }

  const cachedCounts = countCachedResults(previousReport, unchangedSources)
  console.log(`\n${sep}`)
  console.log(`INCREMENTAL SUMMARY (all cached)`)
  console.log(sep)
  console.log(`Files: ${sources.length}  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}  |  Rerun: 0`)
  console.log(`${sep}\n`)
  return { totalSurvived: cachedCounts.survived, totalKilled: cachedCounts.killed, failures: 0 }
}

function writeMergedReport(fileResults, previousReport, unchangedSources, sources, currentHashes, currentTestHashes, reportDir, reportPath) {
  const mergedFiles = { ...fileResults }

  if (previousReport)
    for (const relPath of unchangedSources)
      if (previousReport.files[relPath])
        mergedFiles[relPath] = previousReport.files[relPath]

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

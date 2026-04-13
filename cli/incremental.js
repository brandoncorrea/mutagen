/**
 * Incremental mutation runner.
 * Tracks file hashes to skip unchanged sources between runs.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

import { tryLoadJson } from '../core/report-data.js'
import { printIncrementalHeader, handleAllCached, writeMergedReport, printIncrementalSummary } from './incremental-report.js'

const HASH_PREFIX_LENGTH = 16

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

function loadPreviousReport(reportPath, out = console.log) {
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

function isInvalidatedMutant({ killedBy, status }, changedTestAbs) {
  return killedBy?.some(t => changedTestAbs.has(t))
    || status === 'Survived'
}


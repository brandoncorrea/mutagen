/**
 * Incremental mutation runner.
 * Tracks file hashes to skip unchanged sources between runs.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

import { tryLoadJson, writeStructuredReportFile } from '../core/report-data.js'
import { printIncrementalHeader, updateCachedReportHashes, printAllCachedSummary, writeMergedReport, printIncrementalSummary, computeDeltas } from './incremental-report.js'
import { printScoreLine } from './report.js'
import { isString } from './runner/shared.js'

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

  if (!classification.changedSources.length) {
    if (isString(jsonOutput) && previous.previousReport)
      writeStructuredIncrementalReport(jsonOutput, sources.length, previous, classification)
    else if (jsonOutput && previous.previousReport)
      updateCachedReportHashes(config.reportPath, previous.previousReport, classification)
    return printAllCachedSummary(out, sources, previous, classification)
  }

  const batchResult = await runBatch(false, timeout, classification.changedSources)

  if (isString(jsonOutput))
    writeStructuredIncrementalReport(jsonOutput, sources.length, previous, classification, batchResult.fileResults)
  else if (jsonOutput)
    writeMergedReport(out, { config, previous, classification, fileResults: batchResult.fileResults })

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

function writeStructuredIncrementalReport(outputPath, fileCount, previous, classification, freshFileResults) {
  const mergedFiles = { ...freshFileResults }
  if (previous.previousReport)
    for (const relPath of classification.unchangedSources)
      if (previous.previousReport.files[relPath])
        mergedFiles[relPath] = previous.previousReport.files[relPath]

  const deltas = computeDeltas(previous.previousReport, freshFileResults || {}, classification)
  const stats = writeStructuredReportFile(outputPath, mergedFiles, deltas)
  printScoreLine(stats, fileCount, outputPath)
}

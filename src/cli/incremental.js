/**
 * Incremental mutation runner.
 * Tracks file hashes to skip unchanged sources between runs.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

import { STATUS } from '../core/mutation-status.js'
import {
  createReport, writeReportFile, tryLoadJson, writeStructuredReportFile
} from '../core/report-data.js'
import {
  printIncrementalHeader, updateCachedReportHashes,
  printAllCachedSummary, writeMergedReport,
  printIncrementalSummary, computeDeltas
} from './incremental-report.js'
import { printScoreLine } from './report.js'
import { isString } from './shared.js'

const HASH_PREFIX_LENGTH = 16

/**
 * Run mutations incrementally, skipping unchanged files.
 *
 * @param {Object} config
 * @param {Array<string>} config.sources - all source files
 * @param {Array<string>} config.testSources - test files
 * @param {string} config.reportDir - directory for JSON reports
 * @param {string} config.reportPath - full path to the report file
 * @param {Function} config.runBatch - batch runner function
 * @param {boolean} jsonOutput - whether to write JSON report
 * @param {number} timeout - per-mutation timeout in ms
 */
export async function runIncremental(config, jsonOutput, timeout, out) {
  const { sources, testSources, reportPath, runBatch } = config
  const previous = loadPreviousReport(reportPath, out)
  const classification = classifyAllSources(
    sources, testSources, previous
  )

  printIncrementalHeader(out, sources, classification)

  if (!classification.changedSources.length) {
    if (isString(jsonOutput) && previous.previousReport)
      writeStructuredIncrementalReport(
        out, jsonOutput, sources.length,
        previous, classification
      )
    else if (jsonOutput && previous.previousReport)
      updateCachedReportHashes(
        config.reportPath,
        previous.previousReport, classification
      )
    return printAllCachedSummary(
      out, sources, previous, classification
    )
  }

  const onFileComplete = buildProgressWriter(
    jsonOutput, config, previous, classification
  )
  const batchResult = await runBatch(
    false, timeout, classification.changedSources,
    { onFileComplete }
  )

  if (isString(jsonOutput))
    writeStructuredIncrementalReport(
      out, jsonOutput, sources.length,
      previous, classification, batchResult.fileResults
    )
  else if (jsonOutput)
    writeMergedReport(out, {
      config, previous, classification,
      fileResults: batchResult.fileResults
    })

  return printIncrementalSummary(
    out, batchResult, sources, previous, classification
  )
}

function classifyAllSources(sources, testSources, previous) {
  const { currentTestHashes, changedTestFiles } =
    hashTestFiles(testSources, previous.previousTestHashes)
  const testInvalidated = findTestInvalidatedSources(
    changedTestFiles, previous.previousReport
  )
  const classification = classifySources(
    sources, previous.previousHashes, testInvalidated
  )
  return {
    ...classification,
    currentTestHashes,
    changedTestFiles,
    testInvalidated
  }
}

function classifySources(
  sources, previousHashes, testInvalidated
) {
  const classification = {
    currentHashes: {},
    changedSources: [],
    unchangedSources: []
  }

  for (const source of sources)
    classifySource(classification, source, previousHashes, testInvalidated)

  return classification
}

function classifySource(classification, source, previousHashes, testInvalidated) {
  const absPath = resolve(source)
  const relPath = relative(process.cwd(), absPath)
  const hash = hashFile(absPath)
  classification.currentHashes[relPath] = hash

  const changed = previousHashes[relPath] !== hash
    || testInvalidated.has(relPath)
  if (changed)
    classification.changedSources.push(source)
  else
    classification.unchangedSources.push(relPath)
}

function loadPreviousReport(reportPath, out) {
  const previousReport = existsSync(reportPath)
    ? tryLoadJson(reportPath, out)
    : undefined
  return {
    previousReport,
    previousHashes: previousReport?.sourceHashes || {},
    previousTestHashes: previousReport?.testHashes || {}
  }
}

function hashTestFiles(testSources, previousTestHashes) {
  const result = {
    currentTestHashes: {},
    changedTestFiles: []
  }
  for (const testFile of testSources)
    hashTestFile(result, previousTestHashes, testFile)
  return result
}

function hashTestFile(result, previousTestHashes, testFile) {
  const absPath = resolve(testFile)
  const relPath = relative(process.cwd(), absPath)
  const hash = hashFile(absPath)
  result.currentTestHashes[relPath] = hash
  if (previousTestHashes[relPath] !== hash)
    result.changedTestFiles.push(relPath)
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

  const changedTestAbs = new Set(
    changedTestFiles.map(testFile => resolve(testFile))
  )
  for (const [sourcePath, fileData] of Object.entries(previousReport.files)) {
    if (!fileData.mutants) continue
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
  return killedBy?.some(testPath => changedTestAbs.has(testPath))
    || status === STATUS.SURVIVED
}

function writeStructuredIncrementalReport(
  out, outputPath, fileCount,
  previous, classification, freshFileResults
) {
  const mergedFiles = mergeCachedFiles(
    freshFileResults || {}, previous, classification
  )
  const deltas = computeDeltas(
    previous.previousReport,
    freshFileResults || {}, classification
  )
  const hashes = {
    sourceHashes: classification.currentHashes,
    testHashes: classification.currentTestHashes
  }
  const stats = writeStructuredReportFile(
    outputPath, mergedFiles, deltas, hashes
  )
  printScoreLine(out, stats, fileCount, outputPath)
}

function buildProgressWriter(jsonOutput, config, previous, classification) {
  if (!jsonOutput) return undefined

  const { currentHashes, currentTestHashes } = classification
  const hashes = {
    sourceHashes: currentHashes,
    testHashes: currentTestHashes
  }
  const cached = mergeCachedFiles({}, previous, classification)

  if (isString(jsonOutput))
    return (freshFileResults) =>
      writeStructuredReportFile(
        jsonOutput, { ...cached, ...freshFileResults }, undefined, hashes
      )

  return (freshFileResults) => {
    const report = createReport(
      { ...cached, ...freshFileResults }, hashes
    )
    writeReportFile(config.reportDir, config.reportPath, report)
  }
}

export function mergeCachedFiles(freshFileResults, previous, classification) {
  const merged = { ...freshFileResults }
  if (previous.previousReport)
    for (const relPath of classification.unchangedSources)
      if (previous.previousReport.files[relPath])
        merged[relPath] = previous.previousReport.files[relPath]
  return merged
}

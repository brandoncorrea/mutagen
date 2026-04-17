/**
 * Batch mutation execution across multiple source files.
 * Orchestrates sequential or parallel runs with pooled workers.
 */

import { resolve, relative } from 'node:path'

import { createReport, writeReportFile, writeStructuredReportFile, tryLoadJson, HEADER_SEPARATOR } from '../../core/report-data.js'
import { runSingle } from './single.js'
import { runParallel, createBatchPool } from './parallel.js'
import { printScoreLine, printAutoDiffLine } from '../report.js'
import { createProgressReporter } from '../progress.js'
import { isString, parallelWorkerCount } from '../shared.js'
import { autoDiffSummary } from '../auto-diff.js'

/**
 * @returns {{ totalSurvived: number, totalKilled: number, totalTimedOut: number, failures: number, fileResults: Object }}
 */
export async function runBatch(runContext, jsonOutput, timeout, sourcesToRun) {
  const { mutationConfig, createRunner, reportDir, reportPath, sources, survivorsOnly, progress, out } = runContext
  const filesToRun = sourcesToRun || sources

  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTAGEN — BATCH MODE`)
  out(`   Sources: ${filesToRun.length} file(s)\n`)

  const result = await accumulateResults(filesToRun, { mutationConfig, createRunner, timeout, parallel: runContext.parallel, survivorsOnly, progress, out })

  if (isString(jsonOutput)) {
    const previous = tryLoadJson(resolve(jsonOutput))
    const stats = writeStructuredReportFile(jsonOutput, result.fileResults)
    printScoreLine(stats, filesToRun.length, jsonOutput)
    printAutoDiffLine(autoDiffSummary(previous, result.fileResults))
  } else if (jsonOutput) {
    const previous = tryLoadJson(resolve(reportPath))
    writeReportFile(reportDir, reportPath, createReport(result.fileResults), out)
    printAutoDiffLine(autoDiffSummary(previous, result.fileResults))
  }

  printBatchSummary(out, filesToRun.length, result)

  return result
}

async function accumulateResults(filesToRun, options) {
  const { parallel, createRunner, progress } = options
  const totals = { survived: 0, killed: 0, timedOut: 0, failures: 0 }
  const fileResults = {}

  const reporter = createBatchReporter(filesToRun, progress)
  const workerCount = parallelWorkerCount(parallel)
  const pool = parallel
    ? createBatchPool({ workerCount, sourceFile: resolve(filesToRun[0]), createRunner })
    : null

  const accumulator = { totals, fileResults }

  try {
    for (let i = 0; i < filesToRun.length; i++)
      await processOneFile(resolve(filesToRun[i]), options, { reporter, workerCount, pool }, accumulator)
  } finally {
    if (pool) await pool.close()
  }

  return {
    totalSurvived: totals.survived,
    totalKilled: totals.killed,
    totalTimedOut: totals.timedOut,
    failures: totals.failures,
    fileResults
  }
}

async function processOneFile(sourceFile, { mutationConfig, createRunner, timeout, parallel, survivorsOnly, out }, { reporter, workerCount, pool }, { totals, fileResults }) {
  reporter.startFile(sourceFile)
  const runOptions = {
    sourceFile,
    mutationConfig,
    createRunner,
    timeout,
    survivorsOnly,
    out,
    onProgress: reporter.dot
  }
  const { error, survived, killed, timedOut, jsonData } = parallel
    ? await runParallel({ ...runOptions, workerCount, pool })
    : await runSingle(runOptions)
  reporter.endFile()

  if (error) {
    totals.failures++
  } else {
    totals.survived += survived
    totals.killed += killed
    totals.timedOut += timedOut || 0
    fileResults[jsonData.path] = { mutants: jsonData.mutants }
  }
}

function createBatchReporter(filesToRun, progress) {
  if (!progress) return { startFile() {}, dot: undefined, endFile() {} }
  const displayPaths = filesToRun.map(f => relative(process.cwd(), resolve(f)))
  const reporter = createProgressReporter(displayPaths)
  return {
    startFile(absPath) { reporter.startFile(relative(process.cwd(), absPath)) },
    dot: status => reporter.dot(status),
    endFile() { reporter.endFile() }
  }
}

function printBatchSummary(out, fileCount, { totalKilled, totalSurvived, totalTimedOut, failures }) {
  out(`\n${HEADER_SEPARATOR}`)
  out(`BATCH SUMMARY`)
  out(HEADER_SEPARATOR)
  out(`Files: ${fileCount}  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
  if (totalTimedOut)
    out(`Timed out: ${totalTimedOut} (counted as killed)`)
  out(`${HEADER_SEPARATOR}\n`)
}

/**
 * Batch mutation execution across multiple source files.
 * Orchestrates sequential or parallel runs with pooled workers.
 */

import { resolve, relative } from 'node:path'

import { createReport, writeReportFile, writeStructuredReportFile, tryLoadJson, HEADER_SEPARATOR } from '../../core/report-data.js'
import { runSingle } from './single.js'
import { runParallel, createBatchPool } from './parallel.js'
import { printScoreLine } from '../report.js'
import { createProgressReporter } from '../progress.js'
import { isString } from './shared.js'
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
    printAutoDiff(previous, result.fileResults)
  } else if (jsonOutput) {
    const previous = tryLoadJson(resolve(reportPath))
    writeReportFile(reportDir, reportPath, createReport(result.fileResults), out)
    printAutoDiff(previous, result.fileResults)
  }

  printBatchSummary(out, filesToRun.length, result)

  return result
}

async function accumulateResults(filesToRun, { mutationConfig, createRunner, timeout, parallel, survivorsOnly, progress, out }) {
  let totalSurvived = 0
  let totalKilled = 0
  let totalTimedOut = 0
  let failures = 0
  const fileResults = {}

  const displayPaths = filesToRun.map(f => relative(process.cwd(), resolve(f)))
  const reporter = progress ? createProgressReporter(displayPaths) : null

  const workerCount = parallelWorkerCount(parallel)
  const pool = parallel
    ? createBatchPool({ workerCount, sourceFile: resolve(filesToRun[0]), createRunner })
    : null

  try {
    for (let i = 0; i < filesToRun.length; i++) {
      const source = filesToRun[i]
      if (reporter) reporter.startFile(displayPaths[i])
      const onProgress = reporter ? status => reporter.dot(status) : undefined
      const runOptions = { sourceFile: resolve(source), mutationConfig, createRunner, timeout, survivorsOnly, out, onProgress }
      const { error, survived, killed, timedOut, jsonData } = parallel
        ? await runParallel({ ...runOptions, workerCount, pool })
        : await runSingle(runOptions)
      if (reporter) reporter.endFile()
      if (error) {
        failures++
      } else {
        totalSurvived += survived
        totalKilled += killed
        totalTimedOut += timedOut || 0
        fileResults[jsonData.path] = { mutants: jsonData.mutants }
      }
    }
  } finally {
    if (pool) await pool.close()
  }

  return { totalSurvived, totalKilled, totalTimedOut, failures, fileResults }
}

function parallelWorkerCount(parallel) {
  if (typeof parallel === 'number')
    return parallel
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

function printAutoDiff(previous, fileResults) {
  const summary = autoDiffSummary(previous, fileResults)
  if (summary) process.stderr.write(`  Δ ${summary}\n`)
}

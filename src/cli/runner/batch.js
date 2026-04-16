/**
 * Batch mutation execution across multiple source files.
 * Orchestrates sequential or parallel runs with pooled workers.
 */

import { resolve } from 'node:path'

import { createReport, writeReportFile, writeStructuredReportFile, HEADER_SEPARATOR } from '../../core/report-data.js'
import { runSingle } from './single.js'
import { runParallel, createBatchPool } from './parallel.js'
import { printScoreLine } from '../report.js'

export async function runBatch(runContext, jsonOutput, timeout, sourcesToRun) {
  const { mutationConfig, createRunner, reportDir, reportPath, sources, survivorsOnly, out } = runContext
  const filesToRun = sourcesToRun || sources

  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTAGEN — BATCH MODE`)
  out(`   Sources: ${filesToRun.length} file(s)\n`)

  const result = await accumulateResults(filesToRun, { mutationConfig, createRunner, timeout, parallel: runContext.parallel, survivorsOnly, out })

  if (isString(jsonOutput)) {
    const stats = writeStructuredReportFile(jsonOutput, filesToRun.length, result.fileResults)
    printScoreLine(stats, filesToRun.length, jsonOutput)
  } else if (jsonOutput) {
    writeReportFile(reportDir, reportPath, createReport(result.fileResults), out)
  }

  printBatchSummary(out, filesToRun.length, result)

  return result
}

async function accumulateResults(filesToRun, { mutationConfig, createRunner, timeout, parallel, survivorsOnly, out }) {
  let totalSurvived = 0
  let totalKilled = 0
  let totalTimedOut = 0
  let failures = 0
  const fileResults = {}

  const workerCount = parallelWorkerCount(parallel)
  const pool = parallel
    ? createBatchPool({ workerCount, sourceFile: resolve(filesToRun[0]), createRunner })
    : null

  try {
    for (const source of filesToRun) {
      const runOptions = { sourceFile: resolve(source), mutationConfig, createRunner, timeout, survivorsOnly, out }
      const { error, survived, killed, timedOut, jsonData } = parallel
        ? await runParallel({ ...runOptions, workerCount, pool })
        : await runSingle(runOptions)
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

function isString(value) {
  return typeof value === 'string'
}

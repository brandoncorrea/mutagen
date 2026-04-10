/**
 * Manual mutation runner CLI harness.
 * Projects create a runner with their config and call .main() to run.
 *
 * Usage (from project entry script):
 *   createManualRunner({ patterns, sources, createRunner }).main()
 *
 * CLI:
 *   node mutate.js <source> [--line N] [--json] [--dry-run] [--timeout N]
 *   node mutate.js --all [--json] [--dry-run] [--timeout N]
 *   node mutate.js --incremental [--json] [--timeout N]
 *   node mutate.js --diff <before.json> <after.json>
 */

import { resolve } from 'node:path'

import { preparePatterns } from '../core/engine.js'
import { SEPARATOR, createReport, writeReportFile } from '../core/report-data.js'
import { diffReports } from './diff.js'
import { parseArgs } from './args.js'
import { runSingle, dryRun } from './runner.js'
import { runIncremental } from './incremental.js'

/**
 * Create a manual mutation runner with project-specific config.
 *
 * @param {Object} config
 * @param {Array} config.patterns - mutation patterns (combine built-in + custom)
 * @param {Array<string>} config.sources - source files to mutate (for --all batch mode)
 * @param {Function} config.createRunner - async (sourceFile) => { run, close }
 * @param {string} [config.reportDir='reports/mutation'] - directory for JSON reports
 * @param {string} [config.reportFile] - JSON report filename (default: manual-report.json)
 * @param {number} [config.timeout=null] - default per-mutation timeout in ms (CLI --timeout overrides)
 */
export function createManualRunner(config) {
  const {
    patterns,
    sources = [],
    testSources = [],
    createRunner,
    reportDir = 'reports/mutation',
    reportFile = 'manual-report.json',
    timeout: configTimeout = null,
    out = console.log
  } = config

  const prepared = preparePatterns(patterns)
  const reportPath = `${reportDir}/${reportFile}`
  const ctx = { prepared, sources, testSources, createRunner, reportDir, reportPath, configTimeout, out }

  return {
    runBatch: (jsonOutput, timeout, sourcesToRun) =>
      runBatch(ctx, jsonOutput, timeout, sourcesToRun),
    runIncremental: (jsonOutput, timeout) =>
      runIncremental({ sources, testSources, reportDir, reportPath, runBatch: runBatch.bind(null, ctx) }, jsonOutput, timeout, out),
    run: argv => run(ctx, argv),
    async main() {
      process.exit(await run(ctx))
    }
  }
}

async function runBatch(ctx, jsonOutput, timeout, sourcesToRun) {
  const { prepared, createRunner, reportDir, reportPath, sources, out } = ctx
  const filesToRun = sourcesToRun || sources

  out(`\n${SEPARATOR}`)
  out(`MUTAGEN — BATCH MODE`)
  out(`   Sources: ${filesToRun.length} file(s)\n`)

  let totalSurvived = 0
  let totalKilled = 0
  let totalTimedOut = 0
  let failures = 0
  const fileResults = {}

  for (const source of filesToRun) {
    const result = await runSingle({ sourceFile: resolve(source), prepared, createRunner, timeout, out })
    if (result.error) {
      failures++
    } else {
      totalSurvived += result.survived
      totalKilled += result.killed
      totalTimedOut += result.timedOut || 0
      fileResults[result.jsonData.path] = { mutants: result.jsonData.mutants }
    }
  }

  if (jsonOutput)
    writeReport(out, reportDir, reportPath, fileResults)

  const result = { totalSurvived, totalKilled, totalTimedOut, failures, fileResults }
  printBatchSummary(out, filesToRun.length, result)

  return result
}

function writeReport(out, reportDir, reportPath, fileResults) {
  writeReportFile(reportDir, reportPath, createReport(fileResults), out)
}

function printBatchSummary(out, fileCount, { totalKilled, totalSurvived, totalTimedOut, failures }) {
  out(`\n${SEPARATOR}`)
  out(`BATCH SUMMARY`)
  out(SEPARATOR)
  out(`Files: ${fileCount}  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
  if (totalTimedOut)
    out(`Timed out: ${totalTimedOut} (counted as killed)`)
  out(`${SEPARATOR}\n`)
}

async function run(ctx, argv) {
  const parsed = parseArgs(argv)
  if (parsed.error) {
    console.error(parsed.error)
    return 1
  }

  const timeout = parsed.timeout || ctx.configTimeout

  if (parsed.diffMode)
    return diffReports(parsed.beforeFile, parsed.afterFile, ctx.out).regressions ? 1 : 0
  if (parsed.dryRunMode && parsed.allMode)
    return runAllDryRun(ctx)
  if (parsed.dryRunMode)
    return dryRun(parsed.sourceFile, ctx.prepared, parsed.targetLine, ctx.out) && 0
  if (parsed.incrementalMode)
    return runIncrementalMode(ctx, parsed.jsonOutput, timeout)
  if (parsed.allMode)
    return runBatchMode(ctx, parsed.jsonOutput, timeout)
  return runSingleMode(ctx, parsed, timeout)
}

function runAllDryRun({ sources, prepared, out }) {
  let total = 0
  for (const source of sources) total += dryRun(resolve(source), prepared, null, out)
  out(`\n  Grand total: ${total} mutations across ${sources.length} files`)
  return 0
}

async function runIncrementalMode(ctx, jsonOutput, timeout) {
  const { sources, testSources, reportDir, reportPath, out } = ctx
  const incrementalConfig = { sources, testSources, reportDir, reportPath, runBatch: runBatch.bind(null, ctx) }
  const { totalSurvived, failures } = await runIncremental(incrementalConfig, jsonOutput, timeout, out)
  return (totalSurvived + failures) ? 1 : 0
}

async function runBatchMode(ctx, jsonOutput, timeout) {
  const { totalSurvived, failures } = await runBatch(ctx, jsonOutput, timeout)
  return (totalSurvived + failures) ? 1 : 0
}

async function runSingleMode(ctx, parsed, timeout) {
  const result = await runSingle({
    sourceFile: parsed.sourceFile,
    prepared: ctx.prepared,
    createRunner: ctx.createRunner,
    targetLine: parsed.targetLine,
    timeout,
    out: ctx.out
  })
  if (result.error) return 1
  return result.survived ? 1 : 0
}

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

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { preparePatterns } from '../core/engine.js'
import { SEPARATOR } from './report.js'
import { diffReports } from './diff.js'
import { parseArgs } from './args.js'
import { runSingle, dryRun } from './runner.js'
import { runIncremental, HASH_PREFIX_LENGTH } from './incremental.js'

export { HASH_PREFIX_LENGTH }

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
    timeout: configTimeout = null
  } = config

  const prepared = preparePatterns(patterns)
  const reportPath = `${reportDir}/${reportFile}`
  const ctx = { prepared, sources, testSources, createRunner, reportDir, reportPath, configTimeout }

  return {
    runBatch: (jsonOutput, timeout, sourcesToRun) =>
      runBatch(ctx, jsonOutput, timeout, sourcesToRun),
    runIncremental: (jsonOutput, timeout) =>
      runIncremental({ sources, testSources, reportDir, reportPath, runBatch: runBatch.bind(null, ctx) }, jsonOutput, timeout),
    run: argv => run(ctx, argv),
    async main() {
      process.exit(await run(ctx))
    }
  }
}

async function runBatch(ctx, jsonOutput, timeout, sourcesToRun) {
  const { prepared, createRunner, reportDir, reportPath, sources } = ctx
  const filesToRun = sourcesToRun || sources

  console.log(`\n${SEPARATOR}`)
  console.log(`MUTAGEN — BATCH MODE`)
  console.log(`   Sources: ${filesToRun.length} file(s)\n`)

  let totalSurvived = 0
  let totalKilled = 0
  let totalTimedOut = 0
  let failures = 0
  const fileResults = {}

  for (const source of filesToRun) {
    const result = await runSingle({ sourceFile: resolve(source), prepared, createRunner, timeout })
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
    writeReport(reportDir, reportPath, fileResults)

  const result = { totalSurvived, totalKilled, totalTimedOut, failures, fileResults }
  printBatchSummary(filesToRun.length, result)

  return result
}

function writeReport(reportDir, reportPath, fileResults) {
  mkdirSync(reportDir, { recursive: true })
  const report = {
    schemaVersion: '1',
    thresholds: { high: 80, low: 60 },
    files: fileResults
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`JSON report: ${reportPath}`)
}

function printBatchSummary(fileCount, { totalKilled, totalSurvived, totalTimedOut, failures }) {
  console.log(`\n${SEPARATOR}`)
  console.log(`BATCH SUMMARY`)
  console.log(SEPARATOR)
  console.log(`Files: ${fileCount}  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
  if (totalTimedOut)
    console.log(`Timed out: ${totalTimedOut} (counted as killed)`)
  console.log(`${SEPARATOR}\n`)
}

async function run(ctx, argv) {
  const parsed = parseArgs(argv)
  if (parsed.error) {
    console.error(parsed.error)
    return 1
  }

  const timeout = parsed.timeout || ctx.configTimeout

  if (parsed.diffMode)
    return diffReports(parsed.beforeFile, parsed.afterFile).regressions ? 1 : 0
  if (parsed.dryRunMode && parsed.allMode)
    return runAllDryRun(ctx)
  if (parsed.dryRunMode)
    return dryRun(parsed.sourceFile, ctx.prepared, parsed.targetLine) && 0
  if (parsed.incrementalMode)
    return runIncrementalMode(ctx, parsed.jsonOutput, timeout)
  if (parsed.allMode)
    return runBatchMode(ctx, parsed.jsonOutput, timeout)
  return runSingleMode(ctx, parsed, timeout)
}

function runAllDryRun({ sources, prepared }) {
  let total = 0
  for (const source of sources) total += dryRun(resolve(source), prepared, null)
  console.log(`\n  Grand total: ${total} mutations across ${sources.length} files`)
  return 0
}

async function runIncrementalMode(ctx, jsonOutput, timeout) {
  const { sources, testSources, reportDir, reportPath } = ctx
  const incrementalConfig = { sources, testSources, reportDir, reportPath, runBatch: runBatch.bind(null, ctx) }
  const { totalSurvived, failures } = await runIncremental(incrementalConfig, jsonOutput, timeout)
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
    timeout
  })
  if (result.error) return 1
  return result.survived ? 1 : 0
}

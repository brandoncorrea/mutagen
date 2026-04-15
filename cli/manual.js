/**
 * Manual mutation runner CLI harness.
 * Projects create a runner with their config and call .main() to run.
 *
 * Usage (from project entry script):
 *   createManualRunner({ patterns, sources, createRunner }).main()
 *
 * CLI:
 *   node mutate.js <source> [--line N] [--json [path]] [--dry-run] [--timeout N]
 *   node mutate.js --all [--json [path]] [--dry-run] [--timeout N]
 *   node mutate.js --incremental [--json [path]] [--timeout N]
 *   node mutate.js --diff <before.json> <after.json>
 */

import { resolve } from 'node:path'

import { prepareMutationConfig } from '../core/generate.js'
import { resolveGlobs } from '../core/resolve-globs.js'
import { HEADER_SEPARATOR, createReport, writeReportFile, writeStructuredReportFile } from '../core/report-data.js'
import { diffReports } from './diff.js'
import { parseArgs } from './args.js'
import { runSingle, runParallel, dryRun } from './runner/index.js'
import { runIncremental } from './incremental.js'
import { formatQuietSummary } from './report.js'

/**
 * Create a manual mutation runner with project-specific config.
 *
 * @param {Object} config
 * @param {Array} [config.mutators] - AST visitor mutators ({ type, mutate })
 * @param {Array} [config.patterns] - regex patterns (secondary mode for quick patterns)
 * @param {Array<string>} [config.sources] - explicit source files (takes precedence over include/exclude)
 * @param {Array<string>} [config.include] - glob patterns for source files
 * @param {Array<string>} [config.exclude] - glob patterns to exclude
 * @param {string} [config.cwd=process.cwd()] - base directory for glob resolution
 * @param {Function} config.createRunner - async (sourceFile) => { run, close }
 * @param {string} [config.reportDir='reports/mutation'] - directory for JSON reports
 * @param {string} [config.reportFile] - JSON report filename (default: manual-report.json)
 * @param {number} [config.timeout=null] - default per-mutation timeout in ms (CLI --timeout overrides)
 */
export function createManualRunner(config) {
  const {
    mutators,
    patterns,
    sources: explicitSources,
    include,
    exclude,
    cwd,
    testSources = [],
    createRunner,
    reportDir = 'reports/mutation',
    reportFile = 'manual-report.json',
    timeout: configTimeout = null,
    out = console.log
  } = config

  const sources = explicitSources && explicitSources.length
    ? explicitSources
    : include
      ? resolveGlobs({ include, exclude, cwd })
      : []

  const mutationConfig = prepareMutationConfig({ mutators, patterns })
  const reportPath = `${reportDir}/${reportFile}`

  const ctx = {
    mutationConfig,
    sources,
    testSources,
    createRunner,
    reportDir,
    reportPath,
    configTimeout,
    out
  }

  const incrementalConfig = {
    sources,
    testSources,
    reportDir,
    reportPath,
    runBatch: runBatch.bind(null, ctx)
  }

  return {
    runBatch: (jsonOutput, timeout, sourcesToRun) =>
      runBatch(ctx, jsonOutput, timeout, sourcesToRun),
    runIncremental: (jsonOutput, timeout) =>
      runIncremental(incrementalConfig, jsonOutput, timeout, out),
    run: argv => run(ctx, argv),
    async main() {
      process.exit(await run(ctx))
    }
  }
}

async function run(ctx, argv) {
  const parsed = parseArgs(argv)
  if (parsed.error) {
    ctx.out(parsed.error)
    return 1
  }

  const quiet = parsed.quiet
  const runCtx = quiet ? { ...ctx, out: () => {} } : ctx
  const timeout = parsed.timeout || ctx.configTimeout

  if (parsed.diffMode)
    return runDiffMode(runCtx, parsed)
  if (parsed.dryRunMode && parsed.allMode)
    return runAllDryRun(runCtx)
  if (parsed.dryRunMode)
    return dryRun(parsed.sourceFile, runCtx.mutationConfig, parsed.targetLine, runCtx.out) && 0

  const parallel = parsed.parallel
  const pCtx = parallel ? { ...runCtx, parallel } : runCtx

  let result
  if (parsed.incrementalMode)
    result = await runIncrementalMode(pCtx, parsed.jsonOutput, timeout)
  else if (parsed.allMode)
    result = await runBatchMode(pCtx, parsed.jsonOutput, timeout)
  else
    result = await runSingleMode(pCtx, parsed, timeout)

  if (quiet && result.stats)
    process.stderr.write(formatQuietSummary(result.stats) + '\n')

  return result.exitCode
}

function runDiffMode(ctx, parsed) {
  const result = diffReports(parsed.beforeFile, parsed.afterFile, ctx.out, parsed.jsonOutput)
  return !result || result.regressions ? 1 : 0
}

function runAllDryRun({ sources, mutationConfig, out }) {
  let total = 0
  for (const source of sources)
    total += dryRun(resolve(source), mutationConfig, null, out)
  out(`\n  Grand total: ${total} mutations across ${sources.length} files`)
  return 0
}

async function runIncrementalMode(ctx, jsonOutput, timeout) {
  const { sources, testSources, reportDir, reportPath, out } = ctx
  const incrementalConfig = { sources, testSources, reportDir, reportPath, runBatch: runBatch.bind(null, ctx) }
  const { totalSurvived, totalKilled = 0, failures } = await runIncremental(incrementalConfig, jsonOutput, timeout, out)
  const exitCode = (totalSurvived + failures) ? 1 : 0
  return {
    exitCode,
    stats: { killed: totalKilled, survived: totalSurvived, timedOut: 0, fileCount: sources.length }
  }
}

async function runBatchMode(ctx, jsonOutput, timeout) {
  const result = await runBatch(ctx, jsonOutput, timeout)
  const { totalSurvived, totalKilled, totalTimedOut, failures, fileResults } = result
  const exitCode = (totalSurvived + failures) ? 1 : 0
  return {
    exitCode,
    stats: { killed: totalKilled, survived: totalSurvived, timedOut: totalTimedOut, fileCount: Object.keys(fileResults).length }
  }
}

async function runSingleMode(ctx, parsed, timeout) {
  const opts = {
    sourceFile: parsed.sourceFile,
    mutationConfig: ctx.mutationConfig,
    createRunner: ctx.createRunner,
    targetLine: parsed.targetLine,
    timeout,
    out: ctx.out
  }
  const result = ctx.parallel
    ? await runParallel({ ...opts, workerCount: typeof ctx.parallel === 'number' ? ctx.parallel : undefined })
    : await runSingle(opts)
  const exitCode = result.error || result.survived ? 1 : 0
  return {
    exitCode,
    stats: { killed: result.killed || 0, survived: result.survived || 0, timedOut: result.timedOut || 0, fileCount: 1 }
  }
}

async function runBatch(ctx, jsonOutput, timeout, sourcesToRun) {
  const { mutationConfig, createRunner, reportDir, reportPath, sources, out } = ctx
  const filesToRun = sourcesToRun || sources

  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTAGEN — BATCH MODE`)
  out(`   Sources: ${filesToRun.length} file(s)\n`)

  const result = await accumulateResults(filesToRun, { mutationConfig, createRunner, timeout, parallel: ctx.parallel, out })

  if (typeof jsonOutput === 'string')
    writeStructuredReportFile(jsonOutput, filesToRun.length, result.fileResults)
  else if (jsonOutput)
    writeReport(out, reportDir, reportPath, result.fileResults)

  printBatchSummary(out, filesToRun.length, result)

  return result
}

async function accumulateResults(filesToRun, { mutationConfig, createRunner, timeout, parallel, out }) {
  let totalSurvived = 0
  let totalKilled = 0
  let totalTimedOut = 0
  let failures = 0
  const fileResults = {}

  for (const source of filesToRun) {
    const opts = { sourceFile: resolve(source), mutationConfig, createRunner, timeout, out }
    const result = parallel
      ? await runParallel({ ...opts, workerCount: typeof parallel === 'number' ? parallel : undefined })
      : await runSingle(opts)
    if (result.error) {
      failures++
    } else {
      totalSurvived += result.survived
      totalKilled += result.killed
      totalTimedOut += result.timedOut || 0
      fileResults[result.jsonData.path] = { mutants: result.jsonData.mutants }
    }
  }

  return { totalSurvived, totalKilled, totalTimedOut, failures, fileResults }
}

function writeReport(out, reportDir, reportPath, fileResults) {
  writeReportFile(reportDir, reportPath, createReport(fileResults), out)
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

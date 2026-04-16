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

import { resolve, relative } from 'node:path'

import { prepareMutationConfig } from '../core/generate.js'
import { resolveGlobs } from '../core/resolve-globs.js'
import { gitChangedFiles } from '../core/git-changed.js'
import { diffReports } from './diff.js'
import { parseArgs } from './args.js'
import { runSingle, runParallel, runBatch, dryRun } from './runner/index.js'
import { runIncremental } from './incremental.js'
import { runRetest } from './retest.js'
import { formatQuietSummary } from './report.js'
import { formatProgressSummary, createProgressReporter } from './progress.js'

/**
 * Create a manual mutation runner with project-specific config.
 *
 * @param {Object} config
 * @param {Array} config.mutators - AST visitor mutators ({ name, types, test, mutate })
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
    skipNodes,
    sources: explicitSources,
    include,
    exclude,
    cwd,
    testSources: explicitTestSources = [],
    testInclude,
    testExclude,
    createRunner,
    reportDir = 'reports/mutation',
    reportFile = 'manual-report.json',
    timeout: configTimeout,
    out = console.log
  } = config

  const sources = explicitSources?.length ? explicitSources
    : include ? resolveGlobs({ include, exclude, cwd })
    : []

  const testSources = explicitTestSources.length ? explicitTestSources
    : testInclude ? resolveGlobs({ include: testInclude, exclude: testExclude, cwd })
    : []

  const mutationConfig = prepareMutationConfig({ mutators, skipNodes })
  const reportPath = `${reportDir}/${reportFile}`

  const runContext = {
    mutationConfig,
    sources,
    testSources,
    createRunner,
    reportDir,
    reportPath,
    configTimeout,
    out
  }

  return {
    runBatch: (jsonOutput, timeout, sourcesToRun) =>
      runBatch(runContext, jsonOutput, timeout, sourcesToRun),
    runIncremental: (jsonOutput, timeout) =>
      runIncremental(buildIncrementalConfig(runContext), jsonOutput, timeout, out),
    run: argv => run(runContext, argv),
    async main() {
      process.exit(await run(runContext))
    }
  }
}

function buildIncrementalConfig(runContext) {
  return {
    sources: runContext.sources,
    testSources: runContext.testSources,
    reportDir: runContext.reportDir,
    reportPath: runContext.reportPath,
    runBatch: runBatch.bind(null, runContext)
  }
}

async function run(runContext, argv) {
  const parsed = parseArgs(argv)
  if (parsed.help) {
    runContext.out(parsed.help)
    return 0
  }
  if (parsed.error) {
    runContext.out(parsed.error)
    return 1
  }

  const effectiveContext = applyRunFlags(runContext, parsed)
  const timeout = parsed.timeout || runContext.configTimeout

  if (parsed.diffMode)
    return runDiffMode(effectiveContext, parsed)
  if (parsed.dryRunMode)
    return runDryRunMode(effectiveContext, parsed)

  const { stats, exitCode } = await getRunResults(parsed, effectiveContext, timeout)

  if (parsed.progress && stats)
    process.stderr.write(formatProgressSummary(stats) + '\n')
  else if (parsed.quiet && stats)
    process.stderr.write(formatQuietSummary(stats) + '\n')
  if (parsed.minScore != null && stats)
    return scoreExitCode(stats, parsed.minScore)

  return exitCode
}

function applyRunFlags(runContext, parsed) {
  let context = (parsed.quiet || parsed.progress) ? { ...runContext, out: () => {} } : runContext

  if (parsed.progress)
    context = { ...context, progress: true }
  if (parsed.changed)
    context = { ...context, sources: filterChanged(context.sources) }
  if (parsed.parallel)
    context = { ...context, parallel: parsed.parallel }
  if (parsed.survivorsOnly)
    context = { ...context, survivorsOnly: true }

  return context
}

function runDryRunMode(runContext, parsed) {
  if (parsed.allMode) {
    const { total, fileCount } = runAllDryRun(runContext)
    if (parsed.quiet)
      process.stderr.write(`${total} mutations across ${fileCount} files\n`)
    return 0
  }
  const count = dryRun(parsed.sourceFile, runContext.mutationConfig, parsed.targetLine, runContext.out)
  if (parsed.quiet)
    process.stderr.write(`${count} mutations across 1 files\n`)
  return 0
}

function getRunResults(parsed, runContext, timeout) {
  if (parsed.retestMode)
    return runRetest(runContext, { ...parsed, timeout })
  if (parsed.incrementalMode)
    return runIncrementalMode(runContext, parsed.jsonOutput, timeout)
  if (parsed.allMode)
    return runBatchMode(runContext, parsed.jsonOutput, timeout)
  return runSingleMode(runContext, parsed, timeout)
}

function runDiffMode(runContext, parsed) {
  const result = diffReports(parsed.beforeFile, parsed.afterFile, runContext.out, parsed.jsonOutput)
  return !result || result.regressions ? 1 : 0
}

function runAllDryRun({ sources, mutationConfig, out }) {
  let total = 0
  for (const source of sources)
    total += dryRun(resolve(source), mutationConfig, null, out)
  out(`\n  Grand total: ${total} mutations across ${sources.length} files`)
  return { total, fileCount: sources.length }
}

async function runIncrementalMode(runContext, jsonOutput, timeout) {
  const incrementalConfig = buildIncrementalConfig(runContext)
  const { totalSurvived, totalKilled = 0, failures } = await runIncremental(incrementalConfig, jsonOutput, timeout, runContext.out)
  const exitCode = (totalSurvived + failures) ? 1 : 0
  return {
    exitCode,
    stats: {
      killed: totalKilled,
      survived: totalSurvived,
      timedOut: 0,
      fileCount: runContext.sources.length
    }
  }
}

async function runBatchMode(runContext, jsonOutput, timeout) {
  const result = await runBatch(runContext, jsonOutput, timeout, undefined)
  const { totalSurvived, totalKilled, totalTimedOut, failures, fileResults } = result
  const exitCode = (totalSurvived + failures) ? 1 : 0
  return {
    exitCode,
    stats: {
      killed: totalKilled,
      survived: totalSurvived,
      timedOut: totalTimedOut,
      fileCount: Object.keys(fileResults).length
    }
  }
}

async function runSingleMode(runContext, parsed, timeout) {
  const progress = runContext.progress
    ? createSingleFileProgress(relative(process.cwd(), parsed.sourceFile))
    : null
  const runOptions = {
    sourceFile: parsed.sourceFile,
    mutationConfig: runContext.mutationConfig,
    createRunner: runContext.createRunner,
    targetLine: parsed.targetLine,
    timeout,
    survivorsOnly: runContext.survivorsOnly,
    out: runContext.out,
    onProgress: progress?.dot
  }
  const { error, survived, killed, timedOut } = await getSingleRunResult(runContext, runOptions)
  if (progress) progress.endFile()
  return {
    exitCode: error || survived ? 1 : 0,
    stats: {
      killed: killed || 0,
      survived: survived || 0,
      timedOut: timedOut || 0,
      fileCount: 1
    }
  }
}

function createSingleFileProgress(displayPath) {
  const reporter = createProgressReporter([displayPath])
  reporter.startFile(displayPath)
  return reporter
}

function getSingleRunResult(runContext, runOptions) {
  if (runContext.parallel)
    return runParallel({
      ...runOptions,
      workerCount: parallelWorkerCount(runContext.parallel)
    })
  return runSingle(runOptions)
}

function parallelWorkerCount(parallel) {
  if (typeof parallel === 'number')
    return parallel
}

export function scoreExitCode({ killed, survived, timedOut }, minScore) {
  const effectiveKilled = killed + timedOut
  const total = effectiveKilled + survived
  const score = total ? (effectiveKilled / total) * 100 : 100
  return score >= minScore ? 0 : 1
}

function filterChanged(sources) {
  const changed = new Set(gitChangedFiles())
  return sources.filter(s => changed.has(s))
}

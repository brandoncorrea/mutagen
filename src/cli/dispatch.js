/**
 * CLI run-mode dispatch: parses args, applies flags, routes to the
 * appropriate runner (single, batch, incremental, retest, diff, dry-run).
 */

import { resolve, relative } from 'node:path'

import { calculateScore } from '../core/mutation-status.js'
import { gitChangedFiles } from '../core/git-changed.js'
import { diffReports } from './diff.js'
import { parseArgs } from './args.js'
import { runSingle, runParallel, runBatch, dryRun } from './runner/index.js'
import { runIncremental } from './incremental.js'
import { runRetest } from './retest.js'
import { formatQuietSummary } from './report.js'
import { formatProgressSummary, createProgressReporter } from './progress.js'
import { parallelWorkerCount, isString } from './shared.js'

export async function run(runContext, argv) {
  const parsed = parseArgs(argv)
  if (parsed.help) {
    runContext.out.log(parsed.help)
    return 0
  }
  if (parsed.error) {
    runContext.out.log(parsed.error)
    return 1
  }

  const effectiveContext = applyRunFlags(runContext, parsed)
  const timeout = parsed.timeout || runContext.configTimeout

  if (parsed.diffMode)
    return runDiffMode(effectiveContext, parsed)
  if (parsed.dryRunMode)
    return runDryRunMode(effectiveContext, parsed)

  const { stats, exitCode } = await getRunResults(
    parsed, effectiveContext, timeout
  )

  printPostRunSummary(effectiveContext.out, parsed, stats)

  if (parsed.minScore != null && stats)
    return scoreExitCode(stats, parsed.minScore)

  return exitCode
}

function printPostRunSummary(out, parsed, stats) {
  if (!stats) return
  if (parsed.progress)
    out.error(`${formatProgressSummary(stats)}\n`)
  else if (parsed.quiet)
    out.error(`${formatQuietSummary(stats)}\n`)
}

function applyRunFlags(runContext, parsed) {
  const overrides = {}

  if (parsed.quiet || parsed.progress)
    overrides.out = { log: () => {}, error: runContext.out.error }
  if (parsed.progress)
    overrides.progress = true
  if (parsed.changed)
    overrides.sources = filterChanged(runContext.sources)
  if (parsed.parallel)
    overrides.parallel = parsed.parallel
  if (parsed.survivorsOnly)
    overrides.survivorsOnly = true

  return { ...runContext, ...overrides }
}

function runDryRunMode(runContext, parsed) {
  if (parsed.allMode) {
    const { total, fileCount } = runAllDryRun(runContext)
    if (parsed.quiet)
      runContext.out.error(
        `${total} mutations across ${fileCount}` +
        ` file${fileCount !== 1 ? 's' : ''}\n`
      )
    return 0
  }
  const count = dryRun(
    parsed.sourceFile, runContext.mutationConfig,
    parsed.targetLine, runContext.out
  )
  if (parsed.quiet)
    runContext.out.error(`${count} mutations across 1 file\n`)
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
  const result = diffReports(
    parsed.beforeFile, parsed.afterFile,
    runContext.out, parsed.jsonOutput
  )
  return !result || result.regressions ? 1 : 0
}

function runAllDryRun({ sources, mutationConfig, out }) {
  let total = 0
  for (const source of sources)
    total += dryRun(resolve(source), mutationConfig, null, out)
  out.log(
    `\n  Grand total: ${total} mutations across ${sources.length} files`
  )
  return { total, fileCount: sources.length }
}

async function runIncrementalMode(runContext, jsonOutput, timeout) {
  const reportPath = isString(jsonOutput) ? jsonOutput : runContext.reportPath
  const incrementalConfig = {
    sources: runContext.sources,
    testSources: runContext.testSources,
    reportDir: runContext.reportDir,
    reportPath,
    runBatch: (jsonOutput, timeout, sources, options) =>
      runBatch({ ...runContext, ...options }, jsonOutput, timeout, sources)
  }
  const { totalSurvived, totalKilled = 0, failures } = await runIncremental(
    incrementalConfig, jsonOutput, timeout, runContext.out
  )
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
  const result = await runBatch(runContext, jsonOutput, timeout)
  const { totalSurvived, failures } = result
  const exitCode = (totalSurvived + failures) ? 1 : 0
  return {
    exitCode,
    stats: {
      killed: result.totalKilled,
      survived: result.totalSurvived,
      timedOut: result.totalTimedOut,
      fileCount: Object.keys(result.fileResults).length
    }
  }
}

async function runSingleMode(runContext, parsed, timeout) {
  const progress = runContext.progress
    ? createSingleFileProgress(
        runContext.out,
        relative(process.cwd(), parsed.sourceFile)
      )
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
  const result = await getSingleRunResult(runContext, runOptions)
  const { error, survived, killed, timedOut } = result
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

function createSingleFileProgress(out, displayPath) {
  const reporter = createProgressReporter(
    [displayPath], { write: out.error }
  )
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

export function scoreExitCode({ killed, survived, timedOut }, minScore) {
  const effectiveKilled = killed + timedOut
  const total = effectiveKilled + survived
  const score = calculateScore(effectiveKilled, total)
  return score >= minScore ? 0 : 1
}

function filterChanged(sources) {
  const changed = new Set(gitChangedFiles())
  return sources.filter(source => changed.has(source))
}

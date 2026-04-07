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

  async function runBatch(jsonOutput, timeout, sourcesToRun = sources) {
    const sep = SEPARATOR
    console.log(`\n${sep}`)
    console.log(`MUTAGEN — BATCH MODE`)
    console.log(`   Sources: ${sourcesToRun.length} file(s)\n`)

    let totalSurvived = 0
    let totalKilled = 0
    let totalTimedOut = 0
    let failures = 0
    const fileResults = {}

    function collectResult(result) {
      if (result.error) {
        failures++
      } else {
        totalSurvived += result.survived
        totalKilled += result.killed
        totalTimedOut += result.timedOut || 0
        if (result.jsonData)
          fileResults[result.jsonData.path] = { mutants: result.jsonData.mutants }
      }
    }

    for (const source of sourcesToRun)
      collectResult(await runSingle(
        resolve(source), prepared, createRunner, null, timeout
      ))

    if (jsonOutput) {
      mkdirSync(reportDir, { recursive: true })
      const report = {
        schemaVersion: '1',
        thresholds: { high: 80, low: 60 },
        files: fileResults
      }
      writeFileSync(reportPath, JSON.stringify(report, null, 2))
      console.log(`JSON report: ${reportPath}`)
    }

    console.log(`\n${sep}`)
    console.log(`BATCH SUMMARY`)
    console.log(sep)
    console.log(`Files: ${sourcesToRun.length}  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
    if (totalTimedOut > 0)
      console.log(`Timed out: ${totalTimedOut} (counted as killed)`)
    console.log(`${sep}\n`)

    return { totalSurvived, totalKilled, totalTimedOut, failures, fileResults }
  }

  async function run(argv) {
    const parsed = parseArgs(argv)
    if (parsed.error) {
      console.error(parsed.error)
      return 1
    }
    const timeout = parsed.timeout || configTimeout
    if (parsed.diffMode) {
      const result = diffReports(parsed.beforeFile, parsed.afterFile)
      return result.regressions > 0 ? 1 : 0
    }
    if (parsed.dryRunMode && parsed.allMode) {
      let total = 0
      for (const source of sources) total += dryRun(resolve(source), prepared, null)
      console.log(`\n  Grand total: ${total} mutations across ${sources.length} files`)
      return 0
    }
    if (parsed.dryRunMode) {
      dryRun(parsed.sourceFile, prepared, parsed.targetLine)
      return 0
    }
    if (parsed.incrementalMode) {
      const incrementalConfig = { sources, testSources, reportDir, reportPath, runBatch }
      const { totalSurvived, failures } = await runIncremental(incrementalConfig, parsed.jsonOutput, timeout)
      return totalSurvived > 0 || failures > 0 ? 1 : 0
    }
    if (parsed.allMode) {
      const { totalSurvived, failures } = await runBatch(parsed.jsonOutput, timeout)
      return totalSurvived > 0 || failures > 0 ? 1 : 0
    }
    const result = await runSingle(
      parsed.sourceFile, prepared, createRunner, parsed.targetLine, timeout
    )
    return result.error || result.survived > 0 ? 1 : 0
  }

  return {
    runBatch,
    runIncremental(jsonOutput, timeout) {
      return runIncremental({ sources, testSources, reportDir, reportPath, runBatch }, jsonOutput, timeout)
    },
    run,
    async main() {
      process.exit(await run())
    }
  }
}

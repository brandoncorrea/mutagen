/**
 * Manual mutation runner factory.
 * Projects create a runner with their config and call .main() to run.
 *
 * Usage (from project entry script):
 *   createManualRunner({ patterns, sources, createRunner }).main()
 */

import { prepareMutationConfig } from '../core/generate.js'
import { resolveGlobs } from '../core/resolve-globs.js'
import { runBatch } from './runner/index.js'
import { runIncremental } from './incremental.js'
import { defaultOut } from './shared.js'
import { run, scoreExitCode } from './dispatch.js'

export { scoreExitCode }

/**
 * Create a manual mutation runner with project-specific config.
 *
 * @param {Object} config
 * @param {Array} config.mutators - AST visitor mutators
 * @param {Array<string>} [config.sources] - explicit source files
 * @param {Array<string>} [config.include] - glob patterns for source files
 * @param {Array<string>} [config.exclude] - glob patterns to exclude
 * @param {string} [config.cwd=process.cwd()] - base directory for globs
 * @param {Function} config.createRunner - async (sourceFile) => { run, close }
 * @param {string} [config.reportDir='reports/mutation'] - directory for reports
 * @param {string} [config.reportFile] - JSON report filename
 * @param {number} [config.timeout=null] - default per-mutation timeout in ms
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
    out = defaultOut()
  } = config

  const sources = explicitSources?.length ? explicitSources
    : include ? resolveGlobs({ include, exclude, cwd })
    : []

  const testSources = explicitTestSources.length ? explicitTestSources
    : testInclude
      ? resolveGlobs({ include: testInclude, exclude: testExclude, cwd })
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
    runIncremental: (jsonOutput, timeout) => {
      const incrementalConfig = {
        sources, testSources, reportDir, reportPath,
        runBatch: runBatch.bind(null, runContext)
      }
      return runIncremental(incrementalConfig, jsonOutput, timeout, out)
    },
    run: argv => run(runContext, argv),
    async main() {
      process.exit(await run(runContext))
    }
  }
}

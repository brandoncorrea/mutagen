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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

import { generateMutations, preparePatterns } from '../core/engine.js'
import { toJsonMutants, printRunReport, diffReports } from './report.js'

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex').slice(0, 16)
}

export function dryRun(sourceFile, prepared, targetLine) {
  const source = readFileSync(sourceFile, 'utf-8')
  const mutations = generateMutations(source, prepared, targetLine)
  const relPath = relative(process.cwd(), sourceFile)

  console.log(`\nDRY RUN — ${relPath}`)
  console.log(`   Found ${mutations.length} mutation(s)\n`)

  const byLine = {}
  for (const m of mutations) {
    const arr = byLine[m.line] || []
    arr.push(m.name)
    byLine[m.line] = arr
  }

  for (const [line, names] of Object.entries(byLine).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  L${line}: ${names.join(', ')}`)
  }

  console.log(`\n  Total: ${mutations.length} mutations`)
  return mutations.length
}

export function parseArgs() {
  const args = process.argv.slice(2)
  const jsonOutput = args.includes('--json')
  const dryRunMode = args.includes('--dry-run')

  if (args.includes('--incremental'))
    return { incrementalMode: true, jsonOutput, timeout: parseTimeout(args) }

  if (args.includes('--all'))
    return { allMode: true, jsonOutput, dryRunMode, timeout: parseTimeout(args) }

  const diffIdx = args.indexOf('--diff')
  if (diffIdx >= 0) {
    const beforeFile = args[diffIdx + 1]
    const afterFile = args[diffIdx + 2]
    if (!beforeFile || !afterFile) {
      console.error('Usage: <script> --diff <before.json> <after.json>')
      process.exit(1)
    }
    return { diffMode: true, beforeFile: resolve(beforeFile), afterFile: resolve(afterFile) }
  }

  const flags = new Set(['--json', '--dry-run'])
  const filtered = []
  let lineValue = null
  let timeout = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--line')
      lineValue = parseInt(args[++i], 10)
    else if (args[i] === '--timeout')
      timeout = parseInt(args[++i], 10)
    else if (!flags.has(args[i]))
      filtered.push(args[i])
  }

  if (filtered.length < 1) {
    console.error('Usage: <script> <source-file> [--line N] [--json] [--dry-run] [--timeout N]')
    console.error('       <script> --all [--json] [--dry-run] [--timeout N]')
    console.error('       <script> --incremental [--json] [--timeout N]')
    process.exit(1)
  }

  const sourceFile = resolve(filtered[0])

  return { sourceFile, targetLine: lineValue, jsonOutput, dryRunMode, timeout }
}

function parseTimeout(args) {
  const idx = args.indexOf('--timeout')
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null
}



function withTimeout(fn, ms) {
  if (!ms) return fn()
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Mutation timed out after ${ms}ms`)), ms)),
  ])
}

async function runSingle(sourceFile, prepared, createRunner, targetLine, timeout, log) {
  const out = log || console.log
  const original = readFileSync(sourceFile, 'utf-8')
  const sep = '═'.repeat(60)

  out(`\n${sep}`)
  out(`MUTAGEN`)
  out(sep)
  out(`Source: ${sourceFile}`)
  if (targetLine) out(`Target: line ${targetLine}`)
  if (timeout) out(`Timeout: ${timeout}ms per mutation`)

  const runner = await createRunner(sourceFile)

  try {
    out(`\nPre-flight: running tests against original source...`)
    const preflight = await runner.run()
    if (!preflight.passed) {
      out(`\nABORT: Tests already FAILING on original source. Fix the suite first.`)
      return { error: true }
    }
    out(`Tests pass on original source. Beginning mutations.\n`)

    const mutations = generateMutations(original, prepared, targetLine)
    out(`Found ${mutations.length} mutation(s) to run.\n`)

    const results = { killed: [], survived: [], timedOut: [] }

    for (let i = 0; i < mutations.length; i++) {
      const mut = mutations[i]

      try {
        writeFileSync(sourceFile, mut.source)
        const result = await withTimeout(() => runner.run(), timeout)

        if (result.passed) {
          results.survived.push(mut)
          out(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... SURVIVED`)
        } else {
          mut.killedBy = result.killedBy || []
          results.killed.push(mut)
          out(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... killed`)
        }
      } catch (err) {
        if (err.message?.includes('timed out')) {
          results.timedOut.push(mut)
          out(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... TIMEOUT (killed)`)
        } else {
          results.killed.push(mut)
          out(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... killed (error)`)
        }
      } finally {
        writeFileSync(sourceFile, original)
      }
    }

    printRunReport(mutations, results, out)

    return {
      survived: results.survived.length,
      killed: results.killed.length + results.timedOut.length,
      timedOut: results.timedOut.length,
      jsonData: toJsonMutants(sourceFile, results)
    }
  } finally {
    await runner.close()
  }
}

/**
 * Create a manual mutation runner with project-specific config.
 *
 * @param {Object} config
 * @param {Array} config.patterns - mutation patterns (combine built-in + custom)
 * @param {Array<string>} config.sources - source files to mutate (for --all batch mode)
 * @param {Function} config.createRunner - async (sourceFile) => { run, close }
 * @param {string} [config.reportDir='reports/mutation'] - directory for JSON reports
 * @param {string} [config.reportFile] - JSON report filename (default: manual-report.json)
 */
export function createManualRunner(config) {
  const {
    patterns,
    sources = [],
    testSources = [],
    createRunner,
    reportDir = 'reports/mutation',
    reportFile = 'manual-report.json'
  } = config

  const prepared = preparePatterns(patterns)
  const reportPath = `${reportDir}/${reportFile}`

  async function runBatch(jsonOutput, timeout, sourcesToRun = sources) {
    const sep = '═'.repeat(60)
    console.log(`\n${sep}`)
    console.log(`MUTAGEN — BATCH MODE`)
    console.log(`   Sources: ${sourcesToRun.length} file(s)\n`)

    let totalSurvived = 0
    let totalKilled = 0
    let totalTimedOut = 0
    let failures = 0
    const jsonFiles = {}

    function collectResult(result) {
      if (result.error) {
        failures++
      } else {
        totalSurvived += result.survived
        totalKilled += result.killed
        totalTimedOut += result.timedOut || 0
        if (result.jsonData) {
          jsonFiles[result.jsonData.path] = { mutants: result.jsonData.mutants }
        }
      }
    }

    for (const source of sourcesToRun) {
      collectResult(await runSingle(
        resolve(source), prepared, createRunner, null, timeout
      ))
    }

    if (jsonOutput) {
      mkdirSync(reportDir, { recursive: true })
      const report = { schemaVersion: '1', thresholds: { high: 80, low: 60 }, files: jsonFiles }
      writeFileSync(reportPath, JSON.stringify(report, null, 2))
      console.log(`JSON report: ${reportPath}`)
    }

    console.log(`\n${sep}`)
    console.log(`BATCH SUMMARY`)
    console.log(sep)
    console.log(`Files: ${sourcesToRun.length}  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
    if (totalTimedOut > 0) console.log(`Timed out: ${totalTimedOut} (counted as killed)`)
    console.log(`${sep}\n`)

    return { totalSurvived, totalKilled, totalTimedOut, failures, jsonFiles }
  }

  async function runIncremental(jsonOutput, timeout) {
    const sep = '═'.repeat(60)

    // Load previous report if it exists
    let previousReport = null
    let previousHashes = {}
    let previousTestHashes = {}
    if (existsSync(reportPath)) {
      try {
        previousReport = JSON.parse(readFileSync(reportPath, 'utf-8'))
        previousHashes = previousReport.sourceHashes || {}
        previousTestHashes = previousReport.testHashes || {}
      } catch {}
    }

    // Hash test files and find which changed
    const currentTestHashes = {}
    const changedTestFiles = []
    for (const testFile of testSources) {
      const absPath = resolve(testFile)
      const relPath = relative(process.cwd(), absPath)
      const hash = hashFile(absPath)
      currentTestHashes[relPath] = hash
      if (previousTestHashes[relPath] !== hash) {
        changedTestFiles.push(relPath)
      }
    }

    // Find source files invalidated by changed tests via killedBy attribution
    const testInvalidated = new Set()
    if (changedTestFiles.length > 0 && previousReport) {
      const changedTestAbs = new Set(changedTestFiles.map(t => resolve(t)))
      for (const [sourcePath, fileData] of Object.entries(previousReport.files)) {
        for (const m of fileData.mutants) {
          if (m.killedBy?.some(t => changedTestAbs.has(t))) {
            testInvalidated.add(sourcePath)
            break
          }
          // Also invalidate sources with surviving mutations — changed tests might now kill them
          if (m.status === 'Survived') {
            testInvalidated.add(sourcePath)
            break
          }
        }
      }
    }

    // Hash current sources and find changed files
    const currentHashes = {}
    const changedSources = []
    const unchangedSources = []

    for (const source of sources) {
      const absPath = resolve(source)
      const relPath = relative(process.cwd(), absPath)
      const hash = hashFile(absPath)
      currentHashes[relPath] = hash

      if (previousHashes[relPath] !== hash || testInvalidated.has(relPath)) {
        changedSources.push(source)
      } else {
        unchangedSources.push(relPath)
      }
    }

    console.log(`\n${sep}`)
    console.log(`MUTAGEN — INCREMENTAL MODE`)
    console.log(sep)
    console.log(`Total sources: ${sources.length}`)
    console.log(`Changed/new:   ${changedSources.length}${testInvalidated.size > 0 ? ` (${testInvalidated.size} from test changes)` : ''}`)
    console.log(`Cached:        ${unchangedSources.length}`)
    if (changedTestFiles.length > 0)
      console.log(`Changed tests: ${changedTestFiles.length}`)

    if (changedSources.length === 0) {
      console.log(`\nNo files changed since last report. Nothing to do.`)

      // Still write report with updated hashes
      if (jsonOutput && previousReport) {
        previousReport.sourceHashes = currentHashes
        previousReport.testHashes = currentTestHashes
        writeFileSync(reportPath, JSON.stringify(previousReport, null, 2))
      }

      const cachedCounts = countCachedResults(previousReport, unchangedSources)
      console.log(`\n${sep}`)
      console.log(`INCREMENTAL SUMMARY (all cached)`)
      console.log(sep)
      console.log(`Files: ${sources.length}  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}  |  Rerun: 0`)
      console.log(`${sep}\n`)
      return { totalSurvived: cachedCounts.survived, totalKilled: cachedCounts.killed, failures: 0 }
    }

    // Run mutations only on changed files
    const { totalSurvived, totalKilled, totalTimedOut, failures, jsonFiles } =
      await runBatch(false, timeout, changedSources)

    // Merge with cached results from unchanged files
    if (jsonOutput) {
      const mergedFiles = { ...jsonFiles }

      // Carry forward results from unchanged files
      if (previousReport) {
        for (const relPath of unchangedSources) {
          if (previousReport.files[relPath]) {
            mergedFiles[relPath] = previousReport.files[relPath]
          }
        }
      }

      // Remove files that no longer exist in sources
      const currentRelPaths = new Set(sources.map(s => relative(process.cwd(), resolve(s))))
      for (const key of Object.keys(mergedFiles)) {
        if (!currentRelPaths.has(key)) delete mergedFiles[key]
      }

      mkdirSync(reportDir, { recursive: true })
      const report = {
        schemaVersion: '1',
        thresholds: { high: 80, low: 60 },
        files: mergedFiles,
        sourceHashes: currentHashes,
        testHashes: currentTestHashes
      }
      writeFileSync(reportPath, JSON.stringify(report, null, 2))
      console.log(`JSON report: ${reportPath}`)
    }

    // Count cached results for summary
    const cachedCounts = countCachedResults(previousReport, unchangedSources)

    const grandKilled = totalKilled + cachedCounts.killed
    const grandSurvived = totalSurvived + cachedCounts.survived

    console.log(`\n${sep}`)
    console.log(`INCREMENTAL SUMMARY`)
    console.log(sep)
    console.log(`Rerun: ${changedSources.length} files  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
    console.log(`Cached: ${unchangedSources.length} files  |  Killed: ${cachedCounts.killed}  |  Survived: ${cachedCounts.survived}`)
    console.log(`Total: ${sources.length} files  |  Killed: ${grandKilled}  |  Survived: ${grandSurvived}`)
    console.log(`${sep}\n`)

    return { totalSurvived: grandSurvived, totalKilled: grandKilled, failures }
  }

  return {
    runBatch,
    runIncremental,
    async main() {
      const parsed = parseArgs()
      if (parsed.diffMode) {
        const result = diffReports(parsed.beforeFile, parsed.afterFile)
        process.exit(result.regressions > 0 ? 1 : 0)
      }
      if (parsed.dryRunMode && parsed.allMode) {
        let total = 0
        for (const source of sources) total += dryRun(resolve(source), prepared, null)
        console.log(`\n  Grand total: ${total} mutations across ${sources.length} files`)
        return
      }
      if (parsed.dryRunMode) {
        dryRun(parsed.sourceFile, prepared, parsed.targetLine)
        return
      }
      if (parsed.incrementalMode) {
        const { totalSurvived, failures } = await runIncremental(parsed.jsonOutput, parsed.timeout)
        process.exit(totalSurvived > 0 || failures > 0 ? 1 : 0)
      }
      if (parsed.allMode) {
        const { totalSurvived, failures } = await runBatch(parsed.jsonOutput, parsed.timeout)
        process.exit(totalSurvived > 0 || failures > 0 ? 1 : 0)
      }
      const result = await runSingle(
        parsed.sourceFile, prepared, createRunner, parsed.targetLine, parsed.timeout
      )
      process.exit(result.error || result.survived > 0 ? 1 : 0)
    }
  }
}

function countCachedResults(report, relPaths) {
  let killed = 0, survived = 0
  if (!report) return { killed, survived }
  for (const relPath of relPaths) {
    const fileData = report.files[relPath]
    if (!fileData) continue
    for (const m of fileData.mutants) {
      if (m.status === 'Killed' || m.status === 'Timeout') killed++
      else if (m.status === 'Survived') survived++
    }
  }
  return { killed, survived }
}

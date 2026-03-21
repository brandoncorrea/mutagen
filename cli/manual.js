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
 *   node mutate.js --diff <before.json> <after.json>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'

import { generateMutations, preparePatterns } from '../core/engine.js'
import { toJsonMutants, printRunReport, diffReports } from './report.js'

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

async function runSingle(sourceFile, prepared, createRunner, targetLine, timeout) {
  const original = readFileSync(sourceFile, 'utf-8')
  const sep = '═'.repeat(60)

  console.log(`\n${sep}`)
  console.log(`MUTAGEN`)
  console.log(sep)
  console.log(`Source: ${sourceFile}`)
  if (targetLine) console.log(`Target: line ${targetLine}`)
  if (timeout) console.log(`Timeout: ${timeout}ms per mutation`)

  const runner = await createRunner(sourceFile)

  try {
    console.log(`\nPre-flight: running tests against original source...`)
    const preflight = await runner.run()
    if (!preflight.passed) {
      console.error(`\nABORT: Tests already FAILING on original source. Fix the suite first.`)
      return { error: true }
    }
    console.log(`Tests pass on original source. Beginning mutations.\n`)

    const mutations = generateMutations(original, prepared, targetLine)
    console.log(`Found ${mutations.length} mutation(s) to run.\n`)

    const results = { killed: [], survived: [], timedOut: [] }

    for (let i = 0; i < mutations.length; i++) {
      const mut = mutations[i]
      process.stdout.write(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... `)

      try {
        writeFileSync(sourceFile, mut.source)
        const result = await withTimeout(() => runner.run(), timeout)

        if (result.passed) {
          results.survived.push(mut)
          console.log('SURVIVED')
        } else {
          results.killed.push(mut)
          console.log('killed')
        }
      } catch (err) {
        if (err.message?.includes('timed out')) {
          results.timedOut.push(mut)
          console.log('TIMEOUT (killed)')
        } else {
          results.killed.push(mut)
          console.log('killed (error)')
        }
      } finally {
        writeFileSync(sourceFile, original)
      }
    }

    printRunReport(mutations, results)

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
    createRunner,
    reportDir = 'reports/mutation',
    reportFile = 'manual-report.json'
  } = config

  const prepared = preparePatterns(patterns)
  const reportPath = `${reportDir}/${reportFile}`

  async function runBatch(jsonOutput, timeout) {
    const sep = '═'.repeat(60)
    console.log(`\n${sep}`)
    console.log(`MUTAGEN — BATCH MODE`)
    console.log(`   Sources: ${sources.length} file(s)\n`)

    let totalSurvived = 0
    let totalKilled = 0
    let totalTimedOut = 0
    let failures = 0
    const jsonFiles = {}

    for (const source of sources) {
      const result = await runSingle(
        resolve(source), prepared, createRunner, null, timeout
      )
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

    if (jsonOutput) {
      mkdirSync(reportDir, { recursive: true })
      const report = { schemaVersion: '1', thresholds: { high: 80, low: 60 }, files: jsonFiles }
      writeFileSync(reportPath, JSON.stringify(report, null, 2))
      console.log(`JSON report: ${reportPath}`)
    }

    console.log(`\n${sep}`)
    console.log(`BATCH SUMMARY`)
    console.log(sep)
    console.log(`Files: ${sources.length}  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
    if (totalTimedOut > 0) console.log(`Timed out: ${totalTimedOut} (counted as killed)`)
    console.log(`${sep}\n`)

    return { totalSurvived, totalKilled, totalTimedOut, failures }
  }

  return {
    runBatch,
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

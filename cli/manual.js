/**
 * Manual mutation runner CLI harness.
 * Projects create a runner with their config and call .main() to run.
 *
 * Usage (from project entry script):
 *   createManualRunner({ patterns, targets, createRunner }).main()
 *
 * CLI:
 *   node mutate.js <source> <test> [--line N] [--json] [--dry-run]
 *   node mutate.js --all [--json] [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'

import { generateMutations, preparePatterns } from '../core/engine.js'
import { toJsonMutants, printRunReport } from './report.js'

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
    return { allMode: true, jsonOutput, dryRunMode }

  const flags = new Set(['--json', '--dry-run'])
  const filtered = []
  let lineValue = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--line')
      lineValue = parseInt(args[++i], 10)
    else if (!flags.has(args[i]))
      filtered.push(args[i])
  }

  if (filtered.length < (dryRunMode ? 1 : 2)) {
    console.error('Usage: <script> <source-file> <test-file> [--line N] [--json]')
    console.error('       <script> <source-file> --dry-run [--line N]')
    console.error('       <script> --all [--json] [--dry-run]')
    process.exit(1)
  }

  const sourceFile = resolve(filtered[0])
  const testFile = filtered[1] ? resolve(filtered[1]) : null

  return { sourceFile, testFile, targetLine: lineValue, jsonOutput, dryRunMode }
}

async function runSingle(sourceFile, testFile, prepared, createRunner, targetLine) {
  const original = readFileSync(sourceFile, 'utf-8')
  const sep = '═'.repeat(60)

  console.log(`\n${sep}`)
  console.log(`MUTAGEN`)
  console.log(sep)
  console.log(`Source: ${sourceFile}`)
  console.log(`Tests:  ${testFile}`)
  if (targetLine) console.log(`Target: line ${targetLine}`)

  const runner = await createRunner(testFile, sourceFile)

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

    const results = { killed: [], survived: [] }

    for (let i = 0; i < mutations.length; i++) {
      const mut = mutations[i]
      process.stdout.write(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... `)

      try {
        writeFileSync(sourceFile, mut.source)
        const result = await runner.run()

        if (result.passed) {
          results.survived.push(mut)
          console.log('SURVIVED')
        } else {
          results.killed.push(mut)
          console.log('killed')
        }
      } finally {
        writeFileSync(sourceFile, original)
      }
    }

    printRunReport(mutations, results)

    return {
      survived: results.survived.length,
      killed: results.killed.length,
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
 * @param {Array} config.targets - [{ source, test }] for --all batch mode
 * @param {Function} config.createRunner - async (testFile, sourceFile) => { run, close }
 * @param {string} [config.reportDir='reports/mutation'] - directory for JSON reports
 * @param {string} [config.reportFile] - JSON report filename (default: manual-report.json)
 */
export function createManualRunner(config) {
  const {
    patterns,
    targets = [],
    createRunner,
    reportDir = 'reports/mutation',
    reportFile = 'manual-report.json'
  } = config

  const prepared = preparePatterns(patterns)
  const reportPath = `${reportDir}/${reportFile}`

  async function runBatch(jsonOutput) {
    const sep = '═'.repeat(60)
    console.log(`\n${sep}`)
    console.log(`MUTAGEN — BATCH MODE`)
    console.log(`   Targets: ${targets.length} file(s)\n`)

    let totalSurvived = 0
    let totalKilled = 0
    let failures = 0
    const jsonFiles = {}

    for (const target of targets) {
      const result = await runSingle(
        resolve(target.source), resolve(target.test),
        prepared, createRunner, null
      )
      if (result.error) {
        failures++
      } else {
        totalSurvived += result.survived
        totalKilled += result.killed
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
    console.log(`Files: ${targets.length}  |  Killed: ${totalKilled}  |  Survived: ${totalSurvived}  |  Errors: ${failures}`)
    console.log(`${sep}\n`)

    return { totalSurvived, totalKilled, failures }
  }

  return {
    runBatch,
    async main() {
      const parsed = parseArgs()
      if (parsed.dryRunMode && parsed.allMode) {
        let total = 0
        for (const target of targets) total += dryRun(resolve(target.source), prepared, null)
        console.log(`\n  Grand total: ${total} mutations across ${targets.length} files`)
        return
      }
      if (parsed.dryRunMode) {
        dryRun(parsed.sourceFile, prepared, parsed.targetLine)
        return
      }
      if (parsed.allMode) {
        const { totalSurvived, failures } = await runBatch(parsed.jsonOutput)
        process.exit(totalSurvived > 0 || failures > 0 ? 1 : 0)
      }
      const result = await runSingle(
        parsed.sourceFile, parsed.testFile,
        prepared, createRunner, parsed.targetLine
      )
      process.exit(result.error || result.survived > 0 ? 1 : 0)
    }
  }
}

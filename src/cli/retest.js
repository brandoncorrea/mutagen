/**
 * Retest mode: re-run only previously-surviving mutations from a JSON report.
 * Verifies that gaps are fixed without a full re-audit.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { generateMutations } from '../core/generate.js'
import { HEADER_SEPARATOR, tryLoadJson, writeStructuredReportFile } from '../core/report-data.js'
import { runSingle, runParallel } from './runner/index.js'
import { printScoreLine } from './report.js'
import { isString } from './shared.js'

/**
 * Extract retest targets from a structured report.
 * Returns the unique files and a Set of survivor keys for filtering.
 */
export function loadRetestTargets(report) {
  const survivors = report.survivors || []
  const survivorKeys = new Set()
  const fileSet = new Set()

  for (const s of survivors) {
    fileSet.add(s.file)
    survivorKeys.add(survivorKey(s.file, s.line, s.name))
  }

  return { files: [...fileSet], survivorKeys }
}

/**
 * Filter generated mutations to only those matching previous survivors.
 * Returns matched mutations and count of survivors that no longer exist.
 */
export function filterMutationsToSurvivors(mutations, filePath, survivorKeys) {
  const fileSurvivors = [...survivorKeys].filter(k => k.startsWith(filePath + ':'))
  const matched = mutations.filter(m =>
    survivorKeys.has(survivorKey(filePath, m.line, m.name))
  )
  const matchedKeys = new Set(matched.map(m => survivorKey(filePath, m.line, m.name)))
  const skipped = fileSurvivors.filter(k => !matchedKeys.has(k)).length

  return { matched, skipped }
}

/**
 * Run retest mode: load report, regenerate mutations for survivor files,
 * filter to only survivor mutations, and run them.
 */
export async function runRetest(runContext, parsed) {
  const { mutationConfig, createRunner, out } = runContext
  const timeout = parsed.timeout || runContext.configTimeout
  const reportPath = parsed.retestReport

  const report = tryLoadJson(reportPath, out)
  if (!report) {
    out(`Error: could not load report from ${reportPath}`)
    return { exitCode: 1 }
  }

  if (!report.survivors?.length) {
    out(`No survivors in report — nothing to retest.`)
    return { exitCode: 0, stats: { killed: 0, survived: 0, timedOut: 0, skipped: 0, fileCount: 0 } }
  }

  const { files, survivorKeys } = loadRetestTargets(report)

  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTAGEN — RETEST MODE`)
  out(`   Report: ${reportPath}`)
  out(`   Survivors to retest: ${survivorKeys.size} across ${files.length} file(s)\n`)

  const result = await retestFiles(files, { mutationConfig, createRunner, timeout, survivorKeys, parallel: parsed.parallel, out })

  writeRetestReport(parsed, files.length, result.fileResults)
  printRetestSummary(out, result)

  return {
    exitCode: result.totalSurvived || result.failures ? 1 : 0,
    stats: {
      killed: result.totalKilled,
      survived: result.totalSurvived,
      timedOut: result.totalTimedOut,
      skipped: result.totalSkipped,
      fileCount: files.length
    }
  }
}

async function retestFiles(files, { mutationConfig, createRunner, timeout, survivorKeys, parallel, out }) {
  let totalKilled = 0
  let totalSurvived = 0
  let totalTimedOut = 0
  let totalSkipped = 0
  let failures = 0
  const fileResults = {}

  for (const file of files) {
    const absPath = resolve(file)
    let source
    try {
      source = readFileSync(absPath, 'utf-8')
    } catch {
      out(`  Skipping ${file} — file not found`)
      totalSkipped += [...survivorKeys].filter(k => k.startsWith(file + ':')).length
      continue
    }

    const allMutations = generateMutations(source, mutationConfig)
    const { matched, skipped } = filterMutationsToSurvivors(allMutations, file, survivorKeys)
    totalSkipped += skipped

    if (skipped)
      out(`  ${file}: ${skipped} survivor(s) no longer exist (line shifted or code deleted)`)

    if (!matched.length) {
      out(`  ${file}: no matching mutations — all survivors gone`)
      continue
    }

    out(`  ${file}: retesting ${matched.length} mutation(s)`)

    const opts = {
      sourceFile: absPath,
      mutationConfig,
      createRunner,
      timeout,
      survivorsOnly: false,
      out,
      retestMutations: matched
    }

    const result = parallel
      ? await runParallel({ ...opts, workerCount: isNumber(parallel) ? parallel : undefined })
      : await runSingle(opts)

    if (result.error) {
      failures++
    } else {
      totalKilled += result.killed
      totalSurvived += result.survived
      totalTimedOut += result.timedOut || 0
      fileResults[result.jsonData.path] = { mutants: result.jsonData.mutants }
    }
  }

  return { totalKilled, totalSurvived, totalTimedOut, totalSkipped, failures, fileResults }
}

function writeRetestReport(parsed, fileCount, fileResults) {
  if (isString(parsed.jsonOutput)) {
    const stats = writeStructuredReportFile(parsed.jsonOutput, fileResults)
    printScoreLine(stats, fileCount, parsed.jsonOutput)
  } else if (parsed.jsonOutput) {
    const outputPath = 'reports/mutation/retest-report.json'
    const stats = writeStructuredReportFile(outputPath, fileResults)
    printScoreLine(stats, fileCount, outputPath)
  }
}

function printRetestSummary(out, { totalKilled, totalSurvived, totalTimedOut, totalSkipped, failures }) {
  out(`\n${HEADER_SEPARATOR}`)
  out(`RETEST SUMMARY`)
  out(HEADER_SEPARATOR)
  out(`Retested: ${totalKilled + totalSurvived}  |  Killed: ${totalKilled}  |  Still surviving: ${totalSurvived}  |  Skipped: ${totalSkipped}  |  Errors: ${failures}`)
  if (totalTimedOut)
    out(`Timed out: ${totalTimedOut} (counted as killed)`)
  out(HEADER_SEPARATOR)

  const allKilled = !totalSurvived && !failures
  if (allKilled && !totalSkipped)
    out(`\nAll previous survivors are now killed!`)
  else if (allKilled)
    out(`\nAll retestable survivors are now killed. ${totalSkipped} could not be retested (code changed).`)
  out('')
}

function survivorKey(file, line, name) {
  return `${file}:${line}:${name}`
}

function isNumber(value) {
  return typeof value === 'number'
}

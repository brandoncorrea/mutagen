/**
 * Retest mode: re-run only previously-surviving mutations from a JSON report.
 * Verifies that gaps are fixed without a full re-audit.
 */

import { readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

import { generateMutations } from '../core/generate.js'
import { assignMutationIds } from '../core/mutation-id.js'
import { tryLoadJson, writeStructuredReportFile } from '../core/report-data.js'
import { runSingle, runParallel } from './runner/index.js'
import { printScoreLine } from './report.js'
import { isString, HEADER_SEPARATOR } from './shared.js'

/**
 * Extract retest targets from a structured report.
 * Returns the unique files and a Set of survivor IDs for filtering.
 */
export function loadRetestTargets(report) {
  const survivors = report.survivors || []
  const survivorIds = new Set()
  const fileSet = new Set()

  for (const { id, file } of survivors) {
    if (id) survivorIds.add(id)
    fileSet.add(file)
  }

  return { files: [...fileSet], survivorIds }
}

/**
 * Filter generated mutations to only those matching previous survivors.
 * Mutations must have IDs assigned before calling this function.
 * Returns matched mutations and count of survivors that no longer exist.
 */
export function filterMutationsToSurvivors(mutations, survivorIds) {
  const matched = mutations.filter(mutation => survivorIds.has(mutation.id))
  const matchedIds = new Set(matched.map(mutation => mutation.id))
  const skipped = [...survivorIds].filter(id => !matchedIds.has(id)).length

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
    out.log(`Error: could not load report from ${reportPath}`)
    return { exitCode: 1 }
  }

  if (!report.survivors?.length) {
    out.log(`No survivors in report — nothing to retest.`)
    return {
      exitCode: 0,
      stats: {
        killed: 0,
        survived: 0,
        timedOut: 0,
        skipped: 0,
        fileCount: 0
      }
    }
  }

  const { files, survivorIds } = loadRetestTargets(report)

  out.log(`\n${HEADER_SEPARATOR}`)
  out.log(`MUTAGEN — RETEST MODE`)
  out.log(`   Report: ${reportPath}`)
  out.log(`   Survivors to retest: ${survivorIds.size} across ${files.length} file(s)\n`)

  const result = await retestFiles(files, {
    mutationConfig, createRunner, timeout,
    survivorIds, parallel: parsed.parallel, out
  })

  writeRetestReport(
    out, parsed, files.length, result.fileResults
  )
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

async function retestFiles(files, options) {
  let totalKilled = 0
  let totalSurvived = 0
  let totalTimedOut = 0
  let totalSkipped = 0
  let failures = 0
  const fileResults = {}

  for (const file of files) {
    const result = await retestOneFile(file, options)
    totalSkipped += result.skipped
    if (result.error) {
      failures++
    } else if (result.fileResult) {
      totalKilled += result.killed
      totalSurvived += result.survived
      totalTimedOut += result.timedOut
      const { path, mutants } = result.fileResult
      fileResults[path] = { mutants }
    }
  }

  return {
    totalKilled, totalSurvived, totalTimedOut,
    totalSkipped, failures, fileResults
  }
}

async function retestOneFile(file, options) {
  const { survivorIds, out } = options
  const loaded = loadRetestMutations(file, options)
  if (loaded.done) return loaded.result

  const { matched, skipped, absPath } = loaded
  out.log(`  ${file}: retesting ${matched.length} mutation(s)`)

  const opts = {
    sourceFile: absPath,
    mutationConfig: options.mutationConfig,
    createRunner: options.createRunner,
    timeout: options.timeout,
    survivorsOnly: false,
    out,
    retestMutations: matched
  }

  const result = await runResult(options.parallel, opts)
  if (result.error)
    return toErrorResult(skipped)
  return toRetestResult(result, skipped)
}

function loadRetestMutations(file, { mutationConfig, survivorIds, out }) {
  const absPath = resolve(file)
  let source
  try {
    source = readFileSync(absPath, 'utf-8')
  } catch {
    out.log(`  Skipping ${file} — file not found`)
    return { done: true, result: toEmptyResult(0) }
  }

  const allMutations = generateMutations(source, mutationConfig)
  const relPath = relative(process.cwd(), absPath)
  assignMutationIds(allMutations, relPath)
  const { matched, skipped } = filterMutationsToSurvivors(
    allMutations, survivorIds
  )

  if (skipped)
    out.log(
      `  ${file}: ${skipped} survivor(s) no longer exist`
      + ` (line shifted or code deleted)`
    )

  if (!matched.length) {
    out.log(
      `  ${file}: no matching mutations — all survivors gone`
    )
    return { done: true, result: toEmptyResult(skipped) }
  }

  return { done: false, matched, skipped, absPath }
}

function toEmptyResult(skipped) {
  return {
    skipped, killed: 0, survived: 0,
    timedOut: 0, error: false, fileResult: null
  }
}

function toErrorResult(skipped) {
  return {
    skipped,
    killed: 0,
    survived: 0,
    timedOut: 0,
    error: true,
    fileResult: null
  }
}

function toRetestResult({ killed, survived, timedOut, jsonData }, skipped) {
  return {
    skipped,
    killed,
    survived,
    timedOut: timedOut || 0,
    error: false,
    fileResult: {
      path: jsonData.path,
      mutants: jsonData.mutants
    }
  }
}

async function runResult(parallel, options) {
  const workerCount = typeof parallel === 'number'
    ? parallel : undefined
  return parallel
    ? await runParallel({ ...options, workerCount })
    : await runSingle(options)
}

function writeRetestReport(out, parsed, fileCount, fileResults) {
  if (!parsed.jsonOutput) return
  const outputPath = isString(parsed.jsonOutput)
    ? parsed.jsonOutput
    : 'reports/mutation/retest-report.json'
  const stats = writeStructuredReportFile(
    outputPath, fileResults
  )
  printScoreLine(out, stats, fileCount, outputPath)
}

function printRetestSummary(
  out,
  { totalKilled, totalSurvived, totalTimedOut,
    totalSkipped, failures }
) {
  out.log(`\n${HEADER_SEPARATOR}`)
  out.log(`RETEST SUMMARY`)
  out.log(HEADER_SEPARATOR)
  out.log(
    `Retested: ${totalKilled + totalSurvived}`
    + `  |  Killed: ${totalKilled}`
    + `  |  Still surviving: ${totalSurvived}`
    + `  |  Skipped: ${totalSkipped}`
    + `  |  Errors: ${failures}`
  )
  if (totalTimedOut)
    out.log(`Timed out: ${totalTimedOut} (counted as killed)`)
  out.log(HEADER_SEPARATOR)

  const allKilled = !totalSurvived && !failures
  if (allKilled && !totalSkipped)
    out.log(`\nAll previous survivors are now killed!`)
  else if (allKilled)
    out.log(
      `\nAll retestable survivors are now killed.`
      + ` ${totalSkipped} could not be retested (code changed).`
    )
  out.log('')
}

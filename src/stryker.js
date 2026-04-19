/**
 * Optional Stryker integration utilities.
 * Import only if your project uses Stryker alongside mutagen.
 */

const STRYKER_TIMEOUT_MS = 600_000

import { execFileSync } from 'node:child_process'
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'

import { countStatuses } from './core/mutation-status.js'
import { HEADER_SEPARATOR, combineReportData } from './core/report-data.js'
import { printSummary } from './cli/report.js'

export function cleanStaleSandboxes(out) {
  const strykerTmp = '.stryker-tmp'
  if (!existsSync(strykerTmp)) return
  rmSync(strykerTmp, { recursive: true, force: true })
  out.log('Cleaned stale .stryker-tmp directory')
}

export function clearIncrementalCache(
  cacheFile = 'reports/stryker-incremental.json', out
) {
  if (!existsSync(cacheFile)) return
  rmSync(cacheFile)
  out.log('Cleared incremental cache between scoped runs')
}

export function runStrykerScope(
  name, scope,
  { reportDir = 'reports/mutation', strykerJson, out } = {}
) {
  const outputJson = strykerJson || `${reportDir}/report.json`
  const mutateArg = scope.join(',')
  const targetFile = `${reportDir}/${name}-report.json`

  out.log(`\n${HEADER_SEPARATOR}`)
  out.log(`STRYKER — ${name.toUpperCase()}`)
  out.log(`${HEADER_SEPARATOR}\n`)

  try {
    execFileSync(
      'npx',
      ['stryker', 'run', '--mutate', mutateArg],
      { stdio: 'inherit', timeout: STRYKER_TIMEOUT_MS }
    )
  } catch (err) {
    if (isUnexpectedError(err))
      out.log(`  Stryker ${name} crashed (exit ${err.status}): ${err.message}`)
  }

  if (existsSync(outputJson)) {
    renameSync(outputJson, targetFile)
    out.log(`\nReport saved: ${targetFile}`)
  }

  return targetFile
}

function isUnexpectedError(err) {
  return !err.status || err.status > 1
}

export function mergeReports(
  files,
  { outputPath = 'reports/mutation/report.json', out } = {}
) {
  const merged = combineReportData(files, out)
  writeFileSync(outputPath, JSON.stringify(merged, null, 2))

  const counts = countStatuses(merged)
  printSummary(merged, counts, outputPath, out)

  return counts.survived
}

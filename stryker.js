/**
 * Optional Stryker integration utilities.
 * Import only if your project uses Stryker alongside mutagen.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'

import { countStatuses, HEADER_SEPARATOR, combineReportData } from './core/report-data.js'
import { printSummary } from './cli/report.js'

function isUnexpectedError(err) {
  return !err.status || err.status > 1
}

export function cleanStaleSandboxes(out = console.log) {
  const strykerTmp = '.stryker-tmp'
  if (!existsSync(strykerTmp)) return
  rmSync(strykerTmp, { recursive: true, force: true })
  out('Cleaned stale .stryker-tmp directory')
}

export function clearIncrementalCache(cacheFile = 'reports/stryker-incremental.json', out = console.log) {
  if (!existsSync(cacheFile)) return
  rmSync(cacheFile)
  out('Cleared incremental cache between scoped runs')
}

export function runStrykerScope(name, scope, { reportDir = 'reports/mutation', strykerJson, out = console.log } = {}) {
  const outputJson = strykerJson || `${reportDir}/report.json`
  const mutateArg = scope.join(',')
  const targetFile = `${reportDir}/${name}-report.json`

  out(`\n${HEADER_SEPARATOR}`)
  out(`STRYKER — ${name.toUpperCase()}`)
  out(`${HEADER_SEPARATOR}\n`)

  try {
    execFileSync(
      'npx',
      ['stryker', 'run', '--mutate', mutateArg],
      { stdio: 'inherit', timeout: 600000 }
    )
  } catch (err) {
    if (isUnexpectedError(err))
      out(`  Stryker ${name} crashed (exit ${err.status}): ${err.message}`)
  }

  if (existsSync(outputJson)) {
    renameSync(outputJson, targetFile)
    out(`\nReport saved: ${targetFile}`)
  }

  return targetFile
}

export function mergeReports(files, { outputPath = 'reports/mutation/report.json', out = console.log } = {}) {
  const merged = combineReportData(files, out)
  writeFileSync(outputPath, JSON.stringify(merged, null, 2))

  const counts = countStatuses(merged)
  printSummary(merged, counts, outputPath, out)

  return counts.survived
}

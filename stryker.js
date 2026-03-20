/**
 * Optional Stryker integration utilities.
 * Import only if your project uses Stryker alongside mutagen.
 */

import { execSync } from 'node:child_process'
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'

import { combineReportData, countStatuses, printSummary } from './cli/report.js'

export function isUnexpectedError(err) {
  return err.status == null || err.status > 1
}

export function cleanStaleSandboxes() {
  const strykerTmp = '.stryker-tmp'
  if (existsSync(strykerTmp)) {
    rmSync(strykerTmp, { recursive: true, force: true })
    console.log('Cleaned stale .stryker-tmp directory')
  }
}

export function clearIncrementalCache(cacheFile = 'reports/stryker-incremental.json') {
  if (existsSync(cacheFile)) {
    rmSync(cacheFile)
    console.log('Cleared incremental cache between scoped runs')
  }
}

export function runStrykerScope(name, scope, { reportDir = 'reports/mutation', strykerJson } = {}) {
  const outputJson = strykerJson || `${reportDir}/report.json`
  const mutateArg = scope.join(',')
  const targetFile = `${reportDir}/${name}-report.json`
  const sep = '═'.repeat(60)

  console.log(`\n${sep}`)
  console.log(`STRYKER — ${name.toUpperCase()}`)
  console.log(`${sep}\n`)

  try {
    execSync(
      `npx stryker run --mutate '${mutateArg}'`,
      { stdio: 'inherit', timeout: 600000 }
    )
  } catch (err) {
    if (isUnexpectedError(err))
      console.error(`  Stryker ${name} crashed (exit ${err.status}): ${err.message}`)
  }

  if (existsSync(outputJson)) {
    renameSync(outputJson, targetFile)
    console.log(`\nReport saved: ${targetFile}`)
  }

  return targetFile
}

export function mergeReports(files, { outputPath = 'reports/mutation/report.json' } = {}) {
  const merged = combineReportData(files)
  writeFileSync(outputPath, JSON.stringify(merged, null, 2))

  const counts = countStatuses(merged)
  printSummary(merged, counts, outputPath)

  return counts.survived
}

/**
 * Cross-run mutation report comparison and merging.
 * Compare two reports to find regressions, improvements, and new mutants.
 */

import { readFileSync } from 'node:fs'

import { mutantKey, countStatuses, SEPARATOR } from './report.js'

export function combineReportData(files) {
  const merged = {
    files: {},
    schemaVersion: '1',
    thresholds: { high: 80, low: 60 }
  }
  const seen = new Set()
  let duplicates = 0

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8'))
      for (const [path, fileData] of Object.entries(data.files)) {
        if (!merged.files[path])
          merged.files[path] = { ...fileData, mutants: [] }
        for (const mut of fileData.mutants) {
          const key = mutantKey(path, mut)
          if (seen.has(key)) {
            duplicates++
          } else {
            seen.add(key)
            merged.files[path].mutants.push(mut)
          }
        }
      }
    } catch (err) {
      console.log(`  Warning: could not read ${file}: ${err.message}`)
    }
  }

  if (duplicates > 0)
    console.log(`  Deduplicated: ${duplicates} duplicate mutant(s) removed`)

  return merged
}

/**
 * Diff two mutation reports and print a summary of changes.
 * @param {string} beforeFile - path to the baseline report JSON
 * @param {string} afterFile - path to the new report JSON
 */
export function diffReports(beforeFile, afterFile) {
  const before = JSON.parse(readFileSync(beforeFile, 'utf-8'))
  const after = JSON.parse(readFileSync(afterFile, 'utf-8'))

  const changes = classifyChanges(before, after)
  const fileDeltas = computeFileDeltas(before, after)

  printDiffReport(beforeFile, afterFile, before, after, changes, fileDeltas)

  return {
    newlyKilled: changes.newlyKilled.length,
    regressions: changes.regressions.length,
    newMutants: changes.newMutants.length,
    removedMutants: changes.removedMutants.length
  }
}

function classifyChanges(before, after) {
  const beforeMap = buildMutantMap(before)
  const afterMap = buildMutantMap(after)
  const allKeys = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])

  const newlyKilled = []
  const regressions = []
  const newMutants = []
  const removedMutants = []

  for (const key of allKeys) {
    const b = beforeMap[key]
    const a = afterMap[key]

    if (!b && a) {
      newMutants.push(a)
    } else if (b && !a) {
      removedMutants.push(b)
    } else if (b && a) {
      const bAlive = isAlive(b.status)
      const aAlive = isAlive(a.status)
      if (bAlive && !aAlive) newlyKilled.push({ before: b, after: a })
      else if (!bAlive && aAlive) regressions.push({ before: b, after: a })
    }
  }

  return { newlyKilled, regressions, newMutants, removedMutants }
}

function computeFileDeltas(before, after) {
  const beforeScores = fileScores(before)
  const afterScores = fileScores(after)
  const allFiles = new Set([...Object.keys(beforeScores), ...Object.keys(afterScores)])

  const deltas = []
  for (const file of allFiles) {
    const bs = beforeScores[file]
    const as = afterScores[file]
    if (!bs && as) {
      deltas.push({ file, before: null, after: as.score, delta: null, label: 'NEW' })
    } else if (bs && !as) {
      deltas.push({ file, before: bs.score, after: null, delta: null, label: 'REMOVED' })
    } else if (bs && as && Math.abs(as.score - bs.score) > 0.05) {
      const delta = as.score - bs.score
      deltas.push({ file, before: bs.score, after: as.score, delta, label: null })
    }
  }

  return deltas
}

function printDiffReport(beforeFile, afterFile, before, after, changes, fileDeltas) {
  const { newlyKilled, regressions, newMutants, removedMutants } = changes
  const sep = SEPARATOR

  console.log(`\n${sep}`)
  console.log(`MUTATION DIFF`)
  console.log(`${sep}`)
  console.log(`Before: ${beforeFile}`)
  console.log(`After:  ${afterFile}\n`)

  const bCounts = countStatuses(before)
  const aCounts = countStatuses(after)
  const bTotal = bCounts.killed + bCounts.survived + bCounts.noCoverage + bCounts.timeout
  const aTotal = aCounts.killed + aCounts.survived + aCounts.noCoverage + aCounts.timeout
  const bScore = bTotal > 0 ? ((bCounts.killed + bCounts.timeout) / bTotal * 100) : 100
  const aScore = aTotal > 0 ? ((aCounts.killed + aCounts.timeout) / aTotal * 100) : 100
  const delta = aScore - bScore

  console.log(`Overall: ${bScore.toFixed(1)}% → ${aScore.toFixed(1)}% (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)`)
  console.log(`Mutations: ${bTotal} → ${aTotal}`)
  console.log(`Killed: ${bCounts.killed} → ${aCounts.killed}  |  Survived: ${bCounts.survived} → ${aCounts.survived}`)

  if (newlyKilled.length > 0) {
    console.log(`\n✓ NEWLY KILLED (${newlyKilled.length}):`)
    for (const { after: a } of newlyKilled)
      console.log(`  ${a.file}:${a.line} ${a.mutatorName}`)
  }

  if (regressions.length > 0) {
    console.log(`\n✗ REGRESSIONS (${regressions.length}):`)
    for (const { after: a } of regressions)
      console.log(`  ${a.file}:${a.line} ${a.mutatorName}`)
  }

  if (newMutants.length > 0) {
    const newSurvived = newMutants.filter(m => isAlive(m.status))
    const newKilled = newMutants.length - newSurvived.length
    console.log(`\n+ NEW MUTANTS: ${newMutants.length} (${newKilled} killed, ${newSurvived.length} survived)`)
    if (newSurvived.length > 0)
      for (const m of newSurvived)
        console.log(`  ${m.file}:${m.line} ${m.mutatorName} — SURVIVED`)
  }

  if (removedMutants.length > 0)
    console.log(`\n- REMOVED MUTANTS: ${removedMutants.length}`)

  if (fileDeltas.length > 0) {
    fileDeltas.sort((a, b) => (b.delta || 0) - (a.delta || 0))
    console.log(`\nPER-FILE CHANGES:`)
    for (const fd of fileDeltas) {
      if (fd.label === 'NEW') {
        console.log(`  ${fd.file}: NEW (${fd.after.toFixed(1)}%)`)
      } else if (fd.label === 'REMOVED') {
        console.log(`  ${fd.file}: REMOVED (was ${fd.before.toFixed(1)}%)`)
      } else {
        const sign = fd.delta >= 0 ? '+' : ''
        console.log(`  ${fd.file}: ${fd.before.toFixed(1)}% → ${fd.after.toFixed(1)}% (${sign}${fd.delta.toFixed(1)}%)`)
      }
    }
  }

  console.log(`\n${sep}\n`)
}

function isAlive(status) {
  return status === 'Survived' || status === 'NoCoverage'
}

function buildMutantMap(report) {
  const map = {}
  for (const [path, fileData] of Object.entries(report.files)) {
    for (const m of fileData.mutants) {
      const key = m.id || mutantKey(path, m)
      map[key] = { ...m, file: path, line: m.location?.start?.line || 0 }
    }
  }
  return map
}

function fileScores(report) {
  const scores = {}
  for (const [path, { mutants }] of Object.entries(report.files)) {
    const total = mutants.length
    const killed = mutants.filter(isKilled).length
    const score = total > 0 ? (killed / total * 100) : 100
    scores[path] = { killed, total, score }
  }
  return scores
}

function isKilled(mutation) {
  return mutation.status === 'Killed' || mutation.status === 'Timeout'
}
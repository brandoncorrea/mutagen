/**
 * Mutation report utilities.
 * Outputs Stryker mutation-testing-report-schema compatible JSON.
 */

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

export function mutantKey(path, m) {
  const line = m.location?.start?.line || 0
  return `${path}:${line}:${m.mutatorName || ''}:${m.replacement || ''}`
}

export function countStatuses(merged) {
  let killed = 0, survived = 0, noCov = 0, timeout = 0
  for (const fileData of Object.values(merged.files)) {
    for (const m of fileData.mutants) {
      if (m.status === 'Killed') killed++
      else if (m.status === 'Survived') survived++
      else if (m.status === 'NoCoverage') noCov++
      else if (m.status === 'Timeout') timeout++
    }
  }
  return { killed, survived, noCov, timeout }
}

export function printSummary(merged, counts, reportPath) {
  const { killed, survived, noCov, timeout } = counts
  const total = killed + survived + noCov + timeout
  const score = total > 0 ? ((killed + timeout) / total * 100).toFixed(1) : '100.0'
  const sep = '═'.repeat(60)

  console.log(`\n${sep}`)
  console.log(`MUTATION REPORT`)
  console.log(sep)
  console.log(`Files:    ${Object.keys(merged.files).length}`)
  console.log(`Killed:   ${killed}`)
  console.log(`Survived: ${survived}`)
  console.log(`No cov:   ${noCov}`)
  console.log(`Timeout:  ${timeout}`)
  console.log(`Score:    ${score}%`)
  if (reportPath) console.log(`Report:   ${reportPath}`)
  console.log(`${sep}\n`)
}

export function combineReportData(files) {
  const merged = { files: {}, schemaVersion: '1', thresholds: { high: 80, low: 60 } }
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

  if (duplicates > 0) console.log(`  Deduplicated: ${duplicates} duplicate mutant(s) removed`)

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

  const beforeMap = buildMutantMap(before)
  const afterMap = buildMutantMap(after)

  const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()])

  const newlyKilled = []    // was Survived, now Killed
  const regressions = []    // was Killed, now Survived
  const newMutants = []     // not in before
  const removedMutants = [] // not in after
  let unchangedKilled = 0
  let unchangedSurvived = 0

  for (const key of allKeys) {
    const b = beforeMap.get(key)
    const a = afterMap.get(key)

    if (!b && a) {
      newMutants.push(a)
    } else if (b && !a) {
      removedMutants.push(b)
    } else if (b && a) {
      const bAlive = isAlive(b.status)
      const aAlive = isAlive(a.status)
      if (bAlive && !aAlive) newlyKilled.push({ before: b, after: a })
      else if (!bAlive && aAlive) regressions.push({ before: b, after: a })
      else if (aAlive) unchangedSurvived++
      else unchangedKilled++
    }
  }

  // Per-file score comparison
  const beforeScores = fileScores(before)
  const afterScores = fileScores(after)
  const allFiles = new Set([...Object.keys(beforeScores), ...Object.keys(afterScores)])

  const sep = '═'.repeat(60)
  console.log(`\n${sep}`)
  console.log(`MUTATION DIFF`)
  console.log(`${sep}`)
  console.log(`Before: ${beforeFile}`)
  console.log(`After:  ${afterFile}\n`)

  // Overall
  const bCounts = countStatuses(before)
  const aCounts = countStatuses(after)
  const bTotal = bCounts.killed + bCounts.survived + bCounts.noCov + bCounts.timeout
  const aTotal = aCounts.killed + aCounts.survived + aCounts.noCov + aCounts.timeout
  const bScore = bTotal > 0 ? ((bCounts.killed + bCounts.timeout) / bTotal * 100) : 100
  const aScore = aTotal > 0 ? ((aCounts.killed + aCounts.timeout) / aTotal * 100) : 100
  const delta = aScore - bScore

  console.log(`Overall: ${bScore.toFixed(1)}% → ${aScore.toFixed(1)}% (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)`)
  console.log(`Mutations: ${bTotal} → ${aTotal}`)
  console.log(`Killed: ${bCounts.killed} → ${aCounts.killed}  |  Survived: ${bCounts.survived} → ${aCounts.survived}`)

  // Improvements
  if (newlyKilled.length > 0) {
    console.log(`\n✓ NEWLY KILLED (${newlyKilled.length}):`)
    for (const { after: a } of newlyKilled) {
      console.log(`  ${a.file}:${a.line} ${a.mutatorName}`)
    }
  }

  // Regressions
  if (regressions.length > 0) {
    console.log(`\n✗ REGRESSIONS (${regressions.length}):`)
    for (const { after: a } of regressions) {
      console.log(`  ${a.file}:${a.line} ${a.mutatorName}`)
    }
  }

  // New mutants
  if (newMutants.length > 0) {
    const newSurvived = newMutants.filter(m => isAlive(m.status))
    const newKilled = newMutants.length - newSurvived.length
    console.log(`\n+ NEW MUTANTS: ${newMutants.length} (${newKilled} killed, ${newSurvived.length} survived)`)
    if (newSurvived.length > 0) {
      for (const m of newSurvived) {
        console.log(`  ${m.file}:${m.line} ${m.mutatorName} — SURVIVED`)
      }
    }
  }

  // Removed mutants
  if (removedMutants.length > 0) {
    console.log(`\n- REMOVED MUTANTS: ${removedMutants.length}`)
  }

  // Per-file deltas (only show files with score changes)
  const fileDeltas = []
  for (const file of allFiles) {
    const bs = beforeScores[file]
    const as = afterScores[file]
    if (!bs && as) {
      fileDeltas.push({ file, before: null, after: as.score, delta: null, label: 'NEW' })
    } else if (bs && !as) {
      fileDeltas.push({ file, before: bs.score, after: null, delta: null, label: 'REMOVED' })
    } else if (bs && as && Math.abs(as.score - bs.score) > 0.05) {
      const d = as.score - bs.score
      fileDeltas.push({ file, before: bs.score, after: as.score, delta: d, label: null })
    }
  }

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

  return { newlyKilled: newlyKilled.length, regressions: regressions.length, newMutants: newMutants.length, removedMutants: removedMutants.length }
}

function isAlive(status) {
  return status === 'Survived' || status === 'NoCoverage'
}

function buildMutantMap(report) {
  const map = new Map()
  for (const [path, fileData] of Object.entries(report.files)) {
    for (const m of fileData.mutants) {
      const key = m.id || mutantKey(path, m)
      map.set(key, { ...m, file: path, line: m.location?.start?.line || 0 })
    }
  }
  return map
}

function fileScores(report) {
  const scores = {}
  for (const [path, fileData] of Object.entries(report.files)) {
    let killed = 0, total = 0
    for (const m of fileData.mutants) {
      total++
      if (m.status === 'Killed' || m.status === 'Timeout') killed++
    }
    scores[path] = { killed, total, score: total > 0 ? (killed / total * 100) : 100 }
  }
  return scores
}

export function toJsonMutants(sourceFile, results) {
  const relPath = relative(process.cwd(), sourceFile)

  const toMutant = (mut, status) => ({
    id: `mutagen-${relPath}-${mut.line}-${mut.name}`,
    mutatorName: mut.name,
    status,
    location: { start: { line: mut.line, column: 0 }, end: { line: mut.line, column: 0 } },
    description: `${mut.original} → ${mut.mutated}`,
    ...(mut.killedBy?.length > 0 && { killedBy: mut.killedBy })
  })

  return {
    path: relPath,
    mutants: [
      ...results.killed.map(m => toMutant(m, 'Killed')),
      ...results.survived.map(m => toMutant(m, 'Survived'))
    ]
  }
}

export function printRunReport(mutations, results, log) {
  const out = log || console.log
  const sep = '─'.repeat(60)
  const total = mutations.length

  out(`\n${sep}`)
  out(`MUTATION REPORT`)
  out(sep)
  out(`Total: ${total}  |  Killed: ${results.killed.length}  |  Survived: ${results.survived.length}`)

  const score = total > 0
    ? ((results.killed.length / total) * 100).toFixed(1)
    : '100.0'
  out(`Mutation score: ${score}%`)

  if (results.survived.length > 0) {
    out(`\nSURVIVING MUTATIONS:`)
    for (const mut of results.survived) {
      out(`\n  Line ${mut.line}: ${mut.name}`)
      out(`  Original: ${mut.original}`)
      out(`  Mutated:  ${mut.mutated}`)
    }
  } else {
    out(`\nALL mutations killed. Tests are strong.`)
  }

  out(`\n${sep}\n`)
}

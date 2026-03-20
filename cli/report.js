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

export function toJsonMutants(sourceFile, results) {
  const relPath = relative(process.cwd(), sourceFile)

  const toMutant = (mut, status) => ({
    id: `mutagen-${relPath}-${mut.line}-${mut.name}`,
    mutatorName: mut.name,
    status,
    location: { start: { line: mut.line, column: 0 }, end: { line: mut.line, column: 0 } },
    description: `${mut.original} → ${mut.mutated}`
  })

  return {
    path: relPath,
    mutants: [
      ...results.killed.map(m => toMutant(m, 'Killed')),
      ...results.survived.map(m => toMutant(m, 'Survived'))
    ]
  }
}

export function printRunReport(mutations, results) {
  const sep = '─'.repeat(60)
  const total = mutations.length

  console.log(`\n${sep}`)
  console.log(`MUTATION REPORT`)
  console.log(sep)
  console.log(`Total: ${total}  |  Killed: ${results.killed.length}  |  Survived: ${results.survived.length}`)

  const score = total > 0
    ? ((results.killed.length / total) * 100).toFixed(1)
    : '100.0'
  console.log(`Mutation score: ${score}%`)

  if (results.survived.length > 0) {
    console.log(`\nSURVIVING MUTATIONS:`)
    for (const mut of results.survived) {
      console.log(`\n  Line ${mut.line}: ${mut.name}`)
      console.log(`  Original: ${mut.original}`)
      console.log(`  Mutated:  ${mut.mutated}`)
    }
  } else {
    console.log(`\nALL mutations killed. Tests are strong.`)
  }

  console.log(`\n${sep}\n`)
}

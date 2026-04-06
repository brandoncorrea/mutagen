/**
 * Per-run mutation report utilities.
 * Outputs Stryker mutation-testing-report-schema compatible JSON.
 */

import { relative } from 'node:path'

export const SEPARATOR = '═'.repeat(60)

export function mutantKey(path, m) {
  const line = m.location?.start?.line || 0
  return `${path}:${line}:${m.mutatorName || ''}:${m.replacement || ''}`
}

export function countStatuses(merged) {
  let killed = 0, survived = 0, noCoverage = 0, timeout = 0
  for (const fileData of Object.values(merged.files)) {
    for (const { status } of fileData.mutants) {
      if (status === 'Killed') killed++
      else if (status === 'Survived') survived++
      else if (status === 'NoCoverage') noCoverage++
      else if (status === 'Timeout') timeout++
    }
  }
  return { killed, survived, noCoverage, timeout }
}

export function printSummary(merged, counts, reportPath) {
  const { killed, survived, noCoverage, timeout } = counts
  const total = killed + survived + noCoverage + timeout
  const score = total > 0 ? ((killed + timeout) / total * 100).toFixed(1) : '100.0'
  const sep = SEPARATOR

  console.log(`\n${sep}`)
  console.log(`MUTATION REPORT`)
  console.log(sep)
  console.log(`Files:    ${Object.keys(merged.files).length}`)
  console.log(`Killed:   ${killed}`)
  console.log(`Survived: ${survived}`)
  console.log(`No cov:   ${noCoverage}`)
  console.log(`Timeout:  ${timeout}`)
  console.log(`Score:    ${score}%`)
  if (reportPath) console.log(`Report:   ${reportPath}`)
  console.log(`${sep}\n`)
}

export function toJsonMutants(sourceFile, results) {
  const relPath = relative(process.cwd(), sourceFile)

  const toMutant = (mut, status) => ({
    id: `mutagen-${relPath}-${mut.line}-${mut.name}`,
    mutatorName: mut.name,
    status,
    location: {
      start: { line: mut.line, column: 0 },
      end: { line: mut.line, column: 0 }
    },
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

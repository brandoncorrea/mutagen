/**
 * Per-run mutation report utilities.
 * Outputs Stryker mutation-testing-report-schema compatible JSON.
 */

import { relative } from 'node:path'

export const SEPARATOR = '═'.repeat(60)

export function mutantKey(path, { location, mutatorName, replacement }) {
  const line = location?.start?.line || 0
  return `${path}:${line}:${mutatorName || ''}:${replacement || ''}`
}

export function isKilled(mutation) {
  return mutation.status === 'Killed' || mutation.status === 'Timeout'
}

export function isAlive(mutation) {
  return mutation.status === 'Survived' || mutation.status === 'NoCoverage'
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
  const score = total ? ((killed + timeout) / total * 100).toFixed(1) : '100.0'

  console.log(`\n${SEPARATOR}`)
  console.log(`MUTATION REPORT`)
  console.log(SEPARATOR)
  console.log(`Files:    ${Object.keys(merged.files).length}`)
  console.log(`Killed:   ${killed}`)
  console.log(`Survived: ${survived}`)
  console.log(`No cov:   ${noCoverage}`)
  console.log(`Timeout:  ${timeout}`)
  console.log(`Score:    ${score}%`)
  if (reportPath) console.log(`Report:   ${reportPath}`)
  console.log(`${SEPARATOR}\n`)
}

export function toJsonMutants(sourceFile, results) {
  const relPath = relative(process.cwd(), sourceFile)

  return {
    path: relPath,
    mutants: [
      ...results.killed.map(m => toMutant(relPath, m, 'Killed')),
      ...results.survived.map(m => toMutant(relPath, m, 'Survived'))
    ]
  }
}

function toMutant(relPath, mutation, status) {
  const { line, name, original, mutated, killedBy } = mutation
  return {
    id: `mutagen-${relPath}-${line}-${name}`,
    mutatorName: name,
    status,
    location: {
      start: { line, column: 0 },
      end: { line, column: 0 }
    },
    description: `${original} → ${mutated}`,
    ...(killedBy?.length && { killedBy })
  }
}

const HR = '─'.repeat(60)

export function printRunReport(mutations, results, log) {
  const out = log || console.log
  const { killed, survived } = results

  writeSummary(out, mutations, killed, survived)
  writeScore(out, mutations, killed)
  if (survived.length)
    writeSurvivors(out, survived)
  else
    out(`\nALL mutations killed. Tests are strong.`)

  out(`\n${HR}\n`)
}

function writeSummary(out, mutations, killed, survived) {
  out(`\n${HR}`)
  out(`MUTATION REPORT`)
  out(HR)
  out(`Total: ${mutations.length}  |  Killed: ${killed.length}  |  Survived: ${survived.length}`)
}

function writeScore(out, mutations, killed) {
  const score = mutations.length
    ? (killed.length / mutations.length) * 100
    : 100
  out(`Mutation score: ${score.toFixed(1)}%`)
}

function writeSurvivors(out, mutations) {
  out(`\nSURVIVING MUTATIONS:`)
  for (const mut of mutations)
    writeMutation(out, mut)
}

function writeMutation(out, mut) {
  out(`\n  Line ${mut.line}: ${mut.name}`)
  out(`  Original: ${mut.original}`)
  out(`  Mutated:  ${mut.mutated}`)
}

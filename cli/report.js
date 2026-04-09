/**
 * Per-run mutation report presentation.
 * Data utilities live in core/report-data.js.
 */

import { SEPARATOR } from '../core/report-data.js'

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

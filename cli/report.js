/**
 * Per-run mutation report presentation.
 * Data utilities live in core/report-data.js.
 */

import { SEPARATOR, mutationScore } from '../core/report-data.js'

export function printSummary(merged, counts, reportPath, out = console.log) {
  const { killed, survived, noCoverage, timeout } = counts
  const score = mutationScore(counts).toFixed(1)

  out(`\n${SEPARATOR}`)
  out(`MUTATION REPORT`)
  out(SEPARATOR)
  out(`Files:    ${Object.keys(merged.files).length}`)
  out(`Killed:   ${killed}`)
  out(`Survived: ${survived}`)
  out(`No cov:   ${noCoverage}`)
  out(`Timeout:  ${timeout}`)
  out(`Score:    ${score}%`)
  if (reportPath) out(`Report:   ${reportPath}`)
  out(`${SEPARATOR}\n`)
}

const HR = '─'.repeat(60)

export function printRunReport(mutations, results, out = console.log) {
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

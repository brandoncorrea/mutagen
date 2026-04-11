/**
 * Per-run mutation report presentation.
 * Data utilities live in core/report-data.js.
 */

import { HEADER_SEPARATOR, SECTION_SEPARATOR, mutationScore } from '../core/report-data.js'

export function printSummary(merged, counts, reportPath, out = console.log) {
  const { killed, survived, noCoverage, timeout } = counts
  const score = mutationScore(counts).toFixed(1)

  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTATION REPORT`)
  out(HEADER_SEPARATOR)
  out(`Files:    ${Object.keys(merged.files).length}`)
  out(`Killed:   ${killed}`)
  out(`Survived: ${survived}`)
  out(`No cov:   ${noCoverage}`)
  out(`Timeout:  ${timeout}`)
  out(`Score:    ${score}%`)
  if (reportPath) out(`Report:   ${reportPath}`)
  out(`${HEADER_SEPARATOR}\n`)
}

export function printRunReport(mutations, results, out = console.log) {
  const { killed, survived } = results

  writeSummary(out, mutations, killed, survived)
  writeScore(out, mutations, killed)
  if (survived.length)
    writeSurvivors(out, survived)
  else
    out(`\nALL mutations killed. Tests are strong.`)

  out(`\n${SECTION_SEPARATOR}\n`)
}

function writeSummary(out, mutations, killed, survived) {
  out(`\n${SECTION_SEPARATOR}`)
  out(`MUTATION REPORT`)
  out(SECTION_SEPARATOR)
  out(`Total: ${mutations.length}  |  Killed: ${killed.length}  |  Survived: ${survived.length}`)
}

function writeScore(out, mutations, killed) {
  const counts = {
    killed: killed.length,
    survived: mutations.length - killed.length,
    noCoverage: 0,
    timeout: 0
  }
  out(`Mutation score: ${mutationScore(counts).toFixed(1)}%`)
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

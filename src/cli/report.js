/**
 * Per-run mutation report presentation.
 * Data utilities live in core/report-data.js.
 */

import { mutationScore, totalMutants } from '../core/mutation-status.js'
import { HEADER_SEPARATOR, SECTION_SEPARATOR } from '../core/report-data.js'

export function printRunReport(mutations, results, out) {
  const { killed, survived, timedOut = [] } = results
  const allKilled = [...killed, ...timedOut]

  writeSummary(out, mutations, allKilled, survived)
  writeScore(out, mutations, allKilled)
  if (survived.length)
    writeSurvivors(out, survived)
  else
    out.log(`\nALL mutations killed. Tests are strong.`)

  out.log(`\n${SECTION_SEPARATOR}\n`)
}

function writeSummary(out, mutations, killed, survived) {
  out.log(`\n${SECTION_SEPARATOR}`)
  out.log(`MUTATION REPORT`)
  out.log(SECTION_SEPARATOR)
  out.log(
    `Total: ${mutations.length}` +
    `  |  Killed: ${killed.length}` +
    `  |  Survived: ${survived.length}`
  )
}

function writeScore(out, mutations, killed) {
  const counts = {
    killed: killed.length,
    survived: mutations.length - killed.length,
    noCoverage: 0,
    timeout: 0
  }
  out.log(`Mutation score: ${mutationScore(counts).toFixed(1)}%`)
}

function writeSurvivors(out, mutations) {
  out.log(`\nSURVIVING MUTATIONS:`)
  for (const mutation of mutations)
    writeMutation(out, mutation)
}

export function formatQuietSummary({
  killed, survived, timedOut, fileCount
}) {
  const effectiveKilled = killed + timedOut
  const counts = {
    killed: effectiveKilled, survived, noCoverage: 0, timeout: 0
  }
  const total = totalMutants(counts)
  const score = mutationScore(counts).toFixed(1)
  return `Score: ${score}% (${effectiveKilled}/${total})` +
    ` | ${survived} survivors | ${fileCount} files`
}

export function printScoreLine(
  out, { score, killed, total, survived },
  fileCount, outputPath
) {
  out.error(
    `Score: ${score}% (${killed}/${total})` +
    ` | ${survived} survivors` +
    ` | ${fileCount} files → ${outputPath}\n`
  )
}

export function printAutoDiffLine(out, summary) {
  if (summary) out.error(`  Δ ${summary}\n`)
}

function writeMutation(out, { id, line, name, original, mutated, coveredBy }) {
  const prefix = id ? `[${id}] ` : ''
  out.log(`\n  ${prefix}Line ${line}: ${name}`)
  out.log(`  Original: ${original}`)
  out.log(`  Mutated:  ${mutated}`)
  if (coveredBy?.length)
    out.log(`  Test:     ${coveredBy.join(', ')}`)
}

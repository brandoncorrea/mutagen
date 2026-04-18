/**
 * Dry-run mode: list mutations without executing them.
 */

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { generateMutations } from '../../core/generate.js'
import { assignMutationIds } from '../../core/mutation-id.js'

export function dryRun(sourceFile, mutationConfig, targetLine, out = console.log) {
  const source = readFileSync(sourceFile, 'utf-8')
  const mutations = generateMutations(source, mutationConfig, targetLine)
  const relPath = relative(process.cwd(), sourceFile)
  assignMutationIds(mutations, relPath)

  out(`\nDRY RUN — ${relPath}`)
  out(`   Found ${mutations.length} mutation(s)\n`)

  const byLine = mutationsByLine(mutations)
  const mutationLines = Object.entries(byLine)
  for (const [line, entries] of mutationLines)
    out(`  L${line}: ${entries.map(formatEntry).join(', ')}`)

  out(`\n  Total: ${mutations.length} mutations`)
  return mutations.length
}

function formatEntry(entry) {
  return `${entry.name} [${entry.id}]`
}

function mutationsByLine(mutations) {
  const byLine = {}
  for (const { name, line, id } of mutations) {
    const entries = byLine[line] || []
    entries.push({ name, id })
    byLine[line] = entries
  }
  return byLine
}

/**
 * Dry-run mode: list mutations without executing them.
 */

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { generateMutations } from '../../core/generate.js'
import { assignMutationIds } from '../../core/mutation-id.js'

export function dryRun(sourceFile, mutationConfig, targetLine, out) {
  const mutations = loadMutationsFromSource(sourceFile, mutationConfig, targetLine)
  const relPath = relative(process.cwd(), sourceFile)
  assignMutationIds(mutations, relPath)

  out.log(`\nDRY RUN — ${relPath}`)
  out.log(`   Found ${mutations.length} mutation(s)\n`)

  const byLine = mutationsByLine(mutations)
  for (const [line, entries] of Object.entries(byLine))
    out.log(`  L${line}: ${entries.map(formatEntry).join(', ')}`)

  out.log(`\n  Total: ${mutations.length} mutations`)
  return mutations.length
}

function loadMutationsFromSource(sourceFile, mutationConfig, targetLine) {
  const source = readFileSync(sourceFile, 'utf-8')
  return generateMutations(source, mutationConfig, targetLine)
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

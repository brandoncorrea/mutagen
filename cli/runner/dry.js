/**
 * Dry-run mode: list mutations without executing them.
 */

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { generateMutations } from '../../core/generate.js'

export function dryRun(sourceFile, mutationConfig, targetLine, out = console.log) {
  const source = readFileSync(sourceFile, 'utf-8')
  const mutations = generateMutations(source, mutationConfig, targetLine)
  const relPath = relative(process.cwd(), sourceFile)

  out(`\nDRY RUN — ${relPath}`)
  out(`   Found ${mutations.length} mutation(s)\n`)

  const byLine = mutationsByLine(mutations)
  const mutationLines = Object.entries(byLine)
  for (const [line, names] of mutationLines)
    out(`  L${line}: ${names.join(', ')}`)

  out(`\n  Total: ${mutations.length} mutations`)
  return mutations.length
}

function mutationsByLine(mutations) {
  const byLine = {}
  for (const { name, line } of mutations) {
    const names = byLine[line] || []
    names.push(name)
    byLine[line] = names
  }
  return byLine
}

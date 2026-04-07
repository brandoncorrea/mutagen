/**
 * Single-file mutation execution.
 * Runs all mutations against one source file and reports results.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'

import { generateMutations } from '../core/engine.js'
import { toJsonMutants, printRunReport, SEPARATOR } from './report.js'

export function dryRun(sourceFile, prepared, targetLine) {
  const source = readFileSync(sourceFile, 'utf-8')
  const mutations = generateMutations(source, prepared, targetLine)
  const relPath = relative(process.cwd(), sourceFile)

  console.log(`\nDRY RUN — ${relPath}`)
  console.log(`   Found ${mutations.length} mutation(s)\n`)

  const byLine = {}
  for (const { name, line } of mutations) {
    const names = byLine[line] || []
    names.push(name)
    byLine[line] = names
  }

  const mutationLines = Object.entries(byLine).sort((a, b) => Number(a[0]) - Number(b[0]))
  for (const [line, names] of mutationLines)
    console.log(`  L${line}: ${names.join(', ')}`)

  console.log(`\n  Total: ${mutations.length} mutations`)
  return mutations.length
}

export function withTimeout(fn, ms) {
  if (!ms) return fn()
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Mutation timed out after ${ms}ms`)), ms))
  ])
}

export async function runSingle(sourceFile, prepared, createRunner, targetLine, timeout, log) {
  const out = log || console.log
  const original = readFileSync(sourceFile, 'utf-8')
  const sep = SEPARATOR

  out(`\n${sep}`)
  out(`MUTAGEN`)
  out(sep)
  out(`Source: ${sourceFile}`)
  if (targetLine) out(`Target: line ${targetLine}`)
  if (timeout) out(`Timeout: ${timeout}ms per mutation`)

  const runner = await createRunner(sourceFile)

  try {
    out(`\nPre-flight: running tests against original source...`)
    const preflight = await runner.run()
    if (!preflight.passed) {
      out(`\nABORT: Tests already FAILING on original source. Fix the suite first.`)
      return { error: true }
    }
    out(`Tests pass on original source. Beginning mutations.\n`)

    const mutations = generateMutations(original, prepared, targetLine)
    out(`Found ${mutations.length} mutation(s) to run.\n`)

    const outcomes = { killed: [], survived: [], timedOut: [] }

    for (let i = 0; i < mutations.length; i++) {
      const mut = mutations[i]

      try {
        writeFileSync(sourceFile, mut.source)
        const result = await withTimeout(() => runner.run(), timeout)

        if (result.passed) {
          outcomes.survived.push(mut)
          out(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... SURVIVED`)
        } else {
          mut.killedBy = result.killedBy || []
          outcomes.killed.push(mut)
          out(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... killed`)
        }
      } catch (err) {
        if (err.message?.includes('timed out')) {
          outcomes.timedOut.push(mut)
          out(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... TIMEOUT (killed)`)
        } else {
          outcomes.killed.push(mut)
          out(`[${i + 1}/${mutations.length}] Line ${mut.line}: ${mut.name} ... killed (error)`)
        }
      } finally {
        writeFileSync(sourceFile, original)
      }
    }

    printRunReport(mutations, outcomes, out)

    return {
      survived: outcomes.survived.length,
      killed: outcomes.killed.length + outcomes.timedOut.length,
      timedOut: outcomes.timedOut.length,
      jsonData: toJsonMutants(sourceFile, outcomes)
    }
  } finally {
    await runner.close()
  }
}

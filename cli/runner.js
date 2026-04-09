/**
 * Single-file mutation execution.
 * Runs all mutations against one source file and reports results.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'

import { generateMutations } from '../core/engine.js'
import { toJsonMutants, SEPARATOR } from '../core/report-data.js'
import { printRunReport } from './report.js'

export function dryRun(sourceFile, prepared, targetLine, out = console.log) {
  const source = readFileSync(sourceFile, 'utf-8')
  const mutations = generateMutations(source, prepared, targetLine)
  const relPath = relative(process.cwd(), sourceFile)

  out(`\nDRY RUN — ${relPath}`)
  out(`   Found ${mutations.length} mutation(s)\n`)

  const byLine = mutationsByLine(mutations)
  const mutationLines = Object.entries(byLine).sort((a, b) => Number(a[0]) - Number(b[0]))
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

export function withTimeout(fn, ms) {
  if (!ms) return fn()
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Mutation timed out after ${ms}ms`)), ms))
  ])
}

export async function runSingle(options) {
  const { sourceFile, prepared, createRunner, targetLine, timeout, log } = options
  const out = log || console.log
  const original = readFileSync(sourceFile, 'utf-8')

  out(`\n${SEPARATOR}`)
  out(`MUTAGEN`)
  out(SEPARATOR)
  out(`Source: ${sourceFile}`)
  if (targetLine) out(`Target: line ${targetLine}`)
  if (timeout) out(`Timeout: ${timeout}ms per mutation`)

  const runner = await createRunner(sourceFile)
  const opts = { out, runner, timeout, sourceFile, targetLine, original, prepared }

  try {
    return await runMutations(opts)
  } finally {
    await runner.close()
  }
}

async function runMutations(opts) {
  const { out, runner, sourceFile, targetLine, original, prepared } = opts
  const preflight = await runPreflightTests(out, runner)
  if (preflight.error) return preflight
  out(`Tests pass on original source. Beginning mutations.\n`)

  const mutations = generateMutations(original, prepared, targetLine)
  const total = mutations.length
  out(`Found ${mutations.length} mutation(s) to run.\n`)

  const outcomes = { killed: [], survived: [], timedOut: [] }

  for (let i = 0; i < mutations.length; i++)
    await runMutation(opts, total, outcomes, {
      number: i + 1,
      ...mutations[i]
    })

  printRunReport(mutations, outcomes, out)

  return {
    survived: outcomes.survived.length,
    killed: outcomes.killed.length + outcomes.timedOut.length,
    timedOut: outcomes.timedOut.length,
    jsonData: toJsonMutants(sourceFile, outcomes)
  }
}

async function runMutation(opts, total, outcomes, mutation) {
  const { out, runner, timeout, sourceFile, original } = opts
  try {
    writeFileSync(sourceFile, mutation.source)
    const result = await withTimeout(() => runner.run(), timeout)

    if (result.passed) {
      outcomes.survived.push(mutation)
      reportMutation(out, total, mutation, 'SURVIVED')
    } else {
      mutation.killedBy = result.killedBy || []
      outcomes.killed.push(mutation)
      reportMutation(out, total, mutation, 'killed')
    }
  } catch (err) {
    if (err.message?.includes('timed out')) {
      outcomes.timedOut.push(mutation)
      reportMutation(out, total, mutation, 'TIMEOUT (killed)')
    } else {
      outcomes.killed.push(mutation)
      reportMutation(out, total, mutation, 'killed (error)')
    }
  } finally {
    writeFileSync(sourceFile, original)
  }
}

async function runPreflightTests(out, runner) {
  out(`\nPre-flight: running tests against original source...`)
  const preflight = await runner.run()
  if (preflight.passed) return {}
  out(`\nABORT: Tests already FAILING on original source. Fix the suite first.`)
  return { error: true }
}

function reportMutation(out, total, { number, line, name }, status) {
  out(`[${number}/${total}] Line ${line}: ${name} ... ${status}`)
}

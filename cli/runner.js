/**
 * Single-file mutation execution.
 * Runs all mutations against one source file and reports results.
 *
 * Runner interface:
 *   { run, close }                       — file-I/O mode (writes mutated source to disk)
 *   { run, close, setMutant, clearMutant } — in-memory mode (no file I/O per mutation)
 *
 * The runner is duck-typed: if setMutant exists, in-memory mode is used.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'

import { generateMutations } from '../core/engine.js'
import { createPool } from '../core/pool.js'
import { withTimeout } from '../core/timeout.js'
import { toJsonMutants, HEADER_SEPARATOR } from '../core/report-data.js'
import { printRunReport } from './report.js'

export function dryRun(sourceFile, prepared, targetLine, out = console.log) {
  const source = readFileSync(sourceFile, 'utf-8')
  const mutations = generateMutations(source, prepared, targetLine)
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

export async function runSingle(options) {
  const { sourceFile, prepared, createRunner, targetLine, timeout, out = console.log } = options
  const original = readFileSync(sourceFile, 'utf-8')

  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTAGEN`)
  out(HEADER_SEPARATOR)
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
  out(`Found ${mutations.length} mutation(s) to run.\n`)

  const outcomes = { killed: [], survived: [], timedOut: [] }

  for (let i = 0; i < mutations.length; i++)
    await runMutation(opts, mutations.length, outcomes, {
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
  const inMemory = typeof runner.setMutant === 'function'
  try {
    if (inMemory) runner.setMutant(mutation.source)
    else writeFileSync(sourceFile, mutation.source)

    const result = await withTimeout(runner.run, timeout)

    if (result.passed) {
      outcomes.survived.push(mutation)
      reportMutation(out, total, mutation, 'SURVIVED')
    } else {
      outcomes.killed.push({ ...mutation, killedBy: result.killedBy })
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
    if (inMemory) runner.clearMutant()
    else writeFileSync(sourceFile, original)
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

const DEFAULT_WORKER_COUNT = 2

export async function runParallel(options) {
  const {
    sourceFile, prepared, createRunner, targetLine,
    timeout, workerCount = DEFAULT_WORKER_COUNT, out = console.log
  } = options
  const original = readFileSync(sourceFile, 'utf-8')

  out(`\n${HEADER_SEPARATOR}`)
  out(`MUTAGEN (parallel — ${workerCount} workers)`)
  out(HEADER_SEPARATOR)
  out(`Source: ${sourceFile}`)
  if (targetLine) out(`Target: line ${targetLine}`)
  if (timeout) out(`Timeout: ${timeout}ms per mutation`)

  const preflightRunner = await createRunner(sourceFile)

  try {
    const preflight = await runPreflightTests(out, preflightRunner)
    if (preflight.error) return preflight
    out(`Tests pass on original source. Beginning mutations.\n`)

    const mutations = generateMutations(original, prepared, targetLine)
    out(`Found ${mutations.length} mutation(s) to run.\n`)

    const pool = createPool({ workerCount, createRunner })

    try {
      let completed = 0
      const total = mutations.length

      const onResult = ({ mutation, status }) => {
        completed++
        reportMutation(out, total, { number: completed, ...mutation }, formatStatus(status))
      }

      const outcomes = await pool.run(mutations, { timeout, onResult })

      printRunReport(mutations, outcomes, out)

      return {
        survived: outcomes.survived.length,
        killed: outcomes.killed.length + outcomes.timedOut.length,
        timedOut: outcomes.timedOut.length,
        jsonData: toJsonMutants(sourceFile, outcomes)
      }
    } finally {
      await pool.close()
    }
  } finally {
    await preflightRunner.close()
  }
}

function formatStatus(status) {
  if (status === 'survived') return 'SURVIVED'
  if (status === 'timedOut') return 'TIMEOUT (killed)'
  return 'killed'
}

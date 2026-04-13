#!/usr/bin/env node
/**
 * Self-referencing mutation runner.
 * Uses mutagen's own engine + patterns to mutate mutagen's source code,
 * then runs vitest in cold mode (subprocess) to avoid corrupting the
 * running process.
 *
 * Usage:
 *   node scripts/self-mutate.js                    # All target modules
 *   node scripts/self-mutate.js core/engine.js     # Single module
 *   node scripts/self-mutate.js --dry-run           # Preview mutations only
 *   node scripts/self-mutate.js --json              # JSON output
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { generateMutations, preparePatterns } from '../index.js'
import { javascript } from '../core/patterns.js'

const ROOT = resolve(import.meta.dirname, '..')
const TIMEOUT_MS = 30_000

// Modules safe to self-mutate (no runner infrastructure)
const TARGET_MODULES = [
  'core/engine.js',
  'core/token-context.js',
  'core/report-data.js',
  'cli/args.js',
  'cli/diff.js',
  'cli/diff-print.js',
  'cli/incremental.js',
  'cli/incremental-report.js',
  'cli/runner.js',
  'cli/report.js',
  'cli/manual.js',
  'stryker.js'
]

// Excluded: runners/vitest.js — mutating the test runner itself corrupts execution

function parseArgs(argv) {
  const args = argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const json = args.includes('--json')
  const files = args.filter(a => !a.startsWith('--'))
  const targets = files.length > 0
    ? files.filter(f => TARGET_MODULES.includes(f))
    : TARGET_MODULES
  return { dryRun, json, targets }
}

function runTests() {
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=dot'], {
      cwd: ROOT,
      timeout: TIMEOUT_MS,
      stdio: 'pipe'
    })
    return { passed: true }
  } catch (err) {
    if (err.killed) return { passed: false, timedOut: true }
    return { passed: false, timedOut: false }
  }
}

function runMutation(sourceFile, mutation) {
  const absPath = resolve(ROOT, sourceFile)
  const original = readFileSync(absPath, 'utf8')
  try {
    writeFileSync(absPath, mutation.source)
    return runTests()
  } finally {
    writeFileSync(absPath, original)
  }
}

function isCommentOnlyLine(original) {
  const t = original.trim()
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') || t === '*/'
}

function loadMutations(sourceFile) {
  const absPath = resolve(ROOT, sourceFile)
  const source = readFileSync(absPath, 'utf8')
  const prepared = preparePatterns(javascript)
  return generateMutations(source, prepared)
    .filter(m => !isCommentOnlyLine(m.original))
}

function toResult(sourceFile, mutation, status) {
  return {
    file: sourceFile,
    line: mutation.line,
    name: mutation.name,
    original: mutation.original,
    mutated: mutation.mutated,
    status
  }
}

function previewMutations(sourceFile) {
  return loadMutations(sourceFile)
    .map(m => toResult(sourceFile, m, 'dry-run'))
}

function executeMutations(sourceFile) {
  const mutations = loadMutations(sourceFile)
  const results = []
  for (const mutation of mutations) {
    const result = runMutation(sourceFile, mutation)
    const status = result.passed ? 'Survived' : result.timedOut ? 'Timeout' : 'Killed'
    results.push(toResult(sourceFile, mutation, status))

    const icon = status === 'Killed' ? '.' : status === 'Timeout' ? 'T' : '!'
    process.stderr.write(icon)
  }
  process.stderr.write('\n')
  return results
}

function printSummary(allResults) {
  const survived = allResults.filter(r => r.status === 'Survived')
  const killed = allResults.filter(r => r.status === 'Killed')
  const timedOut = allResults.filter(r => r.status === 'Timeout')
  const total = allResults.length
  const score = total > 0 ? ((killed.length + timedOut.length) / total * 100).toFixed(1) : 0

  console.log('\n=== SELF-MUTATION REPORT ===\n')
  console.log(`Total mutations: ${total}`)
  console.log(`Killed: ${killed.length}`)
  console.log(`Survived: ${survived.length}`)
  console.log(`Timed out: ${timedOut.length}`)
  console.log(`Score: ${score}%`)

  if (survived.length > 0)
    printSurvivors(survived)
}

function printSurvivors(survived) {
  console.log('\n--- SURVIVORS ---\n')
  for (const r of survived) {
    console.log(`${r.file}:${r.line} — ${r.name}`)
    console.log(`  original: ${r.original}`)
    console.log(`  mutated:  ${r.mutated}`)
    console.log()
  }
}

function printPerFileScores(allResults) {
  const byFile = new Map()
  for (const r of allResults) {
    if (!byFile.has(r.file)) byFile.set(r.file, { killed: 0, survived: 0, timedOut: 0, total: 0 })
    const counts = byFile.get(r.file)
    counts.total++
    if (r.status === 'Killed') counts.killed++
    else if (r.status === 'Survived') counts.survived++
    else counts.timedOut++
  }

  console.log('--- PER-FILE SCORES ---\n')
  for (const [file, counts] of byFile) {
    const score = counts.total > 0 ? ((counts.killed + counts.timedOut) / counts.total * 100).toFixed(1) : '0.0'
    const flag = counts.survived > 0 ? ` ← ${counts.survived} SURVIVED` : ''
    console.log(`  ${file}: ${score}% (${counts.killed}/${counts.total})${flag}`)
  }
}

function printTextReport(allResults) {
  printSummary(allResults)
  printPerFileScores(allResults)
}

function main() {
  const { dryRun, json, targets } = parseArgs(process.argv)

  if (targets.length === 0) {
    console.error('No valid target modules specified.')
    console.error('Valid targets:', TARGET_MODULES.join(', '))
    process.exit(1)
  }

  if (!dryRun) {
    process.stderr.write('Preflight check... ')
    const preflight = runTests()
    if (!preflight.passed) {
      console.error('FAILED — test suite is not green. Fix tests before mutating.')
      process.exit(1)
    }
    process.stderr.write('OK\n\n')
  }

  const mutateFile = dryRun ? previewMutations : executeMutations
  const allResults = []
  for (const target of targets) {
    process.stderr.write(`Mutating: ${target} `)
    allResults.push(...mutateFile(target))
  }

  if (json)
    console.log(JSON.stringify(allResults, null, 2))
  else
    printTextReport(allResults)

  if (!dryRun) {
    process.stderr.write('\nSafety check: verifying clean source... ')
    const safety = runTests()
    if (!safety.passed) {
      console.error('CRITICAL: Tests failing after mutation run! Source may be corrupted.')
      process.exit(2)
    }
    process.stderr.write('OK\n')
  }
}

main()

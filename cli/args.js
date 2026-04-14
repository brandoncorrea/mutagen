/**
 * CLI argument parsing for the manual mutation runner.
 */

import { resolve } from 'node:path'

const usageMessage = `\
Usage: <script> <source-file> [--line N] [--json] [--dry-run] [--timeout N] [--parallel [N]]
       <script> --all [--json] [--dry-run] [--timeout N] [--parallel [N]]
       <script> --incremental [--json] [--timeout N] [--parallel [N]]`

const diffMessage = 'Usage: <script> --diff <before.json> <after.json>'

export function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--incremental'))
    return incrementalOptions(argv)
  if (argv.includes('--all'))
    return allOptions(argv)
  if (argv.includes('--diff'))
    return diffOptions(argv)
  return sourceFileOptions(argv)
}

function incrementalOptions(argv) {
  const timeout = parseTimeout(argv)
  if (timeout?.error) return timeout
  const parallel = parseParallel(argv)
  if (parallel?.error) return parallel
  return {
    incrementalMode: true,
    timeout,
    parallel,
    jsonOutput: hasFlag(argv, '--json')
  }
}

function allOptions(argv) {
  const timeout = parseTimeout(argv)
  if (timeout?.error) return timeout
  const parallel = parseParallel(argv)
  if (parallel?.error) return parallel
  return {
    allMode: true,
    timeout,
    parallel,
    jsonOutput: hasFlag(argv, '--json'),
    dryRunMode: hasFlag(argv, '--dry-run')
  }
}

function diffOptions(argv) {
  const diffIdx = argv.indexOf('--diff')
  if (argv.length < diffIdx + 3)
    return { error: diffMessage }
  return {
    diffMode: true,
    beforeFile: resolve(argv[diffIdx + 1]),
    afterFile: resolve(argv[diffIdx + 2])
  }
}

function sourceFileOptions(argv) {
  const opts = argsToOptions(argv)
  if (opts.error) return opts
  const { targetLine, timeout, parallel, filtered } = opts

  if (!filtered.length)
    return { error: usageMessage }

  return {
    sourceFile: resolve(filtered[0]),
    targetLine,
    jsonOutput: hasFlag(argv, '--json'),
    dryRunMode: hasFlag(argv, '--dry-run'),
    timeout,
    parallel
  }
}

function argsToOptions(args) {
  const filtered = []
  let targetLine, timeout, parallel
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--line') {
      targetLine = Number(args[++i])
      if (isInvalidNumber(targetLine))
        return { error: '--line requires a numeric value' }
    } else if (arg === '--timeout') {
      timeout = Number(args[++i])
      if (isInvalidNumber(timeout))
        return { error: '--timeout requires a numeric value' }
    } else if (arg === '--parallel') {
      parallel = parseParallelValue(args, i)
      if (parallel?.error) return parallel
      if (typeof parallel === 'number') i++
    } else if (isPositionalArg(arg)) {
      filtered.push(arg)
    }
  }
  return { targetLine, timeout, parallel, filtered }
}

function parseParallel(args) {
  const idx = args.indexOf('--parallel')
  if (idx < 0) return
  return parseParallelValue(args, idx)
}

function parseParallelValue(args, idx) {
  const next = args[idx + 1]
  if (next === undefined || next.startsWith('--'))
    return true
  const value = Number(next)
  if (isInvalidNumber(value))
    return { error: '--parallel requires a numeric value' }
  return value
}

function parseTimeout(args) {
  const idx = args.indexOf('--timeout')
  if (idx < 0) return
  const value = Number(args[idx + 1])
  if (isInvalidNumber(value))
    return { error: '--timeout requires a numeric value' }
  return value
}

function hasFlag(argv, flag) {
  return argv.includes(flag)
}

function isInvalidNumber(value) {
  return Number.isNaN(value) || value < 0
}

const FLAG_OPTIONS = new Set(['--json', '--dry-run', '--parallel'])
function isPositionalArg(arg) {
  return !FLAG_OPTIONS.has(arg)
}


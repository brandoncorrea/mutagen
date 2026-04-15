/**
 * CLI argument parsing for the manual mutation runner.
 */

import { resolve } from 'node:path'

const usageMessage = `\
Usage: <script> <source-file> [--line N] [--json [path]] [--dry-run] [--timeout N] [--parallel [N]] [--quiet] [--survivors-only]
       <script> --all [--json [path]] [--dry-run] [--timeout N] [--parallel [N]] [--quiet] [--survivors-only]
       <script> --incremental [--json [path]] [--timeout N] [--parallel [N]] [--quiet] [--survivors-only]`

const diffMessage = 'Usage: <script> --diff <before.json> <after.json> [--json]'

export function parseArgs(argv = process.argv.slice(2)) {
  return argv.includes('--incremental') ? incrementalOptions(argv)
    : argv.includes('--all') ? allOptions(argv)
    : argv.includes('--diff') ? diffOptions(argv)
    : sourceFileOptions(argv)
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
    jsonOutput: parseJsonOutput(argv),
    quiet: hasFlag(argv, '--quiet'),
    survivorsOnly: hasFlag(argv, '--survivors-only')
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
    jsonOutput: parseJsonOutput(argv),
    dryRunMode: hasFlag(argv, '--dry-run'),
    quiet: hasFlag(argv, '--quiet'),
    survivorsOnly: hasFlag(argv, '--survivors-only')
  }
}

function diffOptions(argv) {
  const diffIdx = argv.indexOf('--diff')
  if (argv.length < diffIdx + 3)
    return { error: diffMessage }
  return {
    diffMode: true,
    beforeFile: resolve(argv[diffIdx + 1]),
    afterFile: resolve(argv[diffIdx + 2]),
    jsonOutput: parseJsonOutput(argv)
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
    jsonOutput: parseJsonOutput(argv),
    dryRunMode: hasFlag(argv, '--dry-run'),
    quiet: hasFlag(argv, '--quiet'),
    survivorsOnly: hasFlag(argv, '--survivors-only'),
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
    } else if (arg === '--json') {
      const next = args[i + 1]
      if (next && !next.startsWith('--')) i++
    } else if (isPositionalArg(arg)) {
      filtered.push(arg)
    }
  }
  return { targetLine, timeout, parallel, filtered }
}

function parseParallel(args) {
  const idx = args.indexOf('--parallel')
  if (idx >= 0)
    return parseParallelValue(args, idx)
}

function parseParallelValue(args, idx) {
  const next = args[idx + 1]
  if (!next || next.startsWith('--'))
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

function parseJsonOutput(argv) {
  const idx = argv.indexOf('--json')
  if (idx < 0) return false
  const next = argv[idx + 1]
  if (!next || next.startsWith('--'))
    return true
  return next
}

function hasFlag(argv, flag) {
  return argv.includes(flag)
}

function isInvalidNumber(value) {
  return Number.isNaN(value) || value < 0
}

const FLAG_OPTIONS = new Set(['--json', '--dry-run', '--parallel', '--quiet', '--survivors-only'])
function isPositionalArg(arg) {
  return !FLAG_OPTIONS.has(arg)
}

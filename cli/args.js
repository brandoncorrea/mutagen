/**
 * CLI argument parsing for the manual mutation runner.
 */

import { resolve } from 'node:path'

const usageMessage = `\
Usage: <script> <source-file> [--line N] [--json] [--dry-run] [--timeout N]
       <script> --all [--json] [--dry-run] [--timeout N]
       <script> --incremental [--json] [--timeout N]`

const diffMessage = 'Usage: <script> --diff <before.json> <after.json>'

export function parseArgs(argv = process.argv.slice(2)) {
  const jsonOutput = argv.includes('--json')
  const dryRunMode = argv.includes('--dry-run')

  if (argv.includes('--incremental')) {
    const timeout = parseTimeout(argv)
    if (timeout && timeout.error) return timeout
    return { incrementalMode: true, timeout, jsonOutput }
  }

  if (argv.includes('--all')) {
    const timeout = parseTimeout(argv)
    if (timeout?.error) return timeout
    return { allMode: true, timeout, jsonOutput, dryRunMode }
  }

  if (argv.includes('--diff'))
    return diffOptions(argv)

  const opts = argsToOptions(argv)
  if (opts.error) return opts
  const { targetLine, timeout, filtered } = opts

  if (filtered.length)
    return {
      sourceFile: resolve(filtered[0]),
      targetLine,
      jsonOutput,
      dryRunMode,
      timeout
    }

  return { error: usageMessage }
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

function argsToOptions(args) {
  const filtered = []
  let targetLine, timeout
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--line'){
      targetLine = parseInt(args[++i], 10)
      if (Number.isNaN(targetLine))
        return { error: '--line requires a numeric value' }
    }
    else if (arg === '--timeout') {
      timeout = Number(args[++i])
      if (isInvalidTimeout(timeout))
        return { error: '--timeout requires a numeric value' }
    } else if (isNotFlag(arg)) {
      filtered.push(arg)
    }
  }
  return { targetLine, timeout, filtered }
}

function parseTimeout(args) {
  const idx = args.indexOf('--timeout')
  if (idx < 0) return
  const value = Number(args[idx + 1])
  if (isInvalidTimeout(value))
    return { error: '--timeout requires a numeric value' }
  return value
}

function isInvalidTimeout(timeout) {
  return Number.isNaN(timeout) || timeout < 0
}

const FLAG_OPTIONS = new Set(['--json', '--dry-run'])
function isNotFlag(arg) {
  return !FLAG_OPTIONS.has(arg)
}

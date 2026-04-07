/**
 * CLI argument parsing for the manual mutation runner.
 */

import { resolve } from 'node:path'

export function parseArgs(argv = process.argv.slice(2)) {
  const jsonOutput = argv.includes('--json')
  const dryRunMode = argv.includes('--dry-run')

  if (argv.includes('--incremental'))
    return { incrementalMode: true, jsonOutput, timeout: parseTimeout(argv) }

  if (argv.includes('--all'))
    return { allMode: true, jsonOutput, dryRunMode, timeout: parseTimeout(argv) }

  const diffIdx = argv.indexOf('--diff')
  if (diffIdx >= 0) {
    const beforeFile = argv[diffIdx + 1]
    const afterFile = argv[diffIdx + 2]
    if (!beforeFile || !afterFile)
      return { error: 'Usage: <script> --diff <before.json> <after.json>' }
    return {
      diffMode: true,
      beforeFile: resolve(beforeFile),
      afterFile: resolve(afterFile)
    }
  }

  const { targetLine, timeout, filtered } = argsToOptions(argv)

  if (filtered.length < 1) {
    return {
      error: 'Usage: <script> <source-file> [--line N] [--json] [--dry-run] [--timeout N]\n'
           + '       <script> --all [--json] [--dry-run] [--timeout N]\n'
           + '       <script> --incremental [--json] [--timeout N]'
    }
  }

  return { sourceFile: resolve(filtered[0]), targetLine, jsonOutput, dryRunMode, timeout }
}

function argsToOptions(args) {
  const flags = new Set(['--json', '--dry-run'])
  const filtered = []
  let targetLine = null
  let timeout = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--line')
      targetLine = parseInt(args[++i], 10)
    else if (args[i] === '--timeout')
      timeout = parseInt(args[++i], 10)
    else if (!flags.has(args[i]))
      filtered.push(args[i])
  }
  return { targetLine, timeout, filtered }
}

function parseTimeout(args) {
  const idx = args.indexOf('--timeout')
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null
}

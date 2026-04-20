/**
 * Jest test runner adapter (cold mode only).
 * Runner interface: { run, close }
 *
 * Options:
 *   config  - path to jest.config.js
 *   root    - project root directory (used as cwd)
 */

import { spawn } from 'node:child_process'
import { parseJestOutput } from './jest-parse.js'

export async function createJestRunner(sourceFile, options = {}) {
  const { config, root } = options

  return {
    async run() {
      const args = buildArgs(sourceFile, config)
      const spawnOpts = { stdio: ['ignore', 'pipe', 'pipe'] }
      if (root) spawnOpts.cwd = root

      const stdout = await execJest(args, spawnOpts)
      return parseJestOutput(stdout)
    },
    async close() {}
  }
}

function buildArgs(sourceFile, config) {
  const args = ['jest', '--json', '--findRelatedTests', sourceFile]
  if (config) args.push('--config', config)
  return args
}

function execJest(args, spawnOpts) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', args, spawnOpts)
    let stdout = ''

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', chunk => { stdout += chunk })
    proc.stderr.on('data', () => {})
    proc.on('close', () => resolve(stdout))
    proc.on('error', reject)
  })
}

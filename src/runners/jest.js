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

const MAX_BUFFER = 10 * 1024 * 1024 // 10 MB

export async function createJestRunner(sourceFile, options = {}) {
  const { config, root } = options
  let activeProc = null

  return {
    async run() {
      const args = buildArgs(sourceFile, config)
      const spawnOpts = { stdio: ['ignore', 'pipe', 'pipe'] }
      if (root) spawnOpts.cwd = root

      const { stdout, stderr } = await execJest(args, spawnOpts, p => { activeProc = p })
      activeProc = null
      return parseJestOutput(stdout, stderr)
    },
    async close() {
      if (activeProc) {
        activeProc.kill()
        activeProc = null
      }
    }
  }
}

function buildArgs(sourceFile, config) {
  const args = ['jest', '--json', '--findRelatedTests', sourceFile]
  if (config) args.push('--config', config)
  return args
}

function execJest(args, spawnOpts, onProc) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', args, spawnOpts)
    onProc(proc)
    let stdout = ''
    let stderr = ''
    let stdoutCapped = false
    let stderrCapped = false

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', chunk => {
      if (!stdoutCapped) {
        stdout += chunk
        if (stdout.length > MAX_BUFFER) stdoutCapped = true
      }
    })
    proc.stderr.on('data', chunk => {
      if (!stderrCapped) {
        stderr += chunk
        if (stderr.length > MAX_BUFFER) stderrCapped = true
      }
    })
    proc.stdout.on('error', reject)
    proc.stderr.on('error', reject)
    proc.on('close', () => resolve({ stdout, stderr }))
    proc.on('error', reject)
  })
}

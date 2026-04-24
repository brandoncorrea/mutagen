import { vi } from 'vitest'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { createManualRunner as _createManualRunner } from '../../src/cli/manual.js'

export const testMutators = [{
  name: '=== → !==',
  types: ['BinaryExpression'],
  test: node => node.operator === '===',
  mutate: (node, source) => {
    const idx = source.indexOf('===', node.left.end)
    if (idx === -1) return null
    return { start: idx, end: idx + 3, replacement: '!==' }
  }
}]

export const sourceCode = 'if (a === b) {}'
export const HASH_PREFIX_LENGTH = 16
export const noop = { log: () => {}, error: () => {} }

export function hashOf(content) {
  return createHash('sha256')
    .update(Buffer.from(content))
    .digest('hex')
    .slice(0, HASH_PREFIX_LENGTH)
}

export function fakeRunner(results) {
  let callCount = 0
  return {
    run: vi.fn().mockImplementation(() =>
      Promise.resolve(results[callCount++] || { passed: true })),
    close: vi.fn().mockResolvedValue(undefined)
  }
}

export function mockFs(readFileSync, files) {
  readFileSync.mockImplementation((path, enc) => {
    const content = files[path]
    if (!content)
      return enc === 'utf-8' ? '' : Buffer.from('')
    return enc === 'utf-8' ? content : Buffer.from(content)
  })
}

export function fakePoolRunner(results = []) {
  let callCount = 0
  return {
    run: vi.fn().mockImplementation(() =>
      Promise.resolve(results[callCount++] || { passed: true })),
    close: vi.fn().mockResolvedValue(undefined),
    applyMutation: vi.fn()
  }
}

export const killedMutation = {
  line: 1, name: '=== → !==', original: 'a === b',
  mutated: 'a !== b', source: 'if (a !== b) {}', killedBy: ['t.js']
}

export function makeMutant(id, name, status, line = 1) {
  return { id, name, status, line, replacement: '' }
}

export function capture() {
  const lines = []
  return { out: { log: msg => lines.push(msg), error: () => {} }, lines }
}

export function fakeWorktree(tempRoot = '/tmp/mutagen-test') {
  return {
    root: tempRoot,
    resolve: vi.fn(path => path.replace(resolve('.'), tempRoot)),
    mapPaths: vi.fn(paths => paths),
    cleanup: vi.fn()
  }
}

export function createTestRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

export function setupPool(createPool, results = { killed: [], survived: [], timedOut: [] }) {
  const poolRun = vi.fn().mockResolvedValue(results)
  const poolClose = vi.fn().mockResolvedValue()
  const poolSwitchFile = vi.fn().mockResolvedValue()
  createPool.mockReturnValue({ run: poolRun, close: poolClose, switchFile: poolSwitchFile })
  return { poolRun, poolClose, poolSwitchFile }
}

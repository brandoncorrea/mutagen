import { vi } from 'vitest'
import { createHash } from 'node:crypto'

export const patterns = [
  { pattern: / === /g, replacement: ' !== ', name: '=== → !==' }
]

export const sourceCode = 'if (a === b) {}'
export const HASH_PREFIX_LENGTH = 16
export const noop = () => {}

export function hashOf(content) {
  return createHash('sha256')
    .update(Buffer.from(content))
    .digest('hex')
    .slice(0, HASH_PREFIX_LENGTH)
}

export function fakeRunner(results) {
  const queue = [...results]
  return {
    run: vi.fn().mockImplementation(() =>
      Promise.resolve(queue.shift() || { passed: true })),
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

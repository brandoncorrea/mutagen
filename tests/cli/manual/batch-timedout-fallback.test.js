/**
 * Separate file because this test mocks cli/runner/single.js directly, which is
 * incompatible with the other batch tests that run the real runner with
 * mocked node:fs. The || 0 fallback only triggers when a runner adapter
 * omits timedOut — runSingle always includes it, so this edge case can't
 * be reached through the normal pipeline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/cli/runner/single.js', () => ({
  runSingle: vi.fn()
}))

vi.mock('../../../src/core/temp-copy.js')

import { createManualRunner } from '../../../src/cli/manual.js'
import { createWorktree } from '../../../src/core/temp-copy.js'
import { runSingle } from '../../../src/cli/runner/single.js'

const noop = () => {}
const patterns = [{ pattern: / === /g, replacement: ' !== ', name: 'test' }]

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-test'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path),
    cleanup: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  createWorktree.mockReturnValue(fakeWorktree())
})

describe('createManualRunner', () => {
  describe('runBatch', () => {
    it('treats missing timedOut as 0 (|| 0 fallback)', async () => {
      runSingle.mockResolvedValue({
        survived: 1,
        killed: 0,
        jsonData: { path: 'src/a.js', mutants: [] }
      })

      const manual = createManualRunner({ patterns, sources: ['src/a.js'], createRunner: vi.fn(), out: noop })
      const result = await manual.runBatch(false, null)

      expect(result.totalTimedOut).toBe(0)
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../cli/runner.js', () => ({
  runSingle: vi.fn(),
  dryRun: vi.fn()
}))

import { createManualRunner } from '../../../cli/manual.js'
import { runSingle } from '../../../cli/runner.js'

const noop = () => {}
const patterns = [{ pattern: / === /g, replacement: ' !== ', name: 'test' }]

beforeEach(() => vi.clearAllMocks())

describe('batch timedOut fallback', () => {
  it('treats missing timedOut as 0, not NaN', async () => {
    runSingle.mockResolvedValue({
      survived: 1,
      killed: 0,
      // timedOut deliberately omitted — guards the || 0 fallback
      jsonData: { path: 'src/a.js', mutants: [] }
    })

    const manual = createManualRunner({ patterns, sources: ['src/a.js'], createRunner: vi.fn(), out: noop })
    const result = await manual.runBatch(false, null)

    expect(result.totalTimedOut).toBe(0)
  })
})

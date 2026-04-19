import { describe, it, expect } from 'vitest'
import { PREFLIGHT_ABORT_MSG } from '../../../src/cli/runner/shared.js'

describe('shared constants', () => {
  it('exports PREFLIGHT_ABORT_MSG constant', () => {
    expect(PREFLIGHT_ABORT_MSG).toBe(
      '\nABORT: Tests already FAILING on original source. Fix the suite first.'
    )
  })
})

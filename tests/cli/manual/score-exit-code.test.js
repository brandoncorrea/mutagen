import { describe, it, expect } from 'vitest'
import { scoreExitCode } from '../../../src/cli/dispatch.js'

describe('scoreExitCode', () => {
  it('returns 1 when score is below minScore (50% < 60%)', () => {
    expect(scoreExitCode({ killed: 5, survived: 5, timedOut: 0 }, 60)).toBe(1)
  })

  it('returns 0 when score meets minScore (80% >= 60%)', () => {
    expect(scoreExitCode({ killed: 8, survived: 2, timedOut: 0 }, 60)).toBe(0)
  })

  it('returns 0 when total is zero (100% score)', () => {
    expect(scoreExitCode({ killed: 0, survived: 0, timedOut: 0 }, 60)).toBe(0)
  })

  it('includes timedOut in effectiveKilled', () => {
    // 3 killed + 2 timedOut = 5 effective, 5 survived, total 10 → 50%
    expect(scoreExitCode({ killed: 3, survived: 5, timedOut: 2 }, 60)).toBe(1)
    // 6 killed + 2 timedOut = 8 effective, 2 survived, total 10 → 80%
    expect(scoreExitCode({ killed: 6, survived: 2, timedOut: 2 }, 60)).toBe(0)
  })

  it('returns 0 when score exactly equals minScore', () => {
    // 6 killed, 4 survived, 0 timedOut → 60% === 60%
    expect(scoreExitCode({ killed: 6, survived: 4, timedOut: 0 }, 60)).toBe(0)
  })

  it('timedOut pushes score above threshold (proves addition not subtraction)', () => {
    // 5 killed + 3 timedOut = 8 effective, 2 survived, total 10 → 80% ≥ 75 → pass
    // With subtraction: 5 - 3 = 2 effective, total 4 → 50% < 75 → fail
    expect(scoreExitCode({ killed: 5, survived: 2, timedOut: 3 }, 75)).toBe(0)
  })
})

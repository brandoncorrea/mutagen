/**
 * Promise-based timeout utility.
 * Races a function against a timer — rejects if the timer fires first.
 */

export function withTimeout(fn, ms) {
  if (!ms) return fn()
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Mutation timed out after ${ms}ms`)), ms))
  ])
}


/**
 * Promise-based timeout utility.
 * Races a function against a timer — rejects if the timer fires first.
 */

export function withTimeout(fn, ms) {
  return ms ? createTimeout(fn, ms) : fn()
}

function createTimeout(fn, ms) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Mutation timed out after ${ms}ms`)), ms))
  ])
}

/**
 * Promise-based timeout utility.
 * Races a function against a timer — rejects if the timer fires first.
 */

export function withTimeout(fn, ms) {
  return ms ? createTimeout(fn, ms) : fn()
}

function createTimeout(fn, ms) {
  let timer
  return Promise.race([
    fn().finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms}ms`)),
        ms
      )
    })
  ])
}

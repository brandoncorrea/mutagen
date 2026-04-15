export const patterns = [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }]
export const sources = ['src/a.js']
export async function createRunner() {
  let first = true
  return {
    async run() {
      if (first) {
        first = false
        return { passed: true }
      }
      return { passed: false, killedBy: ['t.test.js'] }
    },
    async close() {}
  }
}

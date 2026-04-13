export default {
  patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
  sources: ['src/a.js'],
  createRunner: async () => {
    let first = true
    return {
      async run() {
        if (first) { first = false; return { passed: true } }
        return { passed: false, killedBy: ['t.test.js'] }
      },
      async close() {}
    }
  }
}

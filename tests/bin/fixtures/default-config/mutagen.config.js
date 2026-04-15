export default {
  mutators: [{
    name: '=== → !==',
    types: ['BinaryExpression'],
    test: node => node.operator === '===',
    mutate: (node, source) => {
      const idx = source.indexOf('===', node.left.end)
      if (idx === -1) return null
      return { start: idx, end: idx + 3, replacement: '!==' }
    }
  }],
  sources: ['src/a.js'],
  createRunner: async () => {
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
}

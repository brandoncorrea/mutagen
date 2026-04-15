export const mutators = [{
  name: '=== → !==',
  types: ['BinaryExpression'],
  test: node => node.operator === '===',
  mutate: (node, source) => {
    const idx = source.indexOf('===', node.left.end)
    if (idx === -1) return null
    return { start: idx, end: idx + 3, replacement: '!==' }
  }
}]
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

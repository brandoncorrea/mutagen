/**
 * Vitest test runner adapter.
 * Creates a warm Vitest instance for fast re-runs during mutation testing.
 * Runner interface: { run: async () => boolean, close: async () => {} }
 */

export async function createVitestRunner(testFile, sourceFile) {
  const { startVitest } = await import('vitest/node')

  const vitest = await startVitest('test', [testFile], {
    watch: false,
    reporters: [{ onFinished() {} }]
  })

  return {
    async run() {
      if (sourceFile) vitest.invalidateFile(sourceFile)
      const files = vitest.state.getFiles()
      await vitest.rerunFiles(files.map(f => f.filepath))
      const results = vitest.state.getFiles()
      return results.every(f => f.result?.state === 'pass')
    },
    async close() {
      await vitest.close()
    }
  }
}

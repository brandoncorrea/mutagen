/**
 * Vitest test runner adapter.
 * Runner interface: { run: async () => { passed: boolean }, close: async () => {} }
 *
 * Options:
 *   config  - path to vitest config file (for monorepo workspaces)
 *   root    - project root directory (for monorepo workspaces)
 *   testFile - specific test file to run (optional; runs all tests if omitted)
 *   warm    - attempt warm rerun (default: true). Falls back to cold if rerun fails.
 */

export async function createVitestRunner(sourceFile, options = {}) {
  const { config, root, testFile, warm = true } = options
  const { startVitest } = await import('vitest/node')

  const vitestOpts = {
    watch: false,
    reporters: [{ onFinished() {} }],
    ...(config && { config }),
    ...(root && { root }),
  }

  const testFilter = testFile ? [testFile] : []

  if (!warm) {
    return coldRunner(startVitest, testFilter, vitestOpts, sourceFile)
  }

  // Try warm runner first — reuses a single vitest instance across mutations.
  // If the initial warm rerun fails (vitest v4 compatibility issue), fall back to cold.
  const vitest = await startVitest('test', testFilter, vitestOpts)

  // Verify warm rerun works by running once and checking results are valid
  const canWarmRerun = await testWarmRerun(vitest, sourceFile)
  if (!canWarmRerun) {
    await vitest.close()
    return coldRunner(startVitest, testFilter, vitestOpts, sourceFile)
  }

  return {
    async run() {
      if (sourceFile) vitest.invalidateFile(sourceFile)
      const files = vitest.state.getFiles()
      await vitest.rerunFiles(files.map(f => f.filepath))
      const results = vitest.state.getFiles()
      return { passed: results.every(f => f.result?.state === 'pass') }
    },
    async close() {
      await vitest.close()
    },
  }
}

async function testWarmRerun(vitest, sourceFile) {
  try {
    // The initial startVitest already ran tests and they passed.
    // Try a rerun without any source changes — if it reports failure, warm mode is broken.
    if (sourceFile) vitest.invalidateFile(sourceFile)
    const files = vitest.state.getFiles()
    await vitest.rerunFiles(files.map(f => f.filepath))
    const results = vitest.state.getFiles()
    return results.every(f => f.result?.state === 'pass')
  } catch {
    return false
  }
}

function coldRunner(startVitest, testFilter, vitestOpts, _sourceFile) {
  return {
    async run() {
      const vitest = await startVitest('test', testFilter, vitestOpts)
      try {
        const results = vitest.state.getFiles()
        return { passed: results.every(f => f.result?.state === 'pass') }
      } finally {
        await vitest.close()
      }
    },
    async close() {},
  }
}

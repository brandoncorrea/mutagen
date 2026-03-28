/**
 * Vitest test runner adapter.
 * Runner interface: { run: async () => { passed: boolean }, close: async () => {} }
 *
 * Options:
 *   config  - path to vitest config file (for monorepo workspaces)
 *   root    - project root directory (for monorepo workspaces)
 *   testFile - specific test file to run (optional; runs all tests if omitted)
 *   warm    - attempt warm rerun (default: true). Falls back to cold if warm fails.
 */

export async function createVitestRunner(sourceFile, options = {}) {
  const { config, root, testFile, warm = true } = options
  const { startVitest } = await import('vitest/node')

  const vitestOpts = {
    reporters: [{ onFinished() {} }],
    bail: 1,
    ...(config && { config }),
    ...(root && { root }),
  }

  const testFilter = testFile ? [testFile] : []

  if (!warm) {
    return coldRunner(startVitest, testFilter, vitestOpts)
  }

  // Warm runner: start vitest in watch mode to keep the worker pool alive
  // between mutations. watch:true is required — watch:false shuts down the
  // pool after the initial run, making subsequent runTestSpecifications fail.
  const vitest = await startVitest('test', testFilter, { ...vitestOpts, watch: true })
  await vitest.waitForTestRunEnd()

  // Verify warm rerun works by re-running without changes
  const canWarmRerun = await testWarmRerun(vitest)
  if (!canWarmRerun) {
    await vitest.close()
    return coldRunner(startVitest, testFilter, vitestOpts)
  }

  // Build related-test specs by walking the vite module graph.
  // Only test files that transitively import the source file need to run.
  const relatedSpecs = await findRelatedSpecs(vitest, sourceFile)

  return {
    async run() {
      if (sourceFile) vitest.invalidateFile(sourceFile)
      const specs = relatedSpecs || await vitest.globTestSpecifications()
      await vitest.runTestSpecifications(specs)
      const results = vitest.state.getFiles()
      return { passed: results.every(f => f.result?.state === 'pass') }
    },
    async close() {
      await vitest.close()
    },
  }
}

async function findRelatedSpecs(vitest, sourceFile) {
  if (!sourceFile) return null

  const graph = vitest.projects[0]?._vite?.moduleGraph
  if (!graph) return null

  // Walk importers recursively to find all test files
  const testFiles = new Set()
  const allSpecs = await vitest.globTestSpecifications()
  const testPaths = new Set(allSpecs.map(s => s.moduleId))

  const visited = new Set()
  const queue = [sourceFile]

  while (queue.length > 0) {
    const id = queue.pop()
    if (visited.has(id)) continue
    visited.add(id)

    if (testPaths.has(id)) {
      testFiles.add(id)
      continue
    }

    const mod = graph.getModuleById(id)
    if (!mod) continue
    for (const importer of mod.importers) {
      if (importer.id) queue.push(importer.id)
    }
  }

  if (testFiles.size === 0) return null
  return allSpecs.filter(s => testFiles.has(s.moduleId))
}

async function testWarmRerun(vitest) {
  try {
    const specs = await vitest.globTestSpecifications()
    await vitest.runTestSpecifications(specs)
    const results = vitest.state.getFiles()
    return results.every(f => f.result?.state === 'pass')
  } catch {
    return false
  }
}

function coldRunner(startVitest, testFilter, vitestOpts) {
  return {
    async run() {
      const vitest = await startVitest('test', testFilter, { ...vitestOpts, watch: false })
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

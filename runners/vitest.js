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
    ...(root && { root })
  }

  const testFilter = testFile ? [testFile] : []

  if (!warm)
    return coldRunner(startVitest, testFilter, vitestOpts)

  // Warm runner: start vitest in watch mode to keep the worker pool alive
  // between mutations. watch:true is required — watch:false shuts down the
  // pool after the initial run, making subsequent runTestSpecifications fail.
  const vitest = await startVitest('test', testFilter, { ...vitestOpts, watch: true })
  await vitest.waitForTestRunEnd()

  // Verify warm rerun works by re-running without changes
  if (await noWarmRerun(vitest)) {
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
      return compileResults(vitest)
    },
    async close() {
      await vitest.close()
    }
  }
}

function failedTestFiles(results) {
  return results
    .filter(isFailing)
    .map(f => f.filepath)
}

async function findRelatedSpecs(vitest, sourceFile) {
  if (!sourceFile) return

  const graph = vitest.projects[0]?._vite?.moduleGraph
  if (!graph) return

  // Walk importers recursively to find all test files
  const testFiles = new Set()
  const allSpecs = await vitest.globTestSpecifications()
  const testPaths = new Set(allSpecs.map(s => s.moduleId))

  const visited = new Set()
  const queue = [sourceFile]

  const state = { testFiles, testPaths, visited, queue, graph }

  while (queue.length) {
    const id = queue.pop()
    if (!visited.has(id))
      visitSourceFile(state, id)
  }

  if (testFiles.size)
    return allSpecs.filter(s => testFiles.has(s.moduleId))
}

function visitSourceFile(state, id) {
  state.visited.add(id)
  if (state.testPaths.has(id))
    state.testFiles.add(id)
  else
    enqueueModule(state, id)
}

function enqueueModule({ graph, queue }, id) {
  const mod = graph.getModuleById(id)
  if (mod)
    for (const { id } of mod.importers)
      if (id)
        queue.push(id)
}

async function noWarmRerun(vitest) {
  try {
    const specs = await vitest.globTestSpecifications()
    await vitest.runTestSpecifications(specs)
    return !vitest
      .state
      .getFiles()
      .every(isPassing)
  } catch {
    return true
  }
}

function coldRunner(startVitest, testFilter, vitestOpts) {
  return {
    async run() {
      const vitest = await startVitest('test', testFilter, { ...vitestOpts, watch: false })
      try {
        return compileResults(vitest)
      } finally {
        await vitest.close()
      }
    },
    async close() {}
  }
}

function compileResults(vitest) {
  const results = vitest.state.getFiles()
  const passed = results.every(isPassing)
  const killedBy = passed ? [] : failedTestFiles(results)
  return { passed, killedBy }
}

function isPassing(file) {
  return file.result?.state === 'pass'
}

function isFailing(file) {
  return file.result?.state === 'fail'
}

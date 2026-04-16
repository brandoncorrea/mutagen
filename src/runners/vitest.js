/**
 * Vitest test runner adapter.
 * Runner interface: { run, close }
 *
 * Options:
 *   config  - path to vitest config file (for monorepo workspaces)
 *   root    - project root directory (for monorepo workspaces)
 *   testFile - specific test file to run (optional; runs all tests if omitted)
 *   warm    - attempt warm rerun (default: true). Falls back to cold if warm fails.
 */

export async function createVitestRunner(sourceFile, options = {}) {
  const { testFile, warm = true } = options
  const { startVitest } = await import('vitest/node')
  const vitestOpts = createVitestOptions(options)
  const testFilter = testFile ? [testFile] : []

  if (!warm)
    return coldRunner(startVitest, testFilter, vitestOpts)

  // Warm runner: start vitest in watch mode to keep the worker pool alive
  // between mutations. watch:true is required — watch:false shuts down the
  // pool after the initial run, making subsequent runTestSpecifications fail.
  const vitest = await startVitest('test', testFilter, { ...vitestOpts, watch: true })
  await vitest.waitForTestRunEnd()

  // The initial run serves as preflight — check if tests pass.
  const initialResults = vitest.state.getFiles()
  const preflightPassed = initialResults.every(isPassing)

  // Build related-test specs by walking the vite module graph.
  // Only test files that transitively import the source file need to run.
  let currentSourceFile = sourceFile
  let relatedSpecs = await findRelatedSpecs(vitest, sourceFile)

  return {
    preflight: { passed: preflightPassed },
    async switchFile(newSourceFile) {
      flushModuleState(vitest)
      currentSourceFile = newSourceFile
      relatedSpecs = await findRelatedSpecs(vitest, newSourceFile)
    },
    async run() {
      if (currentSourceFile) vitest.invalidateFile(currentSourceFile)
      const specs = relatedSpecs || await vitest.globTestSpecifications()
      const { direct, indirect } = splitSpecs(specs, currentSourceFile)

      const tier1Specs = direct.length ? direct : specs
      await vitest.runTestSpecifications(tier1Specs)
      const tier1 = compileResults(vitest)

      if (!tier1.passed || !indirect.length || !direct.length)
        return tier1

      await vitest.runTestSpecifications(indirect)
      const tier2 = compileResults(vitest)

      return {
        passed: tier2.passed,
        killedBy: tier2.killedBy,
        coveredBy: [...tier1.coveredBy, ...tier2.coveredBy]
      }
    },
    async close() {
      await vitest.close()
    }
  }
}

function flushModuleState(vitest) {
  for (const project of vitest.projects) {
    const vite = project._vite
    if (!vite) continue
    for (const env of Object.values(vite.environments))
      env.moduleGraph.invalidateAll()
    vite.moduleGraph.invalidateAll()
  }
  vitest._fsCache?.clearCache()
}

function createVitestOptions({ config, root }) {
  return {
    reporters: [{ onFinished() {} }],
    bail: 1,
    stdin: false,
    ...(config && { config }),
    ...(root && { root })
  }
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

function enqueueModule({ graph, queue }, moduleId) {
  const mod = graph.getModuleById(moduleId)
  if (mod)
    for (const { id } of mod.importers)
      if (id)
        queue.push(id)
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

function splitSpecs(specs, sourceFile) {
  if (!sourceFile) return { direct: specs, indirect: [] }

  const stem = fileStem(sourceFile)
  const direct = []
  const indirect = []
  for (const spec of specs)
    (fileBasename(spec.moduleId).includes(stem) ? direct : indirect).push(spec)
  return { direct, indirect }
}

function fileStem(filepath) {
  const base = fileBasename(filepath)
  const dot = base.indexOf('.')
  return dot > 0 ? base.substring(0, dot) : base
}

function fileBasename(filepath) {
  return filepath.substring(filepath.lastIndexOf('/') + 1)
}

function compileResults(vitest) {
  const results = vitest.state.getFiles()
  const passed = results.every(isPassing)
  const killedBy = passed ? [] : failedTestFiles(results)
  const coveredBy = allTestFiles(results)
  return { passed, killedBy, coveredBy }
}

function failedTestFiles(results) {
  return results
    .filter(isFailing)
    .map(f => f.filepath)
}

function isPassing(file) {
  return file.result?.state === 'pass'
}

function isFailing(file) {
  return file.result?.state === 'fail'
}

function allTestFiles(results) {
  return results.map(f => f.filepath)
}

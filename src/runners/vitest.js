/**
 * Vitest test runner adapter.
 * Runner interface: { run, close }
 *
 * Options:
 *   config  - path to vitest config file (for monorepo workspaces)
 *   root    - project root directory (for monorepo workspaces)
 *   testFile - specific test file to run (optional; runs all tests if omitted)
 *   warm    - attempt warm rerun (default: true).
 */

import { basename, parse as parsePath } from 'node:path'
import { Readable } from 'node:stream'

export const BAIL_ON_FIRST_FAILURE = 1

export async function createVitestRunner(sourceFile, options = {}) {
  const { testFile, warm = true } = options
  const { startVitest } = await import('vitest/node')
  const vitestOpts = createVitestOptions(options)
  const testFilter = testFile ? [testFile] : []

  if (!warm)
    return coldRunner(startVitest, testFilter, vitestOpts)

  return warmRunner(startVitest, testFilter, vitestOpts, sourceFile)
}

/**
 * Warm runner: keeps vitest in watch mode so the worker pool stays alive
 * between mutations. watch:true is required — watch:false shuts down the
 * pool after the initial run, making subsequent runTestSpecifications fail.
 */
async function warmRunner(startVitest, testFilter, vitestOpts, sourceFile) {
  const vitest = await startVitestClean(
    startVitest, testFilter, { ...vitestOpts, watch: true }
  )
  await vitest.waitForTestRunEnd()

  const preflightPassed = vitest.state.getFiles().every(isPassing)

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
      return runTieredSpecs(vitest, currentSourceFile, relatedSpecs)
    },
    async close() {
      await vitest.close()
    }
  }
}

/**
 * Run specs in two tiers: direct (test name matches source) first,
 * then indirect. Short-circuits if tier 1 finds a failure.
 */
async function runTieredSpecs(vitest, sourceFile, relatedSpecs) {
  if (sourceFile) vitest.invalidateFile(sourceFile)
  const specs = relatedSpecs || await vitest.globTestSpecifications()
  const { direct, indirect } = splitSpecs(specs, sourceFile)

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
}

function flushModuleState(vitest) {
  for (const project of vitest.projects) {
    const vite = project._vite
    if (!vite) continue
    for (const env of Object.values(vite.environments))
      env.moduleGraph.invalidateAll()
    vite.moduleGraph.invalidateAll()
  }
  vitest._fsCache?.clearCache(false)
}

/**
 * Start vitest and strip the SIGINT/SIGTERM handlers it registers.
 * Our pool already handles cleanup — vitest's handlers just accumulate
 * and trigger MaxListenersExceededWarning with multiple parallel instances.
 */
const VITEST_OPTIONS = Object.freeze({ stdin: Readable.from([]) })

async function startVitestClean(startVitest, testFilter, opts) {
  const sigint = process.listeners('SIGINT')
  const sigterm = process.listeners('SIGTERM')
  const vitest = await startVitest('test', testFilter, opts, {}, VITEST_OPTIONS)
  for (const listener of process.listeners('SIGINT'))
    if (!sigint.includes(listener))
      process.removeListener('SIGINT', listener)
  for (const listener of process.listeners('SIGTERM'))
    if (!sigterm.includes(listener))
      process.removeListener('SIGTERM', listener)
  return vitest
}

function createVitestOptions({ config, root }) {
  return {
    reporters: [{ onFinished() {} }],
    bail: BAIL_ON_FIRST_FAILURE,
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
  const testPaths = new Set(allSpecs.map(spec => spec.moduleId))

  const visited = new Set()
  const queue = [sourceFile]

  const state = { testFiles, testPaths, visited, queue, graph }

  while (queue.length) {
    const id = queue.pop()
    if (!visited.has(id))
      visitSourceFile(state, id)
  }

  if (testFiles.size)
    return allSpecs.filter(spec => testFiles.has(spec.moduleId))
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
      const vitest = await startVitestClean(
        startVitest, testFilter,
        { ...vitestOpts, watch: false }
      )
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

  const stem = parsePath(sourceFile).name
  const direct = []
  const indirect = []
  for (const spec of specs) {
    if (basename(spec.moduleId).includes(stem))
      direct.push(spec)
    else
      indirect.push(spec)
  }
  return { direct, indirect }
}

function compileResults(vitest) {
  const results = vitest.state.getFiles()
  const passed = results.every(isPassing)
  return {
    passed,
    killedBy: passed ? [] : failedTestFiles(results),
    coveredBy: allTestFiles(results)
  }
}

function failedTestFiles(results) {
  return allTestFiles(results.filter(isFailing))
}

function isPassing(file) {
  return file.result?.state === 'pass'
}

function isFailing(file) {
  return file.result?.state === 'fail'
}

function allTestFiles(results) {
  return results.map(file => file.filepath)
}

/**
 * Vite plugin for in-memory mutant switching.
 * Intercepts module loading to serve mutated source without file I/O.
 *
 * Usage:
 *   const { plugin, setMutant, clearMutant } = createMutantPlugin()
 *   // Pass plugin to vitest's vite config
 *   // Call setMutant(filePath, source) before each test run
 *   // Call clearMutant(filePath) to restore original loading
 */

export function createMutantPlugin() {
  const mutants = new Map()

  return {
    plugin: {
      name: 'mutagen-mutant',
      enforce: 'pre',
      load(id) {
        return mutants.get(id) ?? null
      }
    },
    setMutant(filePath, source) {
      mutants.set(filePath, source)
    },
    clearMutant(filePath) {
      mutants.delete(filePath)
    }
  }
}

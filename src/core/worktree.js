/**
 * Temp project copy for mutation isolation.
 * Creates a lightweight copy of the project, excluding node_modules and .git,
 * with node_modules symlinked back to the original.
 *
 * Each mutation worker gets its own copy so mutations are written to disk
 * without touching the original source files (crash-safe).
 */

import { cpSync, symlinkSync, rmSync, existsSync, mkdtempSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'

export function createWorktree(projectRoot) {
  const root = mkdtempSync(join(tmpdir(), 'mutagen-'))

  cpSync(projectRoot, root, {
    recursive: true,
    filter: (src) => {
      const rel = relative(projectRoot, src)
      return !rel.startsWith('node_modules') && !rel.startsWith('.git')
    }
  })

  const nodeModules = join(projectRoot, 'node_modules')
  if (existsSync(nodeModules))
    symlinkSync(nodeModules, join(root, 'node_modules'))

  return {
    root,
    resolve(originalPath) {
      return join(root, relative(projectRoot, originalPath))
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

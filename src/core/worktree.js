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
  const root = makeRoot(projectRoot)
  return {
    root,
    resolve(originalPath) {
      return join(root, relative(projectRoot, originalPath))
    },
    unresolve(tempPath) {
      return join(projectRoot, relative(root, tempPath))
    },
    mapPaths(paths) {
      return paths?.map(p => join(projectRoot, relative(root, p)))
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

function makeRoot(projectRoot) {
  const root = mkdtempSync(join(tmpdir(), 'mutagen-'))
  copyProject(projectRoot, root)
  linkNodeModules(projectRoot, root)
  return root
}

function copyProject(projectRoot, root) {
  cpSync(projectRoot, root, {
    recursive: true,
    filter: src => shouldCopy(relative(projectRoot, src))
  })
}

function linkNodeModules(projectRoot, root) {
  const nodeModules = join(projectRoot, 'node_modules')
  if (existsSync(nodeModules))
    symlinkSync(nodeModules, join(root, 'node_modules'))
}

function shouldCopy(file) {
  return !file.startsWith('node_modules')
    && !file.startsWith('.git')
}

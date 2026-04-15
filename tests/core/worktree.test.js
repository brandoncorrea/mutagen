/**
 * Tests for core/worktree.js — temp project copy for mutation isolation.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { createWorktree } from '../../src/core/worktree.js'

function makeTempProject() {
  const root = mkdtempSync(join(tmpdir(), 'mutagen-test-project-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'tests'))
  mkdirSync(join(root, 'node_modules'))
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, 'src', 'a.js'), 'const x = 1')
  writeFileSync(join(root, 'tests', 'a.test.js'), 'test("a", () => {})')
  writeFileSync(join(root, 'vitest.config.js'), 'export default {}')
  writeFileSync(join(root, 'node_modules', 'marker.txt'), 'npm-dep')
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main')
  return root
}

describe('createWorktree', () => {
  const cleanups = []

  afterEach(() => {
    for (const fn of cleanups) fn()
    cleanups.length = 0
  })

  function tracked(wt) {
    cleanups.push(wt.cleanup)
    return wt
  }

  it('copies source files into a temp directory', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))

    expect(existsSync(join(wt.root, 'src', 'a.js'))).toBe(true)
    expect(readFileSync(join(wt.root, 'src', 'a.js'), 'utf-8')).toBe('const x = 1')
  })

  it('copies test files', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))

    expect(existsSync(join(wt.root, 'tests', 'a.test.js'))).toBe(true)
  })

  it('copies config files', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))

    expect(existsSync(join(wt.root, 'vitest.config.js'))).toBe(true)
  })

  it('excludes node_modules from copy', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))

    // node_modules should be a symlink, not a copy of the contents
    expect(existsSync(join(wt.root, 'node_modules', 'marker.txt'))).toBe(true)
    expect(lstatSync(join(wt.root, 'node_modules')).isSymbolicLink()).toBe(true)
  })

  it('symlinks node_modules to original project', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))

    const target = realpathSync(join(wt.root, 'node_modules'))
    expect(target).toBe(realpathSync(join(project, 'node_modules')))
  })

  it('excludes .git from copy', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))

    expect(existsSync(join(wt.root, '.git'))).toBe(false)
  })

  it('resolve() maps original absolute paths to temp paths', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))
    const resolved = wt.resolve(join(project, 'src', 'a.js'))

    expect(resolved).toBe(join(wt.root, 'src', 'a.js'))
    expect(existsSync(resolved)).toBe(true)
  })

  it('unresolve() maps temp paths back to original project paths', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))
    const tempPath = join(wt.root, 'src', 'a.js')

    expect(wt.unresolve(tempPath)).toBe(join(project, 'src', 'a.js'))
  })

  it('unresolve() returns the path unchanged when not under temp root', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = tracked(createWorktree(project))
    const outsidePath = '/some/other/path.js'

    expect(wt.unresolve(outsidePath)).toBe(outsidePath)
  })

  it('cleanup() removes the temp directory', () => {
    const project = makeTempProject()
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))

    const wt = createWorktree(project)
    const root = wt.root

    expect(existsSync(root)).toBe(true)
    wt.cleanup()
    expect(existsSync(root)).toBe(false)
  })

  it('handles projects without node_modules', () => {
    const project = mkdtempSync(join(tmpdir(), 'mutagen-test-nomod-'))
    cleanups.push(() => rmSync(project, { recursive: true, force: true }))
    writeFileSync(join(project, 'index.js'), 'hello')

    const wt = tracked(createWorktree(project))

    expect(existsSync(join(wt.root, 'index.js'))).toBe(true)
    expect(existsSync(join(wt.root, 'node_modules'))).toBe(false)
  })
})

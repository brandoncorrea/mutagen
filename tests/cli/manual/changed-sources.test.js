import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn()
  }
})

vi.mock('../../../src/core/temp-copy.js')
vi.mock('../../../src/core/git-changed.js')

import { createManualRunner as _createManualRunner } from '../../../src/cli/manual.js'
import { createWorktree } from '../../../src/core/temp-copy.js'
import { gitChangedFiles } from '../../../src/core/git-changed.js'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { testMutators, sourceCode, fakeRunner, mockFs as _mockFs, noop } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-test'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    cleanup: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  existsSync.mockReturnValue(false)
  createWorktree.mockReturnValue(fakeWorktree())
})

describe('--changed flag filters sources to git-changed files', () => {
  it('runs only changed files in batch mode', async () => {
    readdirSync.mockReturnValue(['src/a.js', 'src/b.js', 'src/c.js'])
    gitChangedFiles.mockReturnValue(['src/b.js'])
    mockFs({ [resolve('src/b.js')]: sourceCode })
    const runner = fakeRunner([
      { passed: true }, { passed: false, killedBy: ['t.js'] }
    ])

    const manual = createManualRunner({
      mutators: testMutators,
      include: ['src/**/*.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    const result = await manual.run(['--all', '--changed'])

    expect(result).toBe(0)
    expect(gitChangedFiles).toHaveBeenCalled()
  })

  it('intersects changed files with glob-resolved sources', async () => {
    readdirSync.mockReturnValue(['src/a.js', 'src/b.js', 'lib/c.js'])
    gitChangedFiles.mockReturnValue(['src/b.js', 'lib/c.js'])
    mockFs({ [resolve('src/b.js')]: sourceCode })
    const runner = fakeRunner([
      { passed: true }, { passed: false, killedBy: ['t.js'] }
    ])

    const manual = createManualRunner({
      mutators: testMutators,
      include: ['src/**/*.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    // lib/c.js is changed but not in include glob, so only src/b.js runs
    const result = await manual.run(['--all', '--changed'])

    expect(result).toBe(0)
  })

  it('returns exit 0 when no changed files match sources', async () => {
    readdirSync.mockReturnValue(['src/a.js', 'src/b.js'])
    gitChangedFiles.mockReturnValue(['lib/unrelated.js'])

    const manual = createManualRunner({
      mutators: testMutators,
      include: ['src/**/*.js'],
      createRunner: vi.fn()
    })
    const result = await manual.run(['--all', '--changed'])

    expect(result).toBe(0)
  })

  it('does not call gitChangedFiles when --changed is absent', async () => {
    readdirSync.mockReturnValue(['src/a.js'])
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = fakeRunner([
      { passed: true }, { passed: false, killedBy: ['t.js'] }
    ])

    const manual = createManualRunner({
      mutators: testMutators,
      include: ['src/**/*.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    await manual.run(['--all'])

    expect(gitChangedFiles).not.toHaveBeenCalled()
  })
})

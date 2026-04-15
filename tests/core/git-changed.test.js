import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}))

import { gitChangedFiles } from '../../src/core/git-changed.js'
import { execSync } from 'node:child_process'

beforeEach(() => vi.clearAllMocks())

describe('gitChangedFiles', () => {
  it('returns files from git diff --name-only HEAD', () => {
    execSync.mockReturnValue('src/a.js\nsrc/b.js\n')
    expect(gitChangedFiles()).toEqual(['src/a.js', 'src/b.js'])
  })

  it('returns empty array when no changes', () => {
    execSync.mockReturnValue('')
    expect(gitChangedFiles()).toEqual([])
  })

  it('strips trailing newlines and empty lines', () => {
    execSync.mockReturnValue('src/a.js\n\n')
    expect(gitChangedFiles()).toEqual(['src/a.js'])
  })

  it('uses cwd option when provided', () => {
    execSync.mockReturnValue('')
    gitChangedFiles({ cwd: '/my/project' })
    expect(execSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cwd: '/my/project' })
    )
  })

  it('includes both staged and unstaged changes', () => {
    execSync.mockReturnValue('src/staged.js\nsrc/unstaged.js\n')
    expect(gitChangedFiles()).toEqual(['src/staged.js', 'src/unstaged.js'])
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('HEAD'),
      expect.any(Object)
    )
  })

  it('normalizes backslashes to forward slashes', () => {
    execSync.mockReturnValue('src\\utils\\a.js\n')
    expect(gitChangedFiles()).toEqual(['src/utils/a.js'])
  })

  it('returns empty array when git command fails', () => {
    execSync.mockImplementation(() => { throw new Error('not a git repo') })
    expect(gitChangedFiles()).toEqual([])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readdirSync: vi.fn()
  }
})

import { resolveGlobs } from '../../core/resolve-globs.js'
import { readdirSync } from 'node:fs'

beforeEach(() => {
  vi.clearAllMocks()
})

function mockDir(files) {
  readdirSync.mockReturnValue(files)
}

describe('resolveGlobs', () => {
  it('returns files matching a single include pattern', () => {
    mockDir(['src/a.js', 'src/b.js', 'lib/c.ts'])
    const result = resolveGlobs({ include: ['src/**/*.js'] })
    expect(result).toEqual(['src/a.js', 'src/b.js'])
  })

  it('returns files matching multiple include patterns', () => {
    mockDir(['src/a.js', 'lib/b.ts', 'lib/c.js'])
    const result = resolveGlobs({ include: ['src/**/*.js', 'lib/**/*.ts'] })
    expect(result).toEqual(['lib/b.ts', 'src/a.js'])
  })

  it('excludes files matching exclude patterns', () => {
    mockDir(['src/a.js', 'src/vendor/b.js', 'node_modules/pkg/c.js'])
    const result = resolveGlobs({
      include: ['**/*.js'],
      exclude: ['node_modules/**', 'src/vendor/**']
    })
    expect(result).toEqual(['src/a.js'])
  })

  it('defaults exclude to empty (no exclusions)', () => {
    mockDir(['a.js', 'b.js'])
    const result = resolveGlobs({ include: ['**/*.js'] })
    expect(result).toEqual(['a.js', 'b.js'])
  })

  it('returns sorted results', () => {
    mockDir(['z.js', 'a.js', 'm.js'])
    const result = resolveGlobs({ include: ['**/*.js'] })
    expect(result).toEqual(['a.js', 'm.js', 'z.js'])
  })

  it('passes cwd to readdirSync', () => {
    mockDir([])
    resolveGlobs({ include: ['*.js'], cwd: '/my/project' })
    expect(readdirSync).toHaveBeenCalledWith('/my/project', { recursive: true })
  })

  it('defaults cwd to process.cwd()', () => {
    mockDir([])
    resolveGlobs({ include: ['*.js'] })
    expect(readdirSync).toHaveBeenCalledWith(process.cwd(), { recursive: true })
  })

  it('returns empty array when no files match', () => {
    mockDir(['a.ts', 'b.ts'])
    const result = resolveGlobs({ include: ['**/*.js'] })
    expect(result).toEqual([])
  })

  it('filters directories from results', () => {
    mockDir(['src', 'src/a.js'])
    const result = resolveGlobs({ include: ['**/*.js'] })
    expect(result).toEqual(['src/a.js'])
  })

  it('normalizes backslash paths to forward slash', () => {
    mockDir(['src\\sub\\a.js'])
    const result = resolveGlobs({ include: ['src/**/*.js'] })
    expect(result).toEqual(['src/sub/a.js'])
  })
})

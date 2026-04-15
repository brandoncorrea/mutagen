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

import { createManualRunner as _createManualRunner } from '../../../src/cli/manual.js'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { patterns, sourceCode, fakeRunner, mockFs as _mockFs, noop } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

beforeEach(() => {
  vi.clearAllMocks()
  existsSync.mockReturnValue(false)
})

describe('createManualRunner with include/exclude globs', () => {
  it('resolves include globs to sources at creation time', async () => {
    readdirSync.mockReturnValue(['src/a.js', 'src/b.js', 'lib/c.ts'])
    mockFs({
      [resolve('src/a.js')]: sourceCode,
      [resolve('src/b.js')]: sourceCode
    })
    const runner = fakeRunner([
      { passed: true }, { passed: false, killedBy: ['t.js'] },
      { passed: true }, { passed: false, killedBy: ['t.js'] }
    ])

    const manual = createManualRunner({
      patterns,
      include: ['src/**/*.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    const result = await manual.runBatch(false, null)

    expect(result.totalKilled).toBe(2)
    expect(result.failures).toBe(0)
  })

  it('applies exclude patterns to filter out files', async () => {
    readdirSync.mockReturnValue(['src/a.js', 'src/vendor/b.js'])
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = fakeRunner([
      { passed: true }, { passed: false, killedBy: ['t.js'] }
    ])

    const manual = createManualRunner({
      patterns,
      include: ['**/*.js'],
      exclude: ['src/vendor/**'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    const result = await manual.runBatch(false, null)

    expect(result.totalKilled).toBe(1)
    expect(result.failures).toBe(0)
  })

  it('explicit sources takes precedence over include/exclude', async () => {
    readdirSync.mockReturnValue(['src/a.js', 'src/b.js'])
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const runner = fakeRunner([
      { passed: true }, { passed: false, killedBy: ['t.js'] }
    ])

    const manual = createManualRunner({
      patterns,
      sources: ['src/a.js'],
      include: ['src/**/*.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    })
    const result = await manual.runBatch(false, null)

    // Only src/a.js should run (from explicit sources), not src/b.js
    expect(result.totalKilled).toBe(1)
  })

  it('passes cwd to glob resolution', () => {
    readdirSync.mockReturnValue([])

    createManualRunner({
      patterns,
      include: ['**/*.js'],
      cwd: '/my/project',
      createRunner: vi.fn()
    })

    expect(readdirSync).toHaveBeenCalledWith('/my/project', { recursive: true })
  })
})

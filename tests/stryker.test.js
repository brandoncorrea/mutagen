import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    existsSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  }
})

import {
  cleanStaleSandboxes,
  clearIncrementalCache,
  runStrykerScope,
  mergeReports,
} from '../stryker.js'
import { existsSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('cleanStaleSandboxes', () => {
  it('removes .stryker-tmp when it exists', () => {
    existsSync.mockReturnValue(true)

    cleanStaleSandboxes()

    expect(rmSync).toHaveBeenCalledWith('.stryker-tmp', { recursive: true, force: true })
  })

  it('does nothing when .stryker-tmp does not exist', () => {
    existsSync.mockReturnValue(false)

    cleanStaleSandboxes()

    expect(rmSync).not.toHaveBeenCalled()
  })
})

describe('clearIncrementalCache', () => {
  it('removes default cache file when it exists', () => {
    existsSync.mockReturnValue(true)

    clearIncrementalCache()

    expect(rmSync).toHaveBeenCalledWith('reports/stryker-incremental.json')
  })

  it('removes specified cache file', () => {
    existsSync.mockReturnValue(true)

    clearIncrementalCache('custom/cache.json')

    expect(rmSync).toHaveBeenCalledWith('custom/cache.json')
  })

  it('does nothing when cache file does not exist', () => {
    existsSync.mockReturnValue(false)

    clearIncrementalCache()

    expect(rmSync).not.toHaveBeenCalled()
  })
})

describe('runStrykerScope', () => {
  it('runs stryker with scope globs joined as --mutate arg', () => {
    existsSync.mockReturnValue(false)

    runStrykerScope('core', ['src/a.js', 'src/b.js'])

    expect(execSync).toHaveBeenCalledWith(
      "npx stryker run --mutate 'src/a.js,src/b.js'",
      { stdio: 'inherit', timeout: 600000 },
    )
  })

  it('renames output report to scoped target file', () => {
    existsSync.mockReturnValue(true)

    runStrykerScope('core', ['src/a.js'])

    expect(renameSync).toHaveBeenCalledWith(
      'reports/mutation/report.json',
      'reports/mutation/core-report.json',
    )
  })

  it('returns the scoped target file path', () => {
    existsSync.mockReturnValue(false)

    const result = runStrykerScope('core', ['src/a.js'])

    expect(result).toBe('reports/mutation/core-report.json')
  })

  it('uses custom reportDir and strykerJson paths', () => {
    existsSync.mockReturnValue(true)

    const result = runStrykerScope('core', ['src/a.js'], {
      reportDir: 'out',
      strykerJson: 'out/stryker.json',
    })

    expect(renameSync).toHaveBeenCalledWith('out/stryker.json', 'out/core-report.json')
    expect(result).toBe('out/core-report.json')
  })

  it('skips rename when output report does not exist', () => {
    existsSync.mockReturnValue(false)

    runStrykerScope('core', ['src/a.js'])

    expect(renameSync).not.toHaveBeenCalled()
  })

  it('logs error when stryker crashes with unexpected exit status', () => {
    existsSync.mockReturnValue(false)
    execSync.mockImplementation(() => {
      throw Object.assign(new Error('boom'), { status: 2 })
    })

    runStrykerScope('core', ['src/a.js'])

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Stryker core crashed'),
    )
  })

  it('logs error when stryker exits with null status', () => {
    existsSync.mockReturnValue(false)
    execSync.mockImplementation(() => {
      throw Object.assign(new Error('signal'), { status: null })
    })

    runStrykerScope('core', ['src/a.js'])

    expect(console.error).toHaveBeenCalled()
  })

  it('does not log error when stryker exits with status 1 (surviving mutants)', () => {
    existsSync.mockReturnValue(false)
    execSync.mockImplementation(() => {
      throw Object.assign(new Error('mutants survived'), { status: 1 })
    })

    runStrykerScope('core', ['src/a.js'])

    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('mergeReports', () => {
  it('combines report files, writes JSON, and returns survived count', () => {
    const report = {
      files: {
        'src/a.js': {
          mutants: [
            { status: 'Killed', mutatorName: 'x', location: { start: { line: 1 } }, replacement: 'r' },
            { status: 'Survived', mutatorName: 'y', location: { start: { line: 2 } }, replacement: 's' },
          ],
        },
      },
    }
    readFileSync.mockReturnValue(JSON.stringify(report))

    const survived = mergeReports(['scope-a.json'])

    expect(survived).toBe(1)
    expect(writeFileSync).toHaveBeenCalledWith(
      'reports/mutation/report.json',
      expect.any(String),
    )

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.files['src/a.js'].mutants).toHaveLength(2)
  })

  it('writes to custom output path', () => {
    readFileSync.mockReturnValue(JSON.stringify({ files: {} }))

    mergeReports(['a.json'], { outputPath: 'custom/out.json' })

    expect(writeFileSync.mock.calls[0][0]).toBe('custom/out.json')
  })

  it('returns 0 when all mutants are killed', () => {
    const report = {
      files: {
        'src/a.js': {
          mutants: [
            { status: 'Killed', mutatorName: 'x', location: { start: { line: 1 } }, replacement: 'r' },
          ],
        },
      },
    }
    readFileSync.mockReturnValue(JSON.stringify(report))

    expect(mergeReports(['a.json'])).toBe(0)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseArgs, withTimeout, countCachedResults, dryRun } from '../../cli/manual.js'
import { preparePatterns } from '../../core/engine.js'
import { javascript } from '../../core/patterns/javascript.js'

describe('parseArgs', () => {
  let originalArgv

  beforeEach(() => {
    originalArgv = process.argv
  })

  afterEach(() => {
    process.argv = originalArgv
  })

  it('parses a single source file', () => {
    process.argv = ['node', 'script', 'src/foo.js']
    const result = parseArgs()
    expect(result.sourceFile).toMatch(/src\/foo\.js$/)
    expect(result.jsonOutput).toBe(false)
    expect(result.dryRunMode).toBe(false)
    expect(result.targetLine).toBeNull()
    expect(result.timeout).toBeNull()
  })

  it('parses --json flag', () => {
    process.argv = ['node', 'script', 'src/foo.js', '--json']
    const result = parseArgs()
    expect(result.jsonOutput).toBe(true)
  })

  it('parses --dry-run flag', () => {
    process.argv = ['node', 'script', 'src/foo.js', '--dry-run']
    const result = parseArgs()
    expect(result.dryRunMode).toBe(true)
  })

  it('parses --line N', () => {
    process.argv = ['node', 'script', 'src/foo.js', '--line', '42']
    const result = parseArgs()
    expect(result.targetLine).toBe(42)
  })

  it('parses --timeout N', () => {
    process.argv = ['node', 'script', 'src/foo.js', '--timeout', '5000']
    const result = parseArgs()
    expect(result.timeout).toBe(5000)
  })

  it('parses --all mode', () => {
    process.argv = ['node', 'script', '--all']
    const result = parseArgs()
    expect(result.allMode).toBe(true)
    expect(result.jsonOutput).toBe(false)
    expect(result.dryRunMode).toBe(false)
  })

  it('parses --all with --json and --dry-run', () => {
    process.argv = ['node', 'script', '--all', '--json', '--dry-run']
    const result = parseArgs()
    expect(result.allMode).toBe(true)
    expect(result.jsonOutput).toBe(true)
    expect(result.dryRunMode).toBe(true)
  })

  it('parses --all with --timeout', () => {
    process.argv = ['node', 'script', '--all', '--timeout', '3000']
    const result = parseArgs()
    expect(result.allMode).toBe(true)
    expect(result.timeout).toBe(3000)
  })

  it('parses --incremental mode', () => {
    process.argv = ['node', 'script', '--incremental']
    const result = parseArgs()
    expect(result.incrementalMode).toBe(true)
    expect(result.jsonOutput).toBe(false)
  })

  it('parses --incremental with --json and --timeout', () => {
    process.argv = ['node', 'script', '--incremental', '--json', '--timeout', '2000']
    const result = parseArgs()
    expect(result.incrementalMode).toBe(true)
    expect(result.jsonOutput).toBe(true)
    expect(result.timeout).toBe(2000)
  })

  it('parses --diff mode with before and after files', () => {
    process.argv = ['node', 'script', '--diff', 'before.json', 'after.json']
    const result = parseArgs()
    expect(result.diffMode).toBe(true)
    expect(result.beforeFile).toMatch(/before\.json$/)
    expect(result.afterFile).toMatch(/after\.json$/)
  })

  it('exits with code 1 when --diff lacks files', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.argv = ['node', 'script', '--diff']
    expect(() => parseArgs()).toThrow('exit')
    expect(mockExit).toHaveBeenCalledWith(1)
    mockExit.mockRestore()
    console.error.mockRestore()
  })

  it('exits with code 1 when no source file given', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.argv = ['node', 'script']
    expect(() => parseArgs()).toThrow('exit')
    expect(mockExit).toHaveBeenCalledWith(1)
    mockExit.mockRestore()
    console.error.mockRestore()
  })

  it('combines multiple flags on a single source', () => {
    process.argv = ['node', 'script', 'src/foo.js', '--json', '--dry-run', '--line', '10', '--timeout', '1000']
    const result = parseArgs()
    expect(result.sourceFile).toMatch(/src\/foo\.js$/)
    expect(result.jsonOutput).toBe(true)
    expect(result.dryRunMode).toBe(true)
    expect(result.targetLine).toBe(10)
    expect(result.timeout).toBe(1000)
  })
})

describe('withTimeout', () => {
  it('calls fn directly when ms is falsy', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    const result = await withTimeout(fn, null)
    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('calls fn directly when ms is 0', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withTimeout(fn, 0)
    expect(result).toBe('ok')
  })

  it('resolves with fn result when fn completes before timeout', async () => {
    const fn = () => Promise.resolve('fast')
    const result = await withTimeout(fn, 5000)
    expect(result).toBe('fast')
  })

  it('rejects with timeout error when fn takes too long', async () => {
    const fn = () => new Promise((resolve) => setTimeout(resolve, 10000))
    await expect(withTimeout(fn, 10)).rejects.toThrow('Mutation timed out after 10ms')
  })

  it('includes timeout duration in error message', async () => {
    const fn = () => new Promise((resolve) => setTimeout(resolve, 10000))
    await expect(withTimeout(fn, 50)).rejects.toThrow('50ms')
  })
})

describe('countCachedResults', () => {
  it('returns zeros when report is null', () => {
    expect(countCachedResults(null, ['a.js'])).toEqual({ killed: 0, survived: 0 })
  })

  it('returns zeros for empty relPaths', () => {
    const report = { files: { 'a.js': { mutants: [{ status: 'Killed' }] } } }
    expect(countCachedResults(report, [])).toEqual({ killed: 0, survived: 0 })
  })

  it('counts Killed mutants', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Killed' }] },
      },
    }
    expect(countCachedResults(report, ['a.js'])).toEqual({ killed: 2, survived: 0 })
  })

  it('counts Survived mutants', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Survived' }] },
      },
    }
    expect(countCachedResults(report, ['a.js'])).toEqual({ killed: 0, survived: 1 })
  })

  it('counts Timeout as killed', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Timeout' }] },
      },
    }
    expect(countCachedResults(report, ['a.js'])).toEqual({ killed: 1, survived: 0 })
  })

  it('aggregates across multiple files', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] },
        'b.js': { mutants: [{ status: 'Timeout' }, { status: 'Killed' }] },
      },
    }
    expect(countCachedResults(report, ['a.js', 'b.js'])).toEqual({ killed: 3, survived: 1 })
  })

  it('ignores files not in relPaths', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }] },
        'b.js': { mutants: [{ status: 'Survived' }] },
      },
    }
    expect(countCachedResults(report, ['a.js'])).toEqual({ killed: 1, survived: 0 })
  })

  it('skips relPaths not found in report', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }] },
      },
    }
    expect(countCachedResults(report, ['a.js', 'missing.js'])).toEqual({ killed: 1, survived: 0 })
  })

  it('ignores unknown statuses', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'NoCoverage' }, { status: 'Killed' }] },
      },
    }
    expect(countCachedResults(report, ['a.js'])).toEqual({ killed: 1, survived: 0 })
  })
})

describe('dryRun', () => {
  const prepared = preparePatterns(javascript)
  let tmpDir, tmpFile

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mutagen-test-'))
    tmpFile = join(tmpDir, 'test-source.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    try { unlinkSync(tmpFile) } catch {}
    try { rmdirSync(tmpDir) } catch {}
    console.log.mockRestore()
  })

  it('returns the mutation count', () => {
    writeFileSync(tmpFile, 'const x = a + b;\n')
    const count = dryRun(tmpFile, prepared, null)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  it('filters by target line', () => {
    writeFileSync(tmpFile, 'const x = 1;\nconst y = a + b;\nconst z = 1;\n')
    const allCount = dryRun(tmpFile, prepared, null)
    const lineCount = dryRun(tmpFile, prepared, 2)
    expect(lineCount).toBeLessThanOrEqual(allCount)
    expect(lineCount).toBeGreaterThanOrEqual(1)
  })

  it('prints mutation info to console', () => {
    const logs = []
    console.log.mockRestore()
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')))

    writeFileSync(tmpFile, 'const x = a + b;\n')
    dryRun(tmpFile, prepared, null)
    const output = logs.join('\n')
    expect(output).toContain('DRY RUN')
    expect(output).toContain('mutation')
    expect(output).toContain('Total:')
  })

  it('returns 0 for source with no mutable code', () => {
    writeFileSync(tmpFile, '// just a comment\n')
    const count = dryRun(tmpFile, prepared, null)
    expect(count).toBe(0)
  })
})

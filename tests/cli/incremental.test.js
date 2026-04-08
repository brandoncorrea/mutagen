import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { loadPreviousReport, countCachedResults } from '../../cli/incremental.js'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() }
})

describe('loadPreviousReport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    console.warn.mockRestore()
    vi.restoreAllMocks()
  })

  it('returns defaults when report file does not exist', () => {
    existsSync.mockReturnValue(false)

    const result = loadPreviousReport('/tmp/report.json')

    expect(result.previousReport).toBeNull()
    expect(result.previousHashes).toEqual({})
    expect(result.previousTestHashes).toEqual({})
  })

  it('parses a valid report file', () => {
    const report = {
      files: {},
      sourceHashes: { 'a.js': 'abc123' },
      testHashes: { 'a.test.js': 'def456' }
    }
    existsSync.mockReturnValue(true)
    readFileSync.mockReturnValue(JSON.stringify(report))

    const result = loadPreviousReport('/tmp/report.json')

    expect(result.previousReport).toEqual(report)
    expect(result.previousHashes).toEqual({ 'a.js': 'abc123' })
    expect(result.previousTestHashes).toEqual({ 'a.test.js': 'def456' })
  })

  it('warns when report file contains corrupt JSON', () => {
    existsSync.mockReturnValue(true)
    readFileSync.mockReturnValue('not valid json {{{')

    const result = loadPreviousReport('/tmp/report.json')

    expect(result.previousReport).toBeNull()
    expect(result.previousHashes).toEqual({})
    expect(result.previousTestHashes).toEqual({})
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('report.json')
    )
  })
})

describe('countCachedResults', () => {
  it('returns zeros when report is null', () => {
    const result = countCachedResults(null, ['a.js'])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })

  it('returns zeros when no relPaths match report files', () => {
    const report = {
      files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
    }
    const result = countCachedResults(report, ['b.js'])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })

  it('counts Killed mutants', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Killed' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(2)
    expect(result.survived).toBe(0)
  })

  it('counts Survived mutants', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Survived' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.survived).toBe(1)
    expect(result.killed).toBe(0)
  })

  it('counts Timeout mutants as killed', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Timeout' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(1)
  })

  it('aggregates counts across multiple files', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }] },
        'b.js': { mutants: [{ status: 'Survived' }, { status: 'Killed' }] }
      }
    }
    const result = countCachedResults(report, ['a.js', 'b.js'])
    expect(result.killed).toBe(2)
    expect(result.survived).toBe(1)
  })

  it('ignores mutants with unrecognized status', () => {
    const report = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Unknown' }] }
      }
    }
    const result = countCachedResults(report, ['a.js'])
    expect(result.killed).toBe(1)
    expect(result.survived).toBe(0)
  })

  it('returns zeros when relPaths is empty', () => {
    const report = {
      files: { 'a.js': { mutants: [{ status: 'Killed' }] } }
    }
    const result = countCachedResults(report, [])
    expect(result).toEqual({ killed: 0, survived: 0 })
  })
})

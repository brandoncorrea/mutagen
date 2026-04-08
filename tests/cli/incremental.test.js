import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { loadPreviousReport } from '../../cli/incremental.js'

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

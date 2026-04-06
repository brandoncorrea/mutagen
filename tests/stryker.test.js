import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { isUnexpectedError, mergeReports } from '../stryker.js'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
  }
})

describe('isUnexpectedError', () => {
  it('returns true when status is null', () => {
    expect(isUnexpectedError({ status: null })).toBe(true)
  })

  it('returns true when status is undefined', () => {
    expect(isUnexpectedError({})).toBe(true)
  })

  it('returns true when status > 1', () => {
    expect(isUnexpectedError({ status: 2 })).toBe(true)
  })

  it('returns false when status is 0', () => {
    expect(isUnexpectedError({ status: 0 })).toBe(false)
  })

  it('returns false when status is 1', () => {
    expect(isUnexpectedError({ status: 1 })).toBe(false)
  })
})

describe('mergeReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('writes combined report JSON and returns survived count', () => {
    const report = {
      files: {
        'src/a.js': {
          mutants: [
            { status: 'Killed', mutatorName: '=== → !==', location: { start: { line: 1 } }, replacement: 'r' },
            { status: 'Survived', mutatorName: '+ → -', location: { start: { line: 2 } }, replacement: 's' },
          ],
        },
      },
    }
    readFileSync.mockReturnValue(JSON.stringify(report))

    const survived = mergeReports(['report-a.json'])

    expect(survived).toBe(1)
    expect(writeFileSync).toHaveBeenCalledOnce()

    const [path, content] = writeFileSync.mock.calls[0]
    expect(path).toBe('reports/mutation/report.json')

    const written = JSON.parse(content)
    expect(written.files['src/a.js'].mutants).toHaveLength(2)
  })

  it('uses custom outputPath when provided', () => {
    readFileSync.mockReturnValue(JSON.stringify({ files: {} }))

    mergeReports(['r.json'], { outputPath: 'custom/out.json' })

    expect(writeFileSync).toHaveBeenCalledWith('custom/out.json', expect.any(String))
  })

  it('deduplicates mutants across multiple report files', () => {
    const report = {
      files: {
        'src/a.js': {
          mutants: [
            { status: 'Killed', mutatorName: 'test', location: { start: { line: 1 } }, replacement: 'r' },
          ],
        },
      },
    }
    readFileSync.mockReturnValue(JSON.stringify(report))

    mergeReports(['a.json', 'b.json'])

    const [, content] = writeFileSync.mock.calls[0]
    const written = JSON.parse(content)
    expect(written.files['src/a.js'].mutants).toHaveLength(1)
  })

  it('returns 0 when no mutants survived', () => {
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

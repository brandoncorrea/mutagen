import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mutantKey, countStatuses, toJsonMutants, printRunReport, printSummary } from '../../cli/report.js'

describe('mutantKey', () => {
  it('builds a key from path, line, mutator name, and replacement', () => {
    const m = {
      location: { start: { line: 10 } },
      mutatorName: '=== → !==',
      replacement: ' !== '
    }
    expect(mutantKey('src/foo.js', m)).toBe('src/foo.js:10:=== → !==: !== ')
  })

  it('defaults to line 0 when location is missing', () => {
    const m = { mutatorName: 'test', replacement: 'r' }
    expect(mutantKey('file.js', m)).toBe('file.js:0:test:r')
  })

  it('handles missing mutatorName and replacement', () => {
    const m = { location: { start: { line: 5 } } }
    expect(mutantKey('file.js', m)).toBe('file.js:5::')
  })
})

describe('countStatuses', () => {
  it('counts each status type across files', () => {
    const report = {
      files: {
        'a.js': {
          mutants: [
            { status: 'Killed' },
            { status: 'Survived' }
          ]
        },
        'b.js': {
          mutants: [
            { status: 'NoCoverage' },
            { status: 'Timeout' },
            { status: 'Killed' }
          ]
        }
      }
    }
    expect(countStatuses(report)).toEqual({
      killed: 2,
      survived: 1,
      noCoverage: 1,
      timeout: 1
    })
  })

  it('returns zeros when no mutants exist', () => {
    const report = { files: {} }
    expect(countStatuses(report)).toEqual({
      killed: 0,
      survived: 0,
      noCoverage: 0,
      timeout: 0
    })
  })
})

describe('toJsonMutants', () => {
  it('converts killed and survived results to Stryker-compatible format', () => {
    const results = {
      killed: [
        {
          line: 5,
          name: '=== → !==',
          original: 'a === b',
          mutated: 'a !== b',
          killedBy: ['/tests/a.test.js']
        }
      ],
      survived: [
        {
          line: 10,
          name: '+ → -',
          original: 'a + b',
          mutated: 'a - b'
        }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants).toHaveLength(2)

    const killed = output.mutants.find(m => m.status === 'Killed')
    expect(killed.mutatorName).toBe('=== → !==')
    expect(killed.location.start.line).toBe(5)
    expect(killed.killedBy).toEqual(['/tests/a.test.js'])

    const survived = output.mutants.find(m => m.status === 'Survived')
    expect(survived.mutatorName).toBe('+ → -')
    expect(survived.killedBy).toBeUndefined()
  })

  it('produces a relative path', () => {
    const output = toJsonMutants(process.cwd() + '/src/foo.js', { killed: [], survived: [] })
    expect(output.path).toBe('src/foo.js')
  })
})

describe('printSummary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    console.log.mockRestore()
  })

  it('prints file count, statuses, and mutation score', () => {
    const merged = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] },
        'b.js': { mutants: [{ status: 'Killed' }] }
      }
    }
    const counts = { killed: 2, survived: 1, noCoverage: 0, timeout: 0 }

    printSummary(merged, counts, '/tmp/report.json')

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('Files:    2')
    expect(output).toContain('Killed:   2')
    expect(output).toContain('Survived: 1')
    expect(output).toContain('66.7%')
    expect(output).toContain('/tmp/report.json')
  })

  it('shows 100.0% when no mutants', () => {
    const counts = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 }
    printSummary({ files: {} }, counts, null)
    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('100.0%')
    expect(output).not.toContain('Report:')
  })

  it('includes timeout in score calculation', () => {
    const merged = {
      files: { 'a.js': { mutants: [{ status: 'Timeout' }, { status: 'Survived' }] } }
    }
    const counts = { killed: 0, survived: 1, noCoverage: 0, timeout: 1 }

    printSummary(merged, counts, null)

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('50.0%')
  })
})

describe('printRunReport', () => {
  it('prints mutation score for all-killed results', () => {
    const lines = []
    const log = msg => lines.push(msg)
    const mutations = [{ line: 1, name: 'test' }]
    const results = { killed: [{ line: 1, name: 'test' }], survived: [] }

    printRunReport(mutations, results, log)

    const output = lines.join('\n')
    expect(output).toContain('100.0%')
    expect(output).toContain('ALL mutations killed')
  })

  it('prints surviving mutations when some survive', () => {
    const lines = []
    const log = msg => lines.push(msg)
    const mutations = [
      { line: 1, name: 'a' },
      { line: 2, name: 'b' }
    ]
    const results = {
      killed: [{ line: 1, name: 'a' }],
      survived: [{ line: 2, name: 'b', original: 'x + y', mutated: 'x - y' }]
    }

    printRunReport(mutations, results, log)

    const output = lines.join('\n')
    expect(output).toContain('50.0%')
    expect(output).toContain('SURVIVING MUTATIONS')
    expect(output).toContain('x + y')
    expect(output).toContain('x - y')
  })

  it('reports 100% for zero mutations', () => {
    const lines = []
    const log = msg => lines.push(msg)
    printRunReport([], { killed: [], survived: [] }, log)
    expect(lines.join('\n')).toContain('100.0%')
  })
})

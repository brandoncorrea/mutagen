import { describe, it, expect, vi } from 'vitest'
import { printRunReport, printSummary } from '../../cli/report.js'

describe('printSummary', () => {
  it('prints file count, statuses, and mutation score', () => {
    const lines = []
    const out = msg => lines.push(msg)
    const merged = {
      files: {
        'a.js': { mutants: [{ status: 'Killed' }, { status: 'Survived' }] },
        'b.js': { mutants: [{ status: 'Killed' }] }
      }
    }
    const counts = { killed: 2, survived: 1, noCoverage: 0, timeout: 0 }

    printSummary(merged, counts, '/tmp/report.json', out)

    const output = lines.join('\n')
    expect(output).toContain('Files:    2')
    expect(output).toContain('Killed:   2')
    expect(output).toContain('Survived: 1')
    expect(output).toContain('66.7%')
    expect(output).toContain('/tmp/report.json')
  })

  it('shows 100.0% when no mutants', () => {
    const lines = []
    const out = msg => lines.push(msg)
    const counts = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 }
    printSummary({ files: {} }, counts, null, out)
    const output = lines.join('\n')
    expect(output).toContain('100.0%')
    expect(output).not.toContain('Report:')
  })

  it('includes timeout in score calculation', () => {
    const lines = []
    const out = msg => lines.push(msg)
    const merged = {
      files: { 'a.js': { mutants: [{ status: 'Timeout' }, { status: 'Survived' }] } }
    }
    const counts = { killed: 0, survived: 1, noCoverage: 0, timeout: 1 }

    printSummary(merged, counts, null, out)

    const output = lines.join('\n')
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

  it('counts timed-out mutations as killed in score', () => {
    const lines = []
    const log = msg => lines.push(msg)
    const mutations = [
      { line: 1, name: 'a' },
      { line: 2, name: 'b' }
    ]
    const results = {
      killed: [],
      survived: [],
      timedOut: [
        { line: 1, name: 'a' },
        { line: 2, name: 'b' }
      ]
    }

    printRunReport(mutations, results, log)

    const output = lines.join('\n')
    expect(output).toContain('100.0%')
    expect(output).toContain('Killed: 2')
    expect(output).toContain('ALL mutations killed')
  })

  it('defaults to console.log when no log function provided', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const mutations = [{ line: 1, name: 'test' }]
    const results = { killed: [{ line: 1, name: 'test' }], survived: [] }

    printRunReport(mutations, results)

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('100.0%')
    console.log.mockRestore()
  })
})

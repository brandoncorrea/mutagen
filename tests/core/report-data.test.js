import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
})

import { mutantKey, mutationId, assignMutationIds } from '../../src/core/mutation-id.js'
import { calculateScore } from '../../src/core/mutation-status.js'
import {
  toJsonMutants, tryLoadJson,
  writeStructuredReportFile, buildStructuredReport
} from '../../src/core/report-data.js'

describe('mutationId', () => {
  it('returns first 8 hex chars of SHA-256 of file:line:name', () => {
    const id = mutationId('src/foo.js', 10, '=== → !==')
    expect(id).toMatch(/^[0-9a-f]{8}$/)
    expect(id).toHaveLength(8)
  })

  it('is deterministic — same inputs produce same output', () => {
    const a = mutationId('src/foo.js', 10, '=== → !==')
    const b = mutationId('src/foo.js', 10, '=== → !==')
    expect(a).toBe(b)
  })

  it('differs for different file paths', () => {
    const a = mutationId('src/foo.js', 10, '=== → !==')
    const b = mutationId('src/bar.js', 10, '=== → !==')
    expect(a).not.toBe(b)
  })

  it('differs for different line numbers', () => {
    const a = mutationId('src/foo.js', 10, '=== → !==')
    const b = mutationId('src/foo.js', 11, '=== → !==')
    expect(a).not.toBe(b)
  })

  it('differs for different mutation names', () => {
    const a = mutationId('src/foo.js', 10, '=== → !==')
    const b = mutationId('src/foo.js', 10, '+ → -')
    expect(a).not.toBe(b)
  })
})

describe('assignMutationIds', () => {
  it('adds id field to each mutation based on file, line, and name', () => {
    const mutations = [
      { line: 5, name: '=== → !==', original: 'a', mutated: 'b' },
      { line: 10, name: '+ → -', original: 'c', mutated: 'd' }
    ]
    assignMutationIds(mutations, 'src/foo.js')

    expect(mutations[0].id).toBe(mutationId('src/foo.js', 5, '=== → !=='))
    expect(mutations[1].id).toBe(mutationId('src/foo.js', 10, '+ → -'))
  })

  it('returns the mutations array for chaining', () => {
    const mutations = [{ line: 1, name: 'x' }]
    const result = assignMutationIds(mutations, 'file.js')
    expect(result).toBe(mutations)
  })
})

describe('mutantKey', () => {
  it('builds a key from path, line, mutator name, and replacement', () => {
    const m = {
      line: 10,
      name: '=== → !==',
      replacement: ' !== '
    }
    expect(mutantKey('src/foo.js', m)).toBe('src/foo.js:10:=== → !==: !== ')
  })

  it('defaults to line 0 when location is missing', () => {
    const m = { name: 'test', replacement: 'r' }
    expect(mutantKey('file.js', m)).toBe('file.js:0:test:r')
  })

  it('handles missing mutatorName and replacement', () => {
    const m = { line: 5 }
    expect(mutantKey('file.js', m)).toBe('file.js:5::')
  })

  it('defaults to line 0 when location.start is null (optional chaining boundary)', () => {
    // location exists but start is null — location?.start?.line safely returns undefined
    // Without optional chaining on start (location?.start.line), this would throw TypeError
    const m = { location: { start: null }, name: 'x', replacement: 'y' }
    expect(mutantKey('file.js', m)).toBe('file.js:0:x:y')
  })
})

describe('calculateScore', () => {
  it('computes killed / total * 100', () => {
    expect(calculateScore(4, 5)).toBeCloseTo(80.0)
  })

  it('returns 100 when total is zero', () => {
    expect(calculateScore(0, 0)).toBe(100)
  })
})

describe('toJsonMutants', () => {
  it('converts killed and survived results to mutant format', () => {
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

    const killed = output.mutants.find(mutant => mutant.status === 'Killed')
    expect(killed.name).toBe('=== → !==')
    expect(killed.line).toBe(5)
    expect(killed.killedBy).toEqual(['/tests/a.test.js'])

    const survived = output.mutants.find(mutant => mutant.status === 'Survived')
    expect(survived.name).toBe('+ → -')
    expect(survived.killedBy).toBeUndefined()
  })

  it('uses deterministic hash-based ID from mutationId', () => {
    const results = {
      killed: [{ line: 5, name: '=== → !==', original: 'a', mutated: 'b', killedBy: ['t.js'] }],
      survived: []
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    const relPath = output.path
    const expectedId = mutationId(relPath, 5, '=== → !==')
    expect(output.mutants[0].id).toBe(expectedId)
    expect(output.mutants[0].id).toMatch(/^[0-9a-f]{8}$/)
  })

  it('excludes killedBy when it is an empty array', () => {
    const results = {
      killed: [{ line: 3, name: 'x', original: 'a', mutated: 'b', killedBy: [] }],
      survived: []
    }
    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants[0]).not.toHaveProperty('killedBy')
  })

  it('includes timedOut mutations as Timeout status', () => {
    const results = {
      killed: [],
      survived: [],
      timedOut: [
        { line: 3, name: '&& → ||', original: 'a && b', mutated: 'a || b' }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants).toHaveLength(1)
    expect(output.mutants[0].status).toBe('Timeout')
    expect(output.mutants[0].name).toBe('&& → ||')
  })

  it('includes coveredBy on survived mutations when present', () => {
    const results = {
      killed: [],
      survived: [
        {
          line: 10,
          name: '+ → -',
          original: 'a + b',
          mutated: 'a - b',
          coveredBy: ['tests/math.test.js']
        }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    const survived = output.mutants[0]
    expect(survived.coveredBy).toEqual(['tests/math.test.js'])
  })

  it('excludes coveredBy when it is an empty array', () => {
    const results = {
      killed: [],
      survived: [
        { line: 10, name: 'x', original: 'a', mutated: 'b', coveredBy: [] }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants[0]).not.toHaveProperty('coveredBy')
  })

  it('excludes coveredBy when not present on mutation', () => {
    const results = {
      killed: [],
      survived: [
        { line: 10, name: 'x', original: 'a', mutated: 'b' }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results)
    expect(output.mutants[0]).not.toHaveProperty('coveredBy')
  })

  it('produces a relative path', () => {
    const output = toJsonMutants(process.cwd() + '/src/foo.js', { killed: [], survived: [] })
    expect(output.path).toBe('src/foo.js')
  })

  it('includes only survived mutants when survivorsOnly is true', () => {
    const results = {
      killed: [
        { line: 5, name: '=== → !==', original: 'a === b', mutated: 'a !== b', killedBy: ['t.js'] }
      ],
      survived: [
        { line: 10, name: '+ → -', original: 'a + b', mutated: 'a - b' }
      ],
      timedOut: [
        { line: 15, name: '&& → ||', original: 'a && b', mutated: 'a || b' }
      ]
    }

    const output = toJsonMutants('/project/src/foo.js', results, { survivorsOnly: true })
    expect(output.mutants).toHaveLength(1)
    expect(output.mutants[0].status).toBe('Survived')
    expect(output.mutants[0].name).toBe('+ → -')
  })

  it('includes all mutants when survivorsOnly is false', () => {
    const results = {
      killed: [{ line: 5, name: 'x', original: 'a', mutated: 'b', killedBy: ['t.js'] }],
      survived: [{ line: 10, name: 'y', original: 'c', mutated: 'd' }],
      timedOut: [{ line: 15, name: 'z', original: 'e', mutated: 'f' }]
    }

    const output = toJsonMutants('/project/src/foo.js', results, { survivorsOnly: false })
    expect(output.mutants).toHaveLength(3)
  })
})


describe('tryLoadJson', () => {
  afterEach(() => {
    readFileSync.mockReset()
  })

  it('parses valid JSON from a file', () => {
    const data = { files: {}, schemaVersion: '1' }
    readFileSync.mockReturnValue(JSON.stringify(data))

    const result = tryLoadJson('/tmp/report.json')

    expect(result).toEqual(data)
  })

  it('returns undefined and calls out on read error', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const out = { log: vi.fn(), error: vi.fn() }

    const result = tryLoadJson('/tmp/missing.json', out)

    expect(result).toBeUndefined()
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('Warning'))
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('missing.json'))
  })

  it('returns undefined and calls out on invalid JSON', () => {
    readFileSync.mockReturnValue('not valid json {{{')
    const out = { log: vi.fn(), error: vi.fn() }

    const result = tryLoadJson('/tmp/bad.json', out)

    expect(result).toBeUndefined()
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('Warning'))
  })

  it('returns undefined silently when no out callback provided', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT') })

    const result = tryLoadJson('/tmp/missing.json')

    expect(result).toBeUndefined()
  })
})


describe('buildStructuredReport', () => {
  it('returns report and stats from file results', () => {
    const { report, stats } = buildStructuredReport({
      'a.js': { mutants: [{ status: 'Killed', name: 'x', original: 'a', mutated: 'b' }] }
    })

    expect(stats.killed).toBe(1)
    expect(stats.survived).toBe(0)
    expect(stats.total).toBe(1)
    expect(report.killed).toBe(1)
    expect(report.files['a.js'].killed).toBe(1)
  })

  it('computes score as percentage of killed over total', () => {
    const { report, stats } = buildStructuredReport({
      'a.js': { mutants: [
        { status: 'Killed', name: 'x' },
        { status: 'Survived', name: 'y' }
      ]}
    })

    expect(stats.score).toBe(50)
    expect(report.score).toBe(50)
    expect(stats.total).toBe(2)
  })

  it('rounds score without floating-point artifacts', () => {
    // 6 killed out of 7 = 85.714...% → should round to 85.7
    const mutants = [
      ...Array.from({ length: 6 }, () => ({ status: 'Killed', name: 'x' })),
      { status: 'Survived', name: 'y' }
    ]
    const { stats } = buildStructuredReport({ 'a.js': { mutants } })
    expect(stats.score).toBe(85.7)
    expect(stats.score.toString()).not.toMatch(/\d{4,}/)
  })

  it('defaults score to 100% when no mutants exist', () => {
    const { report, stats } = buildStructuredReport({})

    expect(stats.score).toBe(100)
    expect(report.score).toBe(100)
  })

  it('includes deltas when provided', () => {
    const deltas = { fixes: [], regressions: [] }
    const { report } = buildStructuredReport({}, deltas)

    expect(report.deltas).toEqual(deltas)
  })

  it('omits deltas when not provided', () => {
    const { report } = buildStructuredReport({})

    expect(report).not.toHaveProperty('deltas')
  })

  it('collects survivors with stable mutation IDs', () => {
    const { report } = buildStructuredReport({
      'a.js': { mutants: [{ status: 'Survived', name: 'x', line: 5 }] }
    })

    expect(report.survivors).toHaveLength(1)
    expect(report.survivors[0].id).toBe(mutationId('a.js', 5, 'x'))
  })

  it('counts timeout mutants as killed and tracks timedOut separately', () => {
    const { stats } = buildStructuredReport({
      'a.js': { mutants: [{ status: 'Timeout', name: 'x' }] }
    })

    expect(stats.killed).toBe(1)
    expect(stats.timedOut).toBe(1)
  })

  it('per-file score defaults to 100% when mutants array is empty', () => {
    const { report } = buildStructuredReport({
      'a.js': { mutants: [] }
    })

    expect(report.files['a.js'].score).toBe(100)
  })

  it('handles file entries without mutants arrays (old structured format)', () => {
    const { report, stats } = buildStructuredReport({
      'a.js': { score: 66.7, killed: 2, total: 3 },
      'b.js': { mutants: [{ status: 'Killed', name: 'x' }] }
    })

    expect(stats.killed).toBe(3)
    expect(report.files['a.js']).toEqual({ score: 66.7, killed: 2, total: 3 })
    expect(report.files['b.js'].killed).toBe(1)
    expect(report.files['b.js'].mutants).toBeDefined()
    // Summary-only entry should NOT have mutants key
    expect(report.files['a.js']).not.toHaveProperty('mutants')
  })

  it('defaults missing summary stats to zero/100 for entries without mutants', () => {
    const { report, stats } = buildStructuredReport({
      'a.js': {}
    })

    expect(stats.killed).toBe(0)
    expect(report.files['a.js']).toEqual({ score: 100, killed: 0, total: 0 })
  })

  it('is pure — does not perform I/O', () => {
    vi.clearAllMocks()
    buildStructuredReport({ 'a.js': { mutants: [{ status: 'Killed', name: 'x' }] } })

    expect(writeFileSync).not.toHaveBeenCalled()
    expect(mkdirSync).not.toHaveBeenCalled()
  })
})

describe('writeStructuredReportFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('counts killed mutants and writes report', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Killed', name: 'x', original: 'a', mutated: 'b' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.killed).toBe(1)
    expect(written.survived).toBe(0)
  })

  it('counts survived mutants and includes them in survivors', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', name: 'x', original: 'a', mutated: 'b' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survived).toBe(1)
    expect(written.survivors).toHaveLength(1)
  })

  it('includes stable mutation ID in each survivor', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', name: 'x', line: 5 }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].id).toBe(mutationId('a.js', 5, 'x'))
    expect(written.survivors[0].id).toMatch(/^[0-9a-f]{8}$/)
  })

  it('counts timeout mutants as killed', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Timeout', name: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.killed).toBe(1)
    expect(written.timedOut).toBe(1)
  })

  it('handles survived mutants without coveredBy', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', name: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0]).not.toHaveProperty('coveredBy')
  })

  it('includes coveredBy when present on survived mutants', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', name: 'x', coveredBy: ['t.js'] }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].coveredBy).toEqual(['t.js'])
  })

  it('handles mutants without original/mutated fields', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', name: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].original).toBeUndefined()
    expect(written.survivors[0].mutated).toBeUndefined()
  })

  it('defaults score to 100% when no mutants exist', () => {
    writeStructuredReportFile('out.json', {})

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.score).toBe(100)
  })

  it('includes deltas when provided', () => {
    const deltas = { fixes: [], regressions: [] }
    writeStructuredReportFile('out.json', {}, deltas)

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.deltas).toEqual(deltas)
  })

  it('omits deltas when not provided', () => {
    writeStructuredReportFile('out.json', {})

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written).not.toHaveProperty('deltas')
  })

  it('includes extra fields in written report when provided', () => {
    const extra = {
      sourceHashes: { 'a.js': 'abc123' },
      testHashes: { 't.js': 'def456' }
    }
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Killed', name: 'x' }] }
    }, undefined, extra)

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.sourceHashes).toEqual({ 'a.js': 'abc123' })
    expect(written.testHashes).toEqual({ 't.js': 'def456' })
    expect(written.killed).toBe(1)
  })

  it('omits extra fields when not provided', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Killed', name: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written).not.toHaveProperty('sourceHashes')
    expect(written).not.toHaveProperty('testHashes')
  })

  it('handles mutants without location', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'Survived', name: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.survivors[0].line).toBe(0)
  })

  it('skips mutants with unrecognized status (neither killed nor alive)', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [{ status: 'CompileError', name: 'x' }] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.killed).toBe(0)
    expect(written.survived).toBe(0)
    expect(written.survivors).toHaveLength(0)
  })

  it('defaults file score to 100% when mutants array is empty', () => {
    writeStructuredReportFile('out.json', {
      'a.js': { mutants: [] }
    })

    const written = JSON.parse(writeFileSync.mock.calls[0][1])
    expect(written.files['a.js'].score).toBe(100)
  })
})

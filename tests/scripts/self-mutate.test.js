import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn()
}))

import {
  parseArgs, runTests, runMutation, isCommentOnlyLine,
  loadMutations, toResult, previewMutations, executeMutations,
  printSummary, printSurvivors, printPerFileScores, printTextReport,
  main, TARGET_MODULES, ROOT, TIMEOUT_MS
} from '../../scripts/self-mutate.js'

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

// --- parseArgs ---

describe('parseArgs', () => {
  it('defaults to all target modules with no flags', () => {
    const result = parseArgs(['node', 'self-mutate.js'])
    expect(result).toEqual({ dryRun: false, json: false, targets: TARGET_MODULES })
  })

  it('sets dryRun when --dry-run is present', () => {
    const result = parseArgs(['node', 'self-mutate.js', '--dry-run'])
    expect(result.dryRun).toBe(true)
  })

  it('sets json when --json is present', () => {
    const result = parseArgs(['node', 'self-mutate.js', '--json'])
    expect(result.json).toBe(true)
  })

  it('sets both flags together', () => {
    const result = parseArgs(['node', 'self-mutate.js', '--dry-run', '--json'])
    expect(result.dryRun).toBe(true)
    expect(result.json).toBe(true)
  })

  it('filters targets to only valid modules', () => {
    const result = parseArgs(['node', 'self-mutate.js', 'core/engine.js', 'nope.js'])
    expect(result.targets).toEqual(['core/engine.js'])
  })

  it('returns empty targets when all file args are invalid', () => {
    const result = parseArgs(['node', 'self-mutate.js', 'nope.js'])
    expect(result.targets).toEqual([])
  })

  it('ignores flags when filtering file args', () => {
    const result = parseArgs(['node', 'self-mutate.js', '--dry-run', 'cli/args.js'])
    expect(result.targets).toEqual(['cli/args.js'])
    expect(result.dryRun).toBe(true)
  })
})

// --- isCommentOnlyLine ---

describe('isCommentOnlyLine', () => {
  it('detects lines starting with *', () =>
    expect(isCommentOnlyLine('  * JSDoc continuation')).toBe(true))

  it('detects lines starting with //', () =>
    expect(isCommentOnlyLine('  // single-line comment')).toBe(true))

  it('detects lines starting with /*', () =>
    expect(isCommentOnlyLine('  /* block open')).toBe(true))

  it('detects lines that are exactly */', () =>
    expect(isCommentOnlyLine('  */')).toBe(true))

  it('rejects code lines', () =>
    expect(isCommentOnlyLine('  const x = 1')).toBe(false))

  it('rejects lines with embedded comment tokens', () =>
    expect(isCommentOnlyLine('  x = a /* inline */ + b')).toBe(false))
})

// --- toResult ---

describe('toResult', () => {
  it('maps mutation fields to a result object', () => {
    const mutation = { line: 5, name: 'boolFlip', original: 'true', mutated: 'false' }
    expect(toResult('a.js', mutation, 'Killed')).toEqual({
      file: 'a.js', line: 5, name: 'boolFlip',
      original: 'true', mutated: 'false', status: 'Killed'
    })
  })
})

// --- runTests ---

describe('runTests', () => {
  it('returns passed when execFileSync succeeds', () => {
    execFileSync.mockReturnValue(undefined)
    expect(runTests()).toEqual({ passed: true })
  })

  it('returns timedOut when process was killed', () => {
    execFileSync.mockImplementation(() => { throw { killed: true } })
    expect(runTests()).toEqual({ passed: false, timedOut: true })
  })

  it('returns failed when tests fail without timeout', () => {
    execFileSync.mockImplementation(() => { throw { killed: false } })
    expect(runTests()).toEqual({ passed: false, timedOut: false })
  })

  it('calls execFileSync with correct args', () => {
    execFileSync.mockReturnValue(undefined)
    runTests()
    expect(execFileSync).toHaveBeenCalledWith(
      'npx', ['vitest', 'run', '--reporter=dot'],
      { cwd: ROOT, timeout: TIMEOUT_MS, stdio: 'pipe' }
    )
  })
})

// --- runMutation ---

describe('runMutation', () => {
  it('writes mutation source, runs tests, then restores original', () => {
    readFileSync.mockReturnValue('original code')
    execFileSync.mockReturnValue(undefined)

    const mutation = { source: 'mutated code' }
    const result = runMutation('core/engine.js', mutation)

    expect(result).toEqual({ passed: true })

    const calls = writeFileSync.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][1]).toBe('mutated code')
    expect(calls[1][1]).toBe('original code')
  })

  it('restores original even when runTests throws', () => {
    readFileSync.mockReturnValue('original code')
    execFileSync.mockImplementation(() => { throw { killed: false } })

    runMutation('core/engine.js', { source: 'bad' })

    const restoreCall = writeFileSync.mock.calls[1]
    expect(restoreCall[1]).toBe('original code')
  })
})

// --- loadMutations ---

describe('loadMutations', () => {
  it('generates mutations from source and filters comment-only lines', () => {
    readFileSync.mockReturnValue('if (x > 0) return true')
    const mutations = loadMutations('core/engine.js')

    expect(mutations.length).toBeGreaterThan(0)
    for (const m of mutations) {
      expect(isCommentOnlyLine(m.original)).toBe(false)
    }
  })

  it('returns empty array when source has no mutable code', () => {
    readFileSync.mockReturnValue('// just a comment')
    expect(loadMutations('core/engine.js')).toEqual([])
  })
})

// --- previewMutations ---

describe('previewMutations', () => {
  it('returns all mutations with dry-run status', () => {
    readFileSync.mockReturnValue('const x = true')
    const results = previewMutations('a.js')

    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.status).toBe('dry-run')
      expect(r.file).toBe('a.js')
    }
  })
})

// --- executeMutations ---

describe('executeMutations', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  it('marks mutations as Killed when tests fail', () => {
    readFileSync.mockReturnValue('const x = true')
    execFileSync.mockImplementation(() => { throw { killed: false } })

    const results = executeMutations('a.js')

    expect(results.length).toBeGreaterThan(0)
    expect(results.every(r => r.status === 'Killed')).toBe(true)
  })

  it('marks mutations as Survived when tests pass', () => {
    readFileSync.mockReturnValue('const x = true')
    execFileSync.mockReturnValue(undefined)

    const results = executeMutations('a.js')
    expect(results.every(r => r.status === 'Survived')).toBe(true)
  })

  it('marks mutations as Timeout when process is killed', () => {
    readFileSync.mockReturnValue('const x = true')
    execFileSync.mockImplementation(() => { throw { killed: true } })

    const results = executeMutations('a.js')
    expect(results.every(r => r.status === 'Timeout')).toBe(true)
  })

  it('writes progress icons to stderr', () => {
    readFileSync.mockReturnValue('const x = true')
    execFileSync.mockImplementation(() => { throw { killed: false } })

    executeMutations('a.js')

    const writes = process.stderr.write.mock.calls.map(c => c[0])
    expect(writes).toContain('.')
    expect(writes[writes.length - 1]).toBe('\n')
  })

  it('writes ! for survived and T for timeout', () => {
    readFileSync.mockReturnValue('const x = true && false')
    let callCount = 0
    execFileSync.mockImplementation(() => {
      callCount++
      if (callCount % 2 === 0) throw { killed: true }
    })

    executeMutations('a.js')

    const writes = process.stderr.write.mock.calls.map(c => c[0])
    expect(writes).toContain('!')
    expect(writes).toContain('T')
  })
})

// --- print functions ---

describe('printSummary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('prints counts and score', () => {
    printSummary([
      { status: 'Killed' },
      { status: 'Survived' },
      { status: 'Timeout' }
    ])

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('Total mutations: 3')
    expect(output).toContain('Killed: 1')
    expect(output).toContain('Survived: 1')
    expect(output).toContain('Timed out: 1')
    expect(output).toContain('66.7%')
  })

  it('prints score as 0 when no results', () => {
    printSummary([])

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('Score: 0%')
  })

  it('prints survivors section when survivors exist', () => {
    printSummary([
      { file: 'a.js', line: 1, name: 'flip', original: 'true', mutated: 'false', status: 'Survived' }
    ])

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('--- SURVIVORS ---')
  })

  it('omits survivors section when all killed', () => {
    printSummary([{ status: 'Killed' }])

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).not.toContain('SURVIVORS')
  })
})

describe('printSurvivors', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('prints file:line, name, original, and mutated for each survivor', () => {
    printSurvivors([
      { file: 'a.js', line: 10, name: 'boolFlip', original: 'true', mutated: 'false' }
    ])

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('a.js:10')
    expect(output).toContain('boolFlip')
    expect(output).toContain('original: true')
    expect(output).toContain('mutated:  false')
  })
})

describe('printPerFileScores', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('groups results by file with per-file scores', () => {
    printPerFileScores([
      { file: 'a.js', status: 'Killed' },
      { file: 'a.js', status: 'Survived' },
      { file: 'b.js', status: 'Killed' }
    ])

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('a.js: 50.0% (1/2)')
    expect(output).toContain('1 SURVIVED')
    expect(output).toContain('b.js: 100.0% (1/1)')
  })

  it('counts timeouts toward the score', () => {
    printPerFileScores([
      { file: 'a.js', status: 'Timeout' }
    ])

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('100.0%')
  })
})

describe('printTextReport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('prints both summary and per-file scores', () => {
    printTextReport([{ file: 'a.js', status: 'Killed' }])

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('SELF-MUTATION REPORT')
    expect(output).toContain('PER-FILE SCORES')
  })
})

// --- main ---

describe('main', () => {
  let origArgv

  beforeEach(() => {
    origArgv = process.argv
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw Object.assign(new Error(`exit(${code})`), { exitCode: code })
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = origArgv
  })

  it('exits with code 1 when no valid targets', () => {
    process.argv = ['node', 'self-mutate.js', 'bogus.js']

    expect(() => main()).toThrow('exit(1)')
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(console.error).toHaveBeenCalledWith('No valid target modules specified.')
  })

  it('exits with code 1 when preflight fails', () => {
    process.argv = ['node', 'self-mutate.js', 'core/engine.js']
    execFileSync.mockImplementation(() => { throw { killed: false } })

    expect(() => main()).toThrow('exit(1)')
    expect(console.error).toHaveBeenCalledWith(
      'FAILED — test suite is not green. Fix tests before mutating.'
    )
  })

  it('skips preflight in dry-run mode', () => {
    process.argv = ['node', 'self-mutate.js', '--dry-run', 'core/engine.js']
    readFileSync.mockReturnValue('const x = true')

    main()

    expect(execFileSync).not.toHaveBeenCalled()
  })

  it('outputs JSON in --json mode', () => {
    process.argv = ['node', 'self-mutate.js', '--dry-run', '--json', 'core/engine.js']
    readFileSync.mockReturnValue('const x = true')

    main()

    const jsonArg = console.log.mock.calls[0][0]
    const parsed = JSON.parse(jsonArg)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]).toHaveProperty('status', 'dry-run')
  })

  it('outputs text report by default', () => {
    process.argv = ['node', 'self-mutate.js', '--dry-run', 'core/engine.js']
    readFileSync.mockReturnValue('const x = true')

    main()

    const output = console.log.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('SELF-MUTATION REPORT')
  })

  it('runs preflight and safety checks in live mode', () => {
    process.argv = ['node', 'self-mutate.js', 'core/engine.js']
    readFileSync.mockReturnValue('const x = true')
    execFileSync.mockReturnValue(undefined)

    main()

    const stderrWrites = process.stderr.write.mock.calls.map(c => c[0])
    expect(stderrWrites).toContain('Preflight check... ')
    expect(stderrWrites).toContain('OK\n\n')
    expect(stderrWrites.some(w => w.includes('Safety check'))).toBe(true)
  })

  it('exits with code 2 when safety check fails', () => {
    process.argv = ['node', 'self-mutate.js', 'core/engine.js']
    readFileSync.mockReturnValue('const x = true')

    // Preflight passes, mutations run, safety fails
    let callCount = 0
    execFileSync.mockImplementation(() => {
      callCount++
      // First call = preflight (pass), middle calls = mutations (fail = killed),
      // last call = safety (fail)
      if (callCount === 1) return undefined
      throw { killed: false }
    })

    expect(() => main()).toThrow('exit(2)')
    expect(console.error).toHaveBeenCalledWith(
      'CRITICAL: Tests failing after mutation run! Source may be corrupted.'
    )
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn()
}))

import { main, isCommentOnlyLine, isMainGuardLine, printSummary, printPerFileScores } from '../../scripts/self-mutate.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const SOURCE_WITH_MUTATIONS = 'function f(x) { return x > 0 }'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function stdout() {
  return console.log.mock.calls.map(c => c[0]).join('\n')
}

function stderr() {
  return console.error.mock.calls.map(c => c[0]).join('\n')
}

describe('main', () => {
  describe('argument handling', () => {
    it('returns 1 when no valid targets specified', () => {
      expect(main(['bogus.js'])).toBe(1)
      expect(stderr()).toContain('No valid target modules specified.')
    })

    it('defaults to all target modules when no files given', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      expect(main(['--dry-run'])).toBe(0)
      expect(stdout()).toContain('SELF-MUTATION REPORT')
    })

    it('accepts a single valid target module', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      expect(main(['--dry-run', '--json', 'core/engine.js'])).toBe(0)

      const results = JSON.parse(stdout())
      expect(results.every(r => r.file === 'core/engine.js')).toBe(true)
    })
  })

  describe('dry-run mode', () => {
    it('skips preflight and safety checks', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      main(['--dry-run', 'core/engine.js'])

      expect(execFileSync).not.toHaveBeenCalled()
    })

    it('returns results with dry-run status', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      main(['--dry-run', '--json', 'core/engine.js'])

      const results = JSON.parse(stdout())
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.status === 'dry-run')).toBe(true)
    })

    it('includes mutation details in each result', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      main(['--dry-run', '--json', 'core/engine.js'])

      const result = JSON.parse(stdout())[0]
      expect(result).toHaveProperty('file')
      expect(result).toHaveProperty('line')
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('original')
      expect(result).toHaveProperty('mutated')
    })
  })

  describe('live mode', () => {
    it('runs preflight before mutating', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      execFileSync.mockReturnValue(undefined)

      main(['core/engine.js'])

      const writes = process.stderr.write.mock.calls.map(c => c[0])
      expect(writes[0]).toBe('Preflight check... ')
    })

    it('returns 1 when preflight fails', () => {
      execFileSync.mockImplementation(() => { throw { killed: false } })

      expect(main(['core/engine.js'])).toBe(1)
      expect(stderr()).toContain('test suite is not green')
    })

    it('marks mutations Killed when tests fail', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      let callCount = 0
      execFileSync.mockImplementation(() => {
        callCount++
        if (callCount === 1) return undefined // preflight
        throw { killed: false } // mutations + safety all fail
      })

      main(['--json', 'core/engine.js'])

      const results = JSON.parse(stdout())
      expect(results.every(r => r.status === 'Killed')).toBe(true)
    })

    it('marks mutations Survived when tests pass', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      execFileSync.mockReturnValue(undefined)

      main(['--json', 'core/engine.js'])

      const results = JSON.parse(stdout())
      expect(results.every(r => r.status === 'Survived')).toBe(true)
    })

    it('marks mutations Timeout when process is killed', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      let callCount = 0
      execFileSync.mockImplementation(() => {
        callCount++
        if (callCount === 1) return undefined // preflight
        throw { killed: true } // mutations timeout
      })

      main(['--json', 'core/engine.js'])

      const results = JSON.parse(stdout())
      expect(results.every(r => r.status === 'Timeout')).toBe(true)
    })

    it('writes progress icons to stderr', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      execFileSync.mockReturnValue(undefined)

      main(['core/engine.js'])

      const writes = process.stderr.write.mock.calls.map(c => c[0])
      expect(writes).toContain('!')
    })

    it('writes . for killed and T for timeout', () => {
      readFileSync.mockReturnValue('const a = true && false')
      let callCount = 0
      execFileSync.mockImplementation(() => {
        callCount++
        if (callCount === 1) return undefined // preflight
        if (callCount % 2 === 0) throw { killed: true }  // timeout
        throw { killed: false } // killed
      })

      main(['core/engine.js'])

      const writes = process.stderr.write.mock.calls.map(c => c[0])
      expect(writes).toContain('.')
      expect(writes).toContain('T')
    })

    it('restores original source after each mutation', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      execFileSync.mockReturnValue(undefined)

      main(['core/engine.js'])

      const writes = writeFileSync.mock.calls
      expect(writes.length).toBeGreaterThan(0)
      expect(writes.length % 2).toBe(0)
      for (let i = 1; i < writes.length; i += 2) {
        expect(writes[i][1]).toBe(SOURCE_WITH_MUTATIONS)
      }
    })
  })

  describe('safety check', () => {
    it('returns 0 when safety check passes', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      execFileSync.mockReturnValue(undefined)

      expect(main(['core/engine.js'])).toBe(0)

      const writes = process.stderr.write.mock.calls.map(c => c[0])
      expect(writes.some(w => w.includes('Safety check'))).toBe(true)
    })

    it('returns 2 when safety check fails', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      const mutationCount = JSON.parse((() => {
        readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
        main(['--dry-run', '--json', 'core/engine.js'])
        return stdout()
      })()).length

      vi.clearAllMocks()
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})

      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      let callCount = 0
      execFileSync.mockImplementation(() => {
        callCount++
        if (callCount === 1) return undefined // preflight passes
        if (callCount <= 1 + mutationCount) throw { killed: false } // mutations
        throw { killed: false } // safety fails
      })

      expect(main(['core/engine.js'])).toBe(2)
      expect(stderr()).toContain('CRITICAL')
    })
  })

  describe('output formats', () => {
    it('outputs JSON array with --json flag', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      main(['--dry-run', '--json', 'core/engine.js'])

      const parsed = JSON.parse(stdout())
      expect(Array.isArray(parsed)).toBe(true)
    })

    it('outputs text report by default', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      main(['--dry-run', 'core/engine.js'])

      const output = stdout()
      expect(output).toContain('SELF-MUTATION REPORT')
      expect(output).toContain('PER-FILE SCORES')
    })

    it('includes score as 0% when no mutations generated', () => {
      readFileSync.mockReturnValue('// nothing mutable here')
      main(['--dry-run', 'core/engine.js'])

      expect(stdout()).toContain('Score: 0%')
    })

    it('shows survivors section when mutations survive', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      execFileSync.mockReturnValue(undefined)

      main(['core/engine.js'])

      expect(stdout()).toContain('SURVIVORS')
    })

    it('omits survivors section when all killed', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      let callCount = 0
      execFileSync.mockImplementation(() => {
        callCount++
        if (callCount === 1) return undefined // preflight
        throw { killed: false }
      })

      main(['core/engine.js'])

      expect(stdout()).not.toContain('SURVIVORS')
    })

    it('flags survived count in per-file scores', () => {
      readFileSync.mockReturnValue(SOURCE_WITH_MUTATIONS)
      execFileSync.mockReturnValue(undefined)

      main(['core/engine.js'])

      expect(stdout()).toContain('SURVIVED')
    })
  })

  describe('comment filtering', () => {
    it('excludes mutations on comment-only lines', () => {
      readFileSync.mockReturnValue('// return true\nconst x = true')
      main(['--dry-run', '--json', 'core/engine.js'])

      const results = JSON.parse(stdout())
      for (const r of results) {
        expect(r.original.trim().startsWith('//')).toBe(false)
      }
    })
  })
})

describe('isCommentOnlyLine', () => {
  it('returns true for // comments', () => {
    expect(isCommentOnlyLine('// a comment')).toBe(true)
  })

  it('returns true for // comments with leading whitespace', () => {
    expect(isCommentOnlyLine('  // a comment')).toBe(true)
  })

  it('returns true for * continuation lines', () => {
    expect(isCommentOnlyLine(' * continuation')).toBe(true)
  })

  it('returns true for * with leading whitespace', () => {
    expect(isCommentOnlyLine('   * doc line')).toBe(true)
  })

  it('returns true for /* block comment start', () => {
    expect(isCommentOnlyLine('/* block start')).toBe(true)
  })

  it('returns true for /* with leading whitespace', () => {
    expect(isCommentOnlyLine('  /* indented block')).toBe(true)
  })

  it('returns true for */ block comment end', () => {
    expect(isCommentOnlyLine('*/')).toBe(true)
  })

  it('returns true for */ with leading whitespace', () => {
    expect(isCommentOnlyLine('  */')).toBe(true)
  })

  it('returns false for code lines', () => {
    expect(isCommentOnlyLine('const x = 1')).toBe(false)
  })

  it('returns false for code with trailing comment', () => {
    expect(isCommentOnlyLine('const x = 1 // comment')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isCommentOnlyLine('')).toBe(false)
  })
})

describe('isMainGuardLine', () => {
  it('returns true for import.meta.url lines', () => {
    expect(isMainGuardLine('if (process.argv[1] === fileURLToPath(import.meta.url))')).toBe(true)
  })

  it('returns true for process.exit lines', () => {
    expect(isMainGuardLine('  process.exit(main(process.argv.slice(2)))')).toBe(true)
  })

  it('returns true for import.meta.url with leading whitespace', () => {
    expect(isMainGuardLine('  import.meta.url')).toBe(true)
  })

  it('returns false for regular code', () => {
    expect(isMainGuardLine('const x = 1')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isMainGuardLine('')).toBe(false)
  })
})

describe('printSummary', () => {
  it('calculates score from killed and timed-out counts', () => {
    const results = [
      { status: 'Killed', file: 'a.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
      { status: 'Survived', file: 'a.js', line: 2, name: 'm2', original: 'x', mutated: 'y' },
      { status: 'Timeout', file: 'a.js', line: 3, name: 'm3', original: 'x', mutated: 'y' },
    ]
    printSummary(results)
    const output = stdout()
    expect(output).toContain('Total mutations: 3')
    expect(output).toContain('Killed: 1')
    expect(output).toContain('Survived: 1')
    expect(output).toContain('Timed out: 1')
    expect(output).toContain('Score: 66.7%')
  })

  it('shows 100% when all killed', () => {
    const results = [
      { status: 'Killed', file: 'a.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
      { status: 'Killed', file: 'a.js', line: 2, name: 'm2', original: 'x', mutated: 'y' },
    ]
    printSummary(results)
    expect(stdout()).toContain('Score: 100.0%')
  })

  it('shows 0.0% when all survived', () => {
    const results = [
      { status: 'Survived', file: 'a.js', line: 1, name: 'm1', original: 'x > 0', mutated: 'x >= 0' },
    ]
    printSummary(results)
    expect(stdout()).toContain('Score: 0.0%')
  })

  it('shows 0 score for empty results', () => {
    printSummary([])
    expect(stdout()).toContain('Score: 0%')
  })

  it('shows survivors section when exactly 1 survivor', () => {
    const results = [
      { status: 'Survived', file: 'a.js', line: 5, name: 'boundary', original: 'x > 0', mutated: 'x >= 0' },
    ]
    printSummary(results)
    const output = stdout()
    expect(output).toContain('SURVIVORS')
    expect(output).toContain('a.js:5')
    expect(output).toContain('original: x > 0')
    expect(output).toContain('mutated:  x >= 0')
  })

  it('omits survivors section when none survived', () => {
    const results = [
      { status: 'Killed', file: 'a.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
    ]
    printSummary(results)
    expect(stdout()).not.toContain('SURVIVORS')
  })

  it('includes timeout in score numerator', () => {
    const results = [
      { status: 'Timeout', file: 'a.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
      { status: 'Timeout', file: 'a.js', line: 2, name: 'm2', original: 'x', mutated: 'y' },
    ]
    printSummary(results)
    expect(stdout()).toContain('Score: 100.0%')
  })
})

describe('printPerFileScores', () => {
  it('counts killed, survived, and timed-out per file', () => {
    const results = [
      { status: 'Killed', file: 'a.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
      { status: 'Survived', file: 'a.js', line: 2, name: 'm2', original: 'x', mutated: 'y' },
      { status: 'Killed', file: 'b.js', line: 1, name: 'm3', original: 'x', mutated: 'y' },
      { status: 'Timeout', file: 'b.js', line: 2, name: 'm4', original: 'x', mutated: 'y' },
    ]
    printPerFileScores(results)
    const output = stdout()
    expect(output).toContain('a.js: 50.0% (1/2)')
    expect(output).toContain('1 SURVIVED')
    expect(output).toContain('b.js: 100.0% (1/2)')
  })

  it('shows no SURVIVED flag when all killed', () => {
    const results = [
      { status: 'Killed', file: 'c.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
    ]
    printPerFileScores(results)
    const output = stdout()
    expect(output).toContain('c.js: 100.0% (1/1)')
    expect(output).not.toContain('SURVIVED')
  })

  it('increments total for every result', () => {
    const results = [
      { status: 'Killed', file: 'd.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
      { status: 'Killed', file: 'd.js', line: 2, name: 'm2', original: 'x', mutated: 'y' },
      { status: 'Survived', file: 'd.js', line: 3, name: 'm3', original: 'x', mutated: 'y' },
    ]
    printPerFileScores(results)
    expect(stdout()).toContain('d.js: 66.7% (2/3)')
  })

  it('counts timed-out in score numerator', () => {
    const results = [
      { status: 'Timeout', file: 'e.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
      { status: 'Survived', file: 'e.js', line: 2, name: 'm2', original: 'x', mutated: 'y' },
    ]
    printPerFileScores(results)
    expect(stdout()).toContain('e.js: 50.0% (0/2)')
  })

  it('shows survived count in flag', () => {
    const results = [
      { status: 'Survived', file: 'f.js', line: 1, name: 'm1', original: 'x', mutated: 'y' },
      { status: 'Survived', file: 'f.js', line: 2, name: 'm2', original: 'x', mutated: 'y' },
      { status: 'Killed', file: 'f.js', line: 3, name: 'm3', original: 'x', mutated: 'y' },
    ]
    printPerFileScores(results)
    expect(stdout()).toContain('2 SURVIVED')
  })
})

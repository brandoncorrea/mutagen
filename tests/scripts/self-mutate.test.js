import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn()
}))

import { main } from '../../scripts/self-mutate.js'
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

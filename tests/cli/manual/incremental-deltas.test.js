import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { computeDeltas } from '../../../src/cli/incremental-report.js'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn()
  }
})

vi.mock('../../../src/core/worktree.js')

import { createManualRunner as _createManualRunner } from '../../../src/cli/manual.js'
import { createWorktree } from '../../../src/core/worktree.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { patterns, sourceCode, hashOf, fakeRunner, mockFs as _mockFs, noop } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

function fakeWorktree() {
  const tempRoot = '/tmp/mutagen-test'
  return {
    root: tempRoot,
    resolve: vi.fn((path) => path.replace(resolve('.'), tempRoot)),
    mapPaths: vi.fn(paths => paths),
    cleanup: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  existsSync.mockReturnValue(false)
  createWorktree.mockReturnValue(fakeWorktree())
})

describe('incremental deltas', () => {
  describe('structured report (jsonOutput is a path)', () => {
    it('includes fixes when previously-survived mutants are now killed', async () => {
      const srcA = resolve('src/a.js')
      const codeA = 'if (a === b) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        ['reports/mutation/manual-report.json']: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                {
                  id: 'mutagen-src/a.js-1-=== → !==',
                  mutatorName: '=== → !==',
                  status: 'Survived',
                  location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
                  description: 'a === b → a !== b'
                }
              ]
            }
          },
          sourceHashes: { 'src/a.js': 'stale-hash' },
          testHashes: {}
        })
      })

      // Now the mutation is killed (first result is preflight, second is mutation)
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])
      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental('reports/out.json', null)

      const calls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/out.json')
      )
      expect(calls).toHaveLength(1)
      const report = JSON.parse(calls[0][1])

      expect(report.deltas).toBeDefined()
      expect(report.deltas.fixes).toHaveLength(1)
      expect(report.deltas.fixes[0]).toMatchObject({
        file: 'src/a.js',
        line: 1,
        name: '=== → !=='
      })
    })

    it('includes regressions when new survivors appear', async () => {
      const srcA = resolve('src/a.js')
      const codeA = 'if (a === b) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        ['reports/mutation/manual-report.json']: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                {
                  id: 'mutagen-src/a.js-1-=== → !==',
                  mutatorName: '=== → !==',
                  status: 'Killed',
                  location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
                  description: 'a === b → a !== b',
                  killedBy: ['t.test.js']
                }
              ]
            }
          },
          sourceHashes: { 'src/a.js': 'stale-hash' },
          testHashes: {}
        })
      })

      // Now the mutation survives (regression)
      const runner = fakeRunner([
        { passed: true }
      ])
      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental('reports/out.json', null)

      const calls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/out.json')
      )
      const report = JSON.parse(calls[0][1])

      expect(report.deltas).toBeDefined()
      expect(report.deltas.regressions).toHaveLength(1)
      expect(report.deltas.regressions[0]).toMatchObject({
        file: 'src/a.js',
        line: 1,
        name: '=== → !=='
      })
    })

    it('includes rerunFiles and cachedFiles lists', async () => {
      const srcA = resolve('src/a.js')
      const srcB = resolve('src/b.js')
      const codeA = 'const a = 1'
      const codeB = 'if (a === b) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        [srcB]: codeB,
        ['reports/mutation/manual-report.json']: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Killed', mutatorName: 'x', location: { start: { line: 1 } } }] }
          },
          sourceHashes: {
            'src/a.js': hashOf(codeA),
            'src/b.js': 'stale-hash'
          },
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])
      const manual = createManualRunner({
        patterns,
        sources: ['src/a.js', 'src/b.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental('reports/out.json', null)

      const calls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/out.json')
      )
      const report = JSON.parse(calls[0][1])

      expect(report.deltas).toBeDefined()
      expect(report.deltas.rerunFiles).toContain('src/b.js')
      expect(report.deltas.cachedFiles).toContain('src/a.js')
    })

    it('has no deltas on first run (no previous report)', async () => {
      const srcA = resolve('src/a.js')
      existsSync.mockReturnValue(false)
      mockFs({ [srcA]: sourceCode })

      const runner = fakeRunner([
        { passed: true },
        { passed: true }
      ])
      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental('reports/out.json', null)

      const calls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/out.json')
      )
      const report = JSON.parse(calls[0][1])

      expect(report.deltas).toBeUndefined()
    })

    it('reports empty fixes/regressions when status unchanged', async () => {
      const srcA = resolve('src/a.js')
      const codeA = 'if (a === b) {}'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        ['reports/mutation/manual-report.json']: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                {
                  mutatorName: '=== → !==',
                  status: 'Survived',
                  location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
                  description: 'a === b → a !== b'
                }
              ]
            }
          },
          sourceHashes: { 'src/a.js': 'stale-hash' },
          testHashes: {}
        })
      })

      // Still survived (no change) — preflight passes, mutation survives
      const runner = fakeRunner([
        { passed: true },
        { passed: true }
      ])
      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental('reports/out.json', null)

      const calls = writeFileSync.mock.calls.filter(
        ([p]) => p === resolve('reports/out.json')
      )
      const report = JSON.parse(calls[0][1])

      expect(report.deltas).toBeDefined()
      expect(report.deltas.fixes).toHaveLength(0)
      expect(report.deltas.regressions).toHaveLength(0)
    })
  })

  describe('standard report (jsonOutput is true)', () => {
    it('includes deltas in merged report', async () => {
      const srcA = resolve('src/a.js')
      const codeA = 'if (a === b) {}'
      const reportPath = 'reports/mutation/manual-report.json'

      existsSync.mockReturnValue(true)
      mockFs({
        [srcA]: codeA,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                {
                  mutatorName: '=== → !==',
                  status: 'Survived',
                  location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
                  description: 'a === b → a !== b'
                }
              ]
            }
          },
          sourceHashes: { 'src/a.js': 'stale-hash' },
          testHashes: {}
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['t.test.js'] }
      ])
      const manual = createManualRunner({
        patterns, sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      await manual.runIncremental(true, null)

      const calls = writeFileSync.mock.calls.filter(([p]) => p === reportPath)
      expect(calls).toHaveLength(1)
      const report = JSON.parse(calls[0][1])

      expect(report.deltas).toBeDefined()
      expect(report.deltas.fixes).toHaveLength(1)
      expect(report.deltas.fixes[0]).toMatchObject({
        file: 'src/a.js',
        line: 1,
        name: '=== → !=='
      })
    })
  })
})

describe('computeDeltas', () => {
  it('defaults line to 0 when mutant has no location', () => {
    const previousReport = {
      files: {
        'a.js': {
          mutants: [{ mutatorName: 'x', replacement: 'y', status: 'Survived' }]
        }
      }
    }
    const newFileResults = {
      'a.js': {
        mutants: [{ mutatorName: 'x', replacement: 'y', status: 'Killed' }]
      }
    }
    const classification = { changedSources: ['a.js'], unchangedSources: [] }

    const deltas = computeDeltas(previousReport, newFileResults, classification)
    expect(deltas.fixes[0].line).toBe(0)
  })

  it('defaults description to empty string when missing', () => {
    const previousReport = {
      files: {
        'a.js': {
          mutants: [{ location: { start: { line: 1 } }, mutatorName: 'x', replacement: 'y', status: 'Survived' }]
        }
      }
    }
    const newFileResults = {
      'a.js': {
        mutants: [{ location: { start: { line: 1 } }, mutatorName: 'x', replacement: 'y', status: 'Killed' }]
      }
    }
    const classification = { changedSources: ['a.js'], unchangedSources: [] }

    const deltas = computeDeltas(previousReport, newFileResults, classification)
    expect(deltas.fixes[0].description).toBe('')
  })
})

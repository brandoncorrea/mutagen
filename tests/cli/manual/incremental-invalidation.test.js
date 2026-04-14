import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'

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

import { createManualRunner as _createManualRunner } from '../../../cli/manual.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { patterns, sourceCode, hashOf, fakeRunner, mockFs as _mockFs, noop } from '../helpers.js'

function mockFs(files) { _mockFs(readFileSync, files) }
function createManualRunner(config) {
  return _createManualRunner({ out: noop, ...config })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  existsSync.mockReturnValue(false)
})

describe('createManualRunner', () => {
  describe('runIncremental', () => {
    const reportPath = 'reports/mutation/manual-report.json'

    it('invalidates source files when test files change', async () => {
      const src = resolve('src/a.js')
      const testFile = resolve('test/a.test.js')
      const srcHash = hashOf(sourceCode)
      const testContent = 'test code'

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [testFile]: testContent,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [{
                status: 'Killed',
                killedBy: [resolve('test/a.test.js')]
              }]
            }
          },
          sourceHashes: { 'src/a.js': srcHash },
          testHashes: { 'test/a.test.js': 'old-test-hash' }
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['test/a.test.js'] }
      ])
      const manual = createManualRunner({
        patterns,
        sources: ['src/a.js'],
        testSources: ['test/a.test.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runIncremental(false, null)

      // Source hash matches, but test changed → source re-run
      expect(result.totalKilled).toBe(1)
      expect(runner.run).toHaveBeenCalled()
    })

    it('invalidates sources with surviving mutations when test files change', async () => {
      const src = resolve('src/a.js')
      const testFile = resolve('test/a.test.js')
      const srcHash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [testFile]: 'new test code',
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [{ status: 'Survived' }]
            }
          },
          sourceHashes: { 'src/a.js': srcHash },
          testHashes: { 'test/a.test.js': 'old-hash' }
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['test/a.test.js'] }
      ])
      const manual = createManualRunner({
        patterns,
        sources: ['src/a.js'],
        testSources: ['test/a.test.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runIncremental(false, null)

      // Source hash matches, but surviving mutation + changed test → re-run
      expect(result.totalKilled).toBe(1)
      expect(runner.run).toHaveBeenCalled()
    })

    it('skips test invalidation when test files are unchanged', async () => {
      const src = resolve('src/a.js')
      const testFile = resolve('test/a.test.js')
      const testContent = 'test code'
      const srcHash = hashOf(sourceCode)
      const testHash = hashOf(testContent)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [testFile]: testContent,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [{ status: 'Killed', killedBy: [resolve('test/a.test.js')] }]
            }
          },
          sourceHashes: { 'src/a.js': srcHash },
          testHashes: { 'test/a.test.js': testHash }
        })
      })

      const createRunner = vi.fn()
      const manual = createManualRunner({
        patterns,
        sources: ['src/a.js'],
        testSources: ['test/a.test.js'],
        createRunner
      })
      const result = await manual.runIncremental(false, null)

      // Both source and test unchanged → fully cached
      expect(createRunner).not.toHaveBeenCalled()
      expect(result.totalKilled).toBe(1)
    })

    it('invalidates source when only one of multiple killedBy tests changed', async () => {
      const src = resolve('src/a.js')
      const testFileA = resolve('test/a.test.js')
      const testFileB = resolve('test/b.test.js')
      const srcHash = hashOf(sourceCode)
      const testContentB = 'test B code'

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [testFileA]: 'changed test A code',
        [testFileB]: testContentB,
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [{
                status: 'Killed',
                killedBy: [resolve('test/a.test.js'), resolve('test/b.test.js')]
              }]
            }
          },
          sourceHashes: { 'src/a.js': srcHash },
          testHashes: {
            'test/a.test.js': 'old-hash-a',
            'test/b.test.js': hashOf(testContentB)
          }
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['test/a.test.js'] }
      ])
      const manual = createManualRunner({
        patterns,
        sources: ['src/a.js'],
        testSources: ['test/a.test.js', 'test/b.test.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      })
      const result = await manual.runIncremental(false, null)

      // Source hash unchanged, but one of two killedBy tests changed → must re-run
      // This guards against .some() being weakened to .every()
      expect(result.totalKilled).toBe(1)
      expect(runner.run).toHaveBeenCalled()
    })

    it('does not invalidate source when changed test is not in killedBy', async () => {
      const src = resolve('src/a.js')
      const testFile = resolve('test/a.test.js')
      const srcHash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [testFile]: 'new test code',
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': {
              mutants: [
                { status: 'Killed', killedBy: ['/other/test.js'] },
                { status: 'Killed' }
              ]
            }
          },
          sourceHashes: { 'src/a.js': srcHash },
          testHashes: { 'test/a.test.js': 'old-hash' }
        })
      })

      const createRunner = vi.fn()
      const manual = createManualRunner({
        patterns,
        sources: ['src/a.js'],
        testSources: ['test/a.test.js'],
        createRunner
      })
      const result = await manual.runIncremental(false, null)

      // Source hash matches, test changed, but no mutant's killedBy matches
      // the changed test and no mutant survived → source not invalidated
      expect(createRunner).not.toHaveBeenCalled()
      expect(result.totalKilled).toBe(2)
    })

    it('prints changed test count in header when tests change', async () => {
      const src = resolve('src/a.js')
      const testFile = resolve('test/a.test.js')
      const srcHash = hashOf(sourceCode)

      existsSync.mockReturnValue(true)
      mockFs({
        [src]: sourceCode,
        [testFile]: 'new test code',
        [reportPath]: JSON.stringify({
          files: {
            'src/a.js': { mutants: [{ status: 'Survived' }] }
          },
          sourceHashes: { 'src/a.js': srcHash },
          testHashes: { 'test/a.test.js': 'old-hash' }
        })
      })

      const runner = fakeRunner([
        { passed: true },
        { passed: false }
      ])
      const lines = []
      const manual = _createManualRunner({
        patterns,
        sources: ['src/a.js'],
        testSources: ['test/a.test.js'],
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg)
      })
      await manual.runIncremental(false, null)

      expect(lines.join('\n')).toContain('Changed tests: 1')
    })
  })
})

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

vi.mock('../../../src/core/temp-copy.js')

import { createManualRunner as _createManualRunner } from '../../../src/cli/manual.js'
import { createTempCopy } from '../../../src/core/temp-copy.js'
import { readFileSync, existsSync } from 'node:fs'
import { testMutators, mockFs as _mockFs, noop } from '../helpers.js'

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
  existsSync.mockReturnValue(false)
  createTempCopy.mockReturnValue(fakeWorktree())
})

describe('createManualRunner', () => {
  describe('--diff mode', () => {
    it('returns 0 when no regressions', async () => {
      const report = JSON.stringify({
        files: {
          'a.js': {
            mutants: [{
              id: 'm1', mutatorName: 'x', status: 'Killed',
              location: { start: { line: 1 } }, replacement: 'y'
            }]
          }
        }
      })
      mockFs({
        [resolve('before.json')]: report,
        [resolve('after.json')]: report
      })

      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'before.json', 'after.json'])

      expect(code).toBe(0)
    })

    it('returns 1 when regressions found', async () => {
      const before = JSON.stringify({
        files: {
          'a.js': {
            mutants: [{
              id: 'm1', mutatorName: 'x', status: 'Killed',
              location: { start: { line: 1 } }, replacement: 'y'
            }]
          }
        }
      })
      const after = JSON.stringify({
        files: {
          'a.js': {
            mutants: [{
              id: 'm1', mutatorName: 'x', status: 'Survived',
              location: { start: { line: 1 } }, replacement: 'y'
            }]
          }
        }
      })
      mockFs({
        [resolve('before.json')]: before,
        [resolve('after.json')]: after
      })

      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'before.json', 'after.json'])

      expect(code).toBe(1)
    })

    it('returns 1 when report file is unreadable', async () => {
      readFileSync.mockImplementation(() => { throw new Error('ENOENT') })

      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'missing.json', 'also-missing.json'])

      expect(code).toBe(1)
    })

    it('returns 1 (not raw count) when multiple regressions found', async () => {
      const before = JSON.stringify({
        files: {
          'a.js': {
            mutants: [
              { id: 'm1', mutatorName: 'x', status: 'Killed', location: { start: { line: 1 } }, replacement: 'y' },
              { id: 'm2', mutatorName: 'x', status: 'Killed', location: { start: { line: 2 } }, replacement: 'z' }
            ]
          }
        }
      })
      const after = JSON.stringify({
        files: {
          'a.js': {
            mutants: [
              { id: 'm1', mutatorName: 'x', status: 'Survived', location: { start: { line: 1 } }, replacement: 'y' },
              { id: 'm2', mutatorName: 'x', status: 'Survived', location: { start: { line: 2 } }, replacement: 'z' }
            ]
          }
        }
      })
      mockFs({
        [resolve('before.json')]: before,
        [resolve('after.json')]: after
      })

      const manual = createManualRunner({
        mutators: testMutators, sources: [], createRunner: vi.fn()
      })
      const code = await manual.run(['--diff', 'before.json', 'after.json'])

      expect(code).toBe(1)
    })
  })
})

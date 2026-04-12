import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  }
})

vi.mock('../../core/engine.js', () => ({
  generateMutations: vi.fn(),
}))

import { dryRun, runSingle } from '../../cli/runner.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { generateMutations } from '../../core/engine.js'

beforeEach(() => {
  vi.clearAllMocks()
  readFileSync.mockReturnValue('const x = 1')
  writeFileSync.mockReturnValue(undefined)
})

function fakeRunner(results) {
  const queue = [...results]
  return {
    run: vi.fn().mockImplementation(() =>
      Promise.resolve(queue.shift() || { passed: true })),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function makeOpts(overrides = {}) {
  return {
    sourceFile: '/src/test.js',
    prepared: {},
    createRunner: vi.fn().mockResolvedValue(
      fakeRunner([{ passed: true }])
    ),
    out: () => {},
    ...overrides,
  }
}

describe('dryRun', () => {
  it('prints mutations sorted by ascending line number', () => {
    const lines = []
    generateMutations.mockReturnValue([
      { name: 'mut-c', line: 20 },
      { name: 'mut-a', line: 3 },
      { name: 'mut-b', line: 10 },
    ])

    dryRun('/src/a.js', {}, null, msg => lines.push(msg))

    const lineNumbers = lines
      .filter(l => /^\s+L\d+:/.test(l))
      .map(l => Number(l.match(/L(\d+)/)[1]))
    expect(lineNumbers).toEqual([3, 10, 20])
  })

  it('groups multiple mutations on the same line', () => {
    const lines = []
    generateMutations.mockReturnValue([
      { name: 'first-mut', line: 5 },
      { name: 'second-mut', line: 5 },
    ])

    dryRun('/src/a.js', {}, null, msg => lines.push(msg))

    const l5Line = lines.find(l => l.includes('L5'))
    expect(l5Line).toContain('first-mut')
    expect(l5Line).toContain('second-mut')
  })

  it('returns total mutation count', () => {
    generateMutations.mockReturnValue([
      { name: 'a', line: 1 },
      { name: 'b', line: 2 },
    ])

    expect(dryRun('/src/a.js', {}, null, () => {})).toBe(2)
  })
})

describe('runSingle', () => {
  describe('timeout behavior', () => {
    it('applies timeout and classifies slow runner as timed out', async () => {
      const runner = {
        run: vi.fn()
          .mockResolvedValueOnce({ passed: true })
          .mockImplementationOnce(() => new Promise(resolve =>
            setTimeout(() => resolve({ passed: true }), 500))),
        close: vi.fn().mockResolvedValue(undefined),
      }

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'x', original: 'o', mutated: 'm' },
      ])

      const result = await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
        timeout: 15,
      }))

      expect(result.timedOut).toBe(1)
      expect(result.survived).toBe(0)
    }, 5000)

    it('does not apply timeout when timeout is not set', async () => {
      const runner = fakeRunner([
        { passed: true },
        { passed: true },
      ])

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'x', original: 'o', mutated: 'm' },
      ])

      const result = await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
      }))

      expect(result.survived).toBe(1)
      expect(result.timedOut).toBe(0)
    })
  })

  describe('mutation progress reporting', () => {
    it('numbers mutations starting at 1', async () => {
      const lines = []
      const runner = fakeRunner([
        { passed: true },
        { passed: false },
        { passed: true },
      ])

      generateMutations.mockReturnValue([
        { name: 'a', line: 1, source: 'x', original: 'o', mutated: 'm' },
        { name: 'b', line: 2, source: 'y', original: 'o', mutated: 'm' },
      ])

      await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg),
      }))

      const progressLines = lines.filter(l => /\[\d+\/\d+\]/.test(l))
      expect(progressLines[0]).toMatch(/\[1\//)
      expect(progressLines[1]).toMatch(/\[2\//)
    })

    it('reports total matching actual mutation count', async () => {
      const lines = []
      const runner = fakeRunner([
        { passed: true },
        { passed: false },
        { passed: false },
        { passed: false },
      ])

      generateMutations.mockReturnValue([
        { name: 'a', line: 1, source: 'x', original: 'o', mutated: 'm' },
        { name: 'b', line: 2, source: 'y', original: 'o', mutated: 'm' },
        { name: 'c', line: 3, source: 'z', original: 'o', mutated: 'm' },
      ])

      await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg),
      }))

      const progressLines = lines.filter(l => /\[\d+\/\d+\]/.test(l))
      for (const line of progressLines)
        expect(line).toMatch(/\/3\]/)
    })
  })

  describe('killed mutation handling', () => {
    it('propagates killedBy from test result', async () => {
      const runner = fakeRunner([
        { passed: true },
        { passed: false, killedBy: ['spec-a.js'] },
      ])

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'x', original: 'o', mutated: 'm' },
      ])

      const result = await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
      }))

      const killedMutant = result.jsonData.mutants.find(m => m.status === 'Killed')
      expect(killedMutant.killedBy).toEqual(['spec-a.js'])
    })
  })

  describe('error classification', () => {
    it('classifies timeout errors as timed out', async () => {
      const lines = []
      const runner = {
        run: vi.fn()
          .mockResolvedValueOnce({ passed: true })
          .mockRejectedValueOnce(new Error('Mutation timed out after 100ms')),
        close: vi.fn().mockResolvedValue(undefined),
      }

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'x', original: 'o', mutated: 'm' },
      ])

      const result = await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg),
      }))

      expect(result.timedOut).toBe(1)
      expect(lines.some(l => l.includes('TIMEOUT'))).toBe(true)
    })

    it('classifies non-timeout errors as killed', async () => {
      const lines = []
      const runner = {
        run: vi.fn()
          .mockResolvedValueOnce({ passed: true })
          .mockRejectedValueOnce(new Error('process exited unexpectedly')),
        close: vi.fn().mockResolvedValue(undefined),
      }

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'x', original: 'o', mutated: 'm' },
      ])

      const result = await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg),
      }))

      expect(result.killed).toBe(1)
      expect(result.timedOut).toBe(0)
      expect(lines.some(l => l.includes('killed (error)'))).toBe(true)
    })

    it('handles errors without message property', async () => {
      const runner = {
        run: vi.fn()
          .mockResolvedValueOnce({ passed: true })
          .mockRejectedValueOnce({ code: 'ERR_UNKNOWN' }),
        close: vi.fn().mockResolvedValue(undefined),
      }

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'x', original: 'o', mutated: 'm' },
      ])

      const result = await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
      }))

      expect(result.killed).toBe(1)
      expect(result.timedOut).toBe(0)
    })
  })

  describe('runner lifecycle', () => {
    it('closes runner after mutations complete', async () => {
      const runner = fakeRunner([
        { passed: true },
        { passed: false },
      ])

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'x', original: 'o', mutated: 'm' },
      ])

      await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
      }))

      expect(runner.close).toHaveBeenCalled()
    })

    it('propagates runner.close() rejection', async () => {
      const runner = {
        run: vi.fn().mockResolvedValue({ passed: true }),
        close: vi.fn().mockRejectedValue(new Error('close failed')),
      }

      generateMutations.mockReturnValue([])

      await expect(runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
      }))).rejects.toThrow('close failed')
    })

    it('restores original source after each mutation', async () => {
      readFileSync.mockReturnValue('original code')
      const runner = fakeRunner([
        { passed: true },
        { passed: true },
      ])

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'mutated code', original: 'o', mutated: 'm' },
      ])

      await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
      }))

      expect(writeFileSync).toHaveBeenCalledWith('/src/test.js', 'mutated code')
      const lastCall = writeFileSync.mock.calls[writeFileSync.mock.calls.length - 1]
      expect(lastCall[1]).toBe('original code')
    })
  })

  describe('preflight', () => {
    it('aborts when preflight tests fail', async () => {
      const lines = []
      const runner = fakeRunner([{ passed: false }])

      generateMutations.mockReturnValue([
        { name: 'mut', line: 1, source: 'x', original: 'o', mutated: 'm' },
      ])

      const result = await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
        out: msg => lines.push(msg),
      }))

      expect(result.error).toBe(true)
      expect(lines.some(l => l.includes('ABORT'))).toBe(true)
    })
  })

  describe('return value', () => {
    it('returns correct counts for mixed results', async () => {
      const runner = {
        run: vi.fn()
          .mockResolvedValueOnce({ passed: true })
          .mockResolvedValueOnce({ passed: false, killedBy: ['t.js'] })
          .mockResolvedValueOnce({ passed: true })
          .mockRejectedValueOnce(new Error('Mutation timed out after 10ms')),
        close: vi.fn().mockResolvedValue(undefined),
      }

      generateMutations.mockReturnValue([
        { name: 'a', line: 1, source: 'x', original: 'o', mutated: 'm' },
        { name: 'b', line: 2, source: 'y', original: 'o', mutated: 'm' },
        { name: 'c', line: 3, source: 'z', original: 'o', mutated: 'm' },
      ])

      const result = await runSingle(makeOpts({
        createRunner: vi.fn().mockResolvedValue(runner),
      }))

      expect(result.survived).toBe(1)
      expect(result.killed).toBe(2)
      expect(result.timedOut).toBe(1)
      expect(result.jsonData.mutants).toHaveLength(3)
    })
  })
})

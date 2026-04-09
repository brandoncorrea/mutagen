import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  }
})

import { withTimeout, dryRun } from '../../cli/runner.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { preparePatterns } from '../../core/engine.js'

describe('withTimeout', () => {
  it('calls fn directly when ms is falsy', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    const result = await withTimeout(fn, 0)
    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('calls fn directly when ms is null', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withTimeout(fn, null)
    expect(result).toBe('ok')
  })

  it('returns fn result when fn resolves before timeout', async () => {
    const fn = () => Promise.resolve('fast')
    const result = await withTimeout(fn, 5000)
    expect(result).toBe('fast')
  })

  it('rejects with timeout error when fn exceeds timeout', async () => {
    const fn = () => new Promise(resolve => setTimeout(resolve, 500))
    await expect(withTimeout(fn, 1)).rejects.toThrow('timed out after 1ms')
  })

  it('propagates fn rejection', async () => {
    const fn = () => Promise.reject(new Error('boom'))
    await expect(withTimeout(fn, 5000)).rejects.toThrow('boom')
  })
})

describe('dryRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const prepared = preparePatterns([
    { pattern: / === /g, replacement: ' !== ', name: '=== → !==' }
  ])

  it('returns the number of mutations found', () => {
    readFileSync.mockReturnValue('if (a === b) {}')
    const count = dryRun('/src/a.js', prepared, null, () => {})
    expect(count).toBe(1)
  })

  it('returns 0 when no mutations match', () => {
    readFileSync.mockReturnValue('const x = 1')
    const count = dryRun('/src/a.js', prepared, null, () => {})
    expect(count).toBe(0)
  })

  it('logs mutation details grouped by line', () => {
    readFileSync.mockReturnValue('if (a === b) {}')
    const lines = []
    const out = msg => lines.push(msg)
    dryRun('/src/a.js', prepared, null, out)

    const output = lines.join('\n')
    expect(output).toContain('DRY RUN')
    expect(output).toContain('L1:')
    expect(output).toContain('Total: 1 mutations')
  })

  it('filters by target line when specified', () => {
    readFileSync.mockReturnValue('line1\nif (a === b) {}')
    const count = dryRun('/src/a.js', prepared, 1, () => {}) // line 1 has no mutations
    expect(count).toBe(0)
  })

  it('shows mutations only on the target line', () => {
    readFileSync.mockReturnValue('line1\nif (a === b) {}')
    const count = dryRun('/src/a.js', prepared, 2, () => {}) // line 2 has the mutation
    expect(count).toBe(1)
  })

  it('does not write any files', () => {
    readFileSync.mockReturnValue('if (a === b) {}')
    dryRun('/src/a.js', prepared, null, () => {})
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('groups and sorts mutations across multiple lines', () => {
    readFileSync.mockReturnValue('if (a === b) {}\nconst x = 1\nif (c === d) {}')
    const lines = []
    const out = msg => lines.push(msg)
    const count = dryRun('/src/a.js', prepared, null, out)

    expect(count).toBe(2)
    const output = lines.join('\n')
    // Line 1 should appear before line 3
    const l1Idx = output.indexOf('L1:')
    const l3Idx = output.indexOf('L3:')
    expect(l1Idx).toBeLessThan(l3Idx)
  })
})

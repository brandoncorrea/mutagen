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

import { dryRun } from '../../../src/cli/runner/index.js'
import { preparePatterns } from '../../../src/core/engine.js'
import { readFileSync } from 'node:fs'
import { patterns, sourceCode, mockFs as _mockFs, noop } from '../helpers.js'

const prepared = preparePatterns(patterns)

function mockFs(files) { _mockFs(readFileSync, files) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dryRun', () => {
  it('outputs mutation names for each line', () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const lines = []
    dryRun(resolve('src/a.js'), prepared, null, msg => lines.push(msg))

    const mutationLines = lines.filter(l => /^\s+L\d+:/.test(l))
    expect(mutationLines.length).toBeGreaterThan(0)
    for (const line of mutationLines)
      expect(line).toContain('=== → !==')
  })
})

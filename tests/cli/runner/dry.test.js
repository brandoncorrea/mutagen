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
import { prepareMutationConfig } from '../../../src/core/generate.js'
import { readFileSync } from 'node:fs'
import { testMutators, sourceCode, mockFs as _mockFs } from '../helpers.js'

const mutationConfig = prepareMutationConfig({ mutators: testMutators })

function mockFs(files) { _mockFs(readFileSync, files) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dryRun', () => {
  it('outputs mutation names for each line', () => {
    mockFs({ [resolve('src/a.js')]: sourceCode })
    const lines = []
    dryRun(resolve('src/a.js'), mutationConfig, null, { log: msg => lines.push(msg), error: () => {} })

    const mutationLines = lines.filter(line => /^\s+L\d+:/.test(line))
    expect(mutationLines.length).toBeGreaterThan(0)
    for (const line of mutationLines)
      expect(line).toContain('=== → !==')
  })
})

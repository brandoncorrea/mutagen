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

import { run } from '../../bin/mutagen.js'
import { readFileSync, existsSync } from 'node:fs'

const noop = () => {}
const silent = { out: noop, err: noop }

beforeEach(() => {
  vi.clearAllMocks()
  existsSync.mockReturnValue(false)
})

describe('bin/mutagen CLI', () => {
  it('resolves mutagen.config.js from cwd when no configPath given', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const originalCwd = process.cwd()
    process.chdir(resolve('tests/bin/fixtures/default-config'))

    try {
      const code = await run(['src/a.js'], silent)
      expect(code).toBe(0)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('loads config from configPath via dynamic import', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const code = await run(['src/a.js'], {
      ...silent,
      configPath: resolve('tests/bin/fixtures/test-config.js')
    })

    expect(code).toBe(0)
  })

  it('falls back to named exports when config has no default export', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const code = await run(['src/a.js'], {
      ...silent,
      configPath: resolve('tests/bin/fixtures/named-config.js')
    })

    expect(code).toBe(0)
  })

  it('exits 1 with error when no config file found', async () => {
    const lines = []
    const code = await run(['src/a.js'], {
      out: noop,
      configPath: '/nonexistent/mutagen.config.js',
      err: msg => lines.push(msg)
    })

    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('mutagen.config')
  })

  it('loads config and forwards args to createManualRunner', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: false, killedBy: ['t.test.js'] }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const code = await run(['src/a.js'], {
      ...silent,
      config: {
        patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
        sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      }
    })

    expect(code).toBe(0)
  })

  it('passes --all flag through to manual runner', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: false }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const code = await run(['--all'], {
      ...silent,
      config: {
        patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
        sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      }
    })

    expect(code).toBe(0)
  })

  it('returns 1 when mutations survive', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: true }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const code = await run(['src/a.js'], {
      ...silent,
      config: {
        patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
        sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      }
    })

    expect(code).toBe(1)
  })
})

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

beforeEach(() => {
  vi.clearAllMocks()
  existsSync.mockReturnValue(false)
})

describe('bin/mutagen CLI', () => {
  it('exits 1 with error when no config file found', async () => {
    const lines = []
    const code = await run(['src/a.js'], {
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

    const config = {
      patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
      sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    }

    const code = await run(['src/a.js'], {
      config,
      err: () => {}
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

    const config = {
      patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
      sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    }

    const code = await run(['--all'], {
      config,
      err: () => {}
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

    const config = {
      patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
      sources: ['src/a.js'],
      createRunner: vi.fn().mockResolvedValue(runner)
    }

    const code = await run(['src/a.js'], {
      config,
      err: () => {}
    })

    expect(code).toBe(1)
  })
})

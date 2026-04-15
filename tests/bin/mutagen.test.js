import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn()
  }
})

import { run, isMain } from '../../src/bin/mutagen.js'
import { readFileSync, existsSync, readdirSync } from 'node:fs'

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

  it('forwards include/exclude from config to createManualRunner', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })
    readdirSync.mockReturnValue(['src/a.js', 'src/vendor/v.js'])

    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })
        .mockResolvedValueOnce({ passed: false, killedBy: ['t.test.js'] }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    const code = await run(['--all'], {
      ...silent,
      config: {
        patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
        include: ['src/**/*.js'],
        exclude: ['src/vendor/**'],
        createRunner: vi.fn().mockResolvedValue(runner)
      }
    })

    expect(code).toBe(0)
    expect(readdirSync).toHaveBeenCalled()
  })

  it('returns 0 when --min-score threshold is met', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })                          // preflight
        .mockResolvedValueOnce({ passed: false, killedBy: ['t.test.js'] }), // mutation killed
      close: vi.fn().mockResolvedValue(undefined)
    }

    const code = await run(['src/a.js', '--min-score', '50'], {
      ...silent,
      config: {
        patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
        sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      }
    })

    // 1 killed out of 1 = 100% score >= 50 threshold → exit 0
    expect(code).toBe(0)
  })

  it('returns 1 when --min-score threshold is not met', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })   // preflight
        .mockResolvedValueOnce({ passed: true }),   // mutation survived
      close: vi.fn().mockResolvedValue(undefined)
    }

    // All mutations survive (tests pass for mutated code) → score 0% < 50% → exit 1
    const code = await run(['src/a.js', '--min-score', '50'], {
      ...silent,
      config: {
        patterns: [{ pattern: / === /g, replacement: ' !== ', name: '=== → !==' }],
        sources: ['src/a.js'],
        createRunner: vi.fn().mockResolvedValue(runner)
      }
    })

    expect(code).toBe(1)
  })

  it('returns 0 with --min-score 0 even when mutations survive', async () => {
    const sourceCode = 'if (a === b) {}'
    readFileSync.mockImplementation((path, enc) => {
      if (enc === 'utf-8') return sourceCode
      return Buffer.from(sourceCode)
    })

    const runner = {
      run: vi.fn()
        .mockResolvedValueOnce({ passed: true })   // preflight
        .mockResolvedValueOnce({ passed: true }),   // mutation survived
      close: vi.fn().mockResolvedValue(undefined)
    }

    // score 0% >= 0 threshold → exit 0
    const code = await run(['src/a.js', '--min-score', '0'], {
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

describe('isMain', () => {
  it('returns true when argv[1] basename matches the module', () => {
    expect(isMain(['node', '/any/path/mutagen.js'])).toBe(true)
  })

  it('returns true for Windows-style paths', () => {
    expect(isMain(['node', 'C:\\Users\\app\\mutagen.js'])).toBe(true)
  })

  it('returns false when argv[1] is a different script', () => {
    expect(isMain(['node', '/some/other-script.js'])).toBe(false)
  })

  it('returns undefined when argv[1] is missing', () => {
    expect(isMain(['node'])).toBeUndefined()
  })
})

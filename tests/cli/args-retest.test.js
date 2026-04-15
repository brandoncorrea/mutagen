import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../src/cli/args.js'

describe('parseArgs --retest mode', () => {
  it('parses --retest with a report file path', () => {
    const result = parseArgs(['--retest', 'reports/latest.json'])
    expect(result.retestMode).toBe(true)
    expect(result.retestReport).toContain('reports/latest.json')
  })

  it('resolves report path to absolute', () => {
    const result = parseArgs(['--retest', 'reports/latest.json'])
    expect(result.retestReport).toMatch(/^\//)
  })

  it('returns error when no report file provided', () => {
    const result = parseArgs(['--retest'])
    expect(result).toHaveProperty('error')
    expect(result.error).toContain('--retest')
  })

  it('returns error when report file looks like a flag', () => {
    const result = parseArgs(['--retest', '--json'])
    expect(result).toHaveProperty('error')
  })

  it('parses --json flag with --retest', () => {
    const result = parseArgs(['--retest', 'report.json', '--json', 'output.json'])
    expect(result.retestMode).toBe(true)
    expect(result.jsonOutput).toBe('output.json')
  })

  it('parses --timeout with --retest', () => {
    const result = parseArgs(['--retest', 'report.json', '--timeout', '5000'])
    expect(result.timeout).toBe(5000)
  })

  it('parses --parallel with --retest', () => {
    const result = parseArgs(['--retest', 'report.json', '--parallel', '4'])
    expect(result.parallel).toBe(4)
  })

  it('parses --quiet with --retest', () => {
    const result = parseArgs(['--retest', 'report.json', '--quiet'])
    expect(result.quiet).toBe(true)
  })

  it('returns error when --timeout has bad value in retest', () => {
    const result = parseArgs(['--retest', 'report.json', '--timeout', 'abc'])
    expect(result).toHaveProperty('error')
  })

  it('returns error when --parallel has bad value in retest', () => {
    const result = parseArgs(['--retest', 'report.json', '--parallel', 'xyz'])
    expect(result).toHaveProperty('error')
  })
})

import { describe, it, expect } from 'vitest'
import * as publicApi from '../index.js'

describe('public API (index.js)', () => {
  const expectedExports = [
    // Core
    'generateMutations',
    'preparePatterns',

    // Built-in pattern sets
    'patterns',

    // Runner
    'createVitestRunner',

    // CLI harness
    'createManualRunner',

    // Report utilities
    'combineReportData',
    'diffReports'
  ]

  for (const name of expectedExports) {
    it(`exports ${name}`, () => {
      expect(publicApi).toHaveProperty(name)
      const value = publicApi[name]
      if (name === 'patterns')
        expect(typeof value).toBe('object')
      else
        expect(typeof value).toBe('function')
    })
  }

  it('exports exactly the expected API surface', () => {
    const actual = Object.keys(publicApi).sort()
    expect(actual).toEqual([...expectedExports].sort())
  })
})

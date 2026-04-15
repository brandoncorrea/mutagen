import { describe, it, expect } from 'vitest'
import * as publicApi from '../index.js'

describe('public API (index.js)', () => {
  const expectedExports = [
    // Unified mutation API
    'generateMutations',
    'prepareMutationConfig',

    // Built-in AST mutators
    'mutators',

    // Built-in regex pattern sets (secondary mode)
    'patterns',

    // Legacy regex engine
    'generateRegexMutations',
    'preparePatterns',

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
      if (name === 'patterns' || name === 'mutators')
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

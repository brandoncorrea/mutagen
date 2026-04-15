import { describe, it, expect } from 'vitest'
import * as publicApi from '../src/index.js'

describe('public API (index.js)', () => {
  const expectedExports = [
    // Mutation API
    'generateMutations',
    'prepareMutationConfig',

    // AST node pattern matching
    'matchesPattern',

    // Built-in mutators
    'mutators',

    // Runner
    'createVitestRunner',

    // CLI harness
    'createManualRunner',

    // Report utilities
    'combineReportData',
    'diffReports',
    'mutationId'
  ]

  for (const name of expectedExports) {
    it(`exports ${name}`, () => {
      expect(publicApi).toHaveProperty(name)
      const value = publicApi[name]
      if (name === 'mutators')
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

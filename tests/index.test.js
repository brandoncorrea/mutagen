import { describe, it, expect } from 'vitest'
import * as publicApi from '../index.js'

describe('public API (index.js)', () => {
  it('does not export countStatuses', () => {
    expect(publicApi).not.toHaveProperty('countStatuses')
  })

  it('does not export toJsonMutants', () => {
    expect(publicApi).not.toHaveProperty('toJsonMutants')
  })

  it('still exports combineReportData', () => {
    expect(publicApi).toHaveProperty('combineReportData')
    expect(typeof publicApi.combineReportData).toBe('function')
  })
})

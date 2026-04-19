import { describe, it, expect } from 'vitest'
import { fakeRunner, fakePoolRunner } from './helpers.js'

describe('fakeRunner', () => {
  it('returns results in order by call count, not by mutating an array', async () => {
    const results = [{ passed: false }, { passed: true }]
    const runner = fakeRunner(results)

    expect(await runner.run()).toEqual({ passed: false })
    expect(await runner.run()).toEqual({ passed: true })
    // falls back to default after exhausting results
    expect(await runner.run()).toEqual({ passed: true })
  })

  it('does not mutate the input results array', async () => {
    const results = [{ passed: false }, { passed: true }]
    const runner = fakeRunner(results)

    await runner.run()
    await runner.run()

    expect(results).toEqual([{ passed: false }, { passed: true }])
  })
})

describe('fakePoolRunner', () => {
  it('returns results in order by call count, not by mutating an array', async () => {
    const results = [{ passed: false }, { passed: true }]
    const runner = fakePoolRunner(results)

    expect(await runner.run()).toEqual({ passed: false })
    expect(await runner.run()).toEqual({ passed: true })
    // falls back to default after exhausting results
    expect(await runner.run()).toEqual({ passed: true })
  })

  it('does not mutate the input results array', async () => {
    const results = [{ passed: false }, { passed: true }]
    const runner = fakePoolRunner(results)

    await runner.run()
    await runner.run()

    expect(results).toEqual([{ passed: false }, { passed: true }])
  })
})

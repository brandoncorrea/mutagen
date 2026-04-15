/**
 * Tests for result determinism — mutation outcomes must be identical
 * regardless of parallelism level (worker count).
 *
 * Uses real createPool with fake runners whose behavior is deterministic
 * based on mutation content, ensuring outcomes depend only on the mutation
 * itself, not on scheduling order.
 */

import { describe, it, expect, vi } from 'vitest'
import { createPool } from '../../src/core/pool.js'

/**
 * Build a runner whose outcome is determined by the mutation source content.
 * - source containing 'survive' → passed: true
 * - source containing 'timeout' → throws timeout error
 * - anything else → killed (passed: false)
 *
 * Uses closure for state because pool.js passes runner.run as a bare
 * function reference to withTimeout, losing `this` binding.
 */
function deterministicRunner() {
  let currentSource = null
  return {
    run: vi.fn().mockImplementation(() => {
      if (currentSource?.includes('survive'))
        return Promise.resolve({ passed: true, killedBy: [] })
      if (currentSource?.includes('timeout'))
        return Promise.reject(new Error('Mutation timed out after 100ms'))
      return Promise.resolve({ passed: false, killedBy: ['test.js'] })
    }),
    close: vi.fn().mockResolvedValue(),
    applyMutation: vi.fn().mockImplementation(source => {
      currentSource = source
    })
  }
}

function makeMutations(count) {
  const mutations = []
  for (let i = 0; i < count; i++) {
    // Cycle through killed, survived, timedOut
    const kind = i % 3 === 0 ? 'killed' : i % 3 === 1 ? 'survive' : 'timeout'
    mutations.push({
      line: i + 1,
      original: `original-${i}`,
      mutated: `mutated-${i}`,
      name: `mutation-${i}`,
      source: `code-${kind}-${i}`
    })
  }
  return mutations
}

function sortByName(arr) {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name))
}

function outcomeSnapshot(outcomes) {
  return {
    killed: sortByName(outcomes.killed).map(m => m.name),
    survived: sortByName(outcomes.survived).map(m => m.name),
    timedOut: sortByName(outcomes.timedOut).map(m => m.name)
  }
}

describe('result determinism across parallelism levels', () => {
  const mutations = makeMutations(12)

  async function runWithWorkers(workerCount) {
    const pool = createPool({
      workerCount,
      createRunner: () => Promise.resolve(deterministicRunner())
    })
    const outcomes = await pool.run(mutations, { timeout: 100 })
    await pool.close()
    return outcomes
  }

  it('produces identical outcome counts with 1, 2, and 4 workers', async () => {
    const r1 = await runWithWorkers(1)
    const r2 = await runWithWorkers(2)
    const r4 = await runWithWorkers(4)

    // Counts must be identical
    expect(r1.killed.length).toBe(r2.killed.length)
    expect(r1.survived.length).toBe(r2.survived.length)
    expect(r1.timedOut.length).toBe(r2.timedOut.length)

    expect(r2.killed.length).toBe(r4.killed.length)
    expect(r2.survived.length).toBe(r4.survived.length)
    expect(r2.timedOut.length).toBe(r4.timedOut.length)
  })

  it('assigns identical mutation outcomes regardless of worker count', async () => {
    const r1 = outcomeSnapshot(await runWithWorkers(1))
    const r2 = outcomeSnapshot(await runWithWorkers(2))
    const r4 = outcomeSnapshot(await runWithWorkers(4))

    // Same mutations must land in the same outcome bucket
    expect(r1).toEqual(r2)
    expect(r2).toEqual(r4)
  })

  it('is stable across repeated runs with same worker count', async () => {
    const snapshots = []
    for (let i = 0; i < 5; i++)
      snapshots.push(outcomeSnapshot(await runWithWorkers(3)))

    for (let i = 1; i < snapshots.length; i++)
      expect(snapshots[i]).toEqual(snapshots[0])
  })

  it('preserves killedBy metadata regardless of parallelism', async () => {
    const r1 = await runWithWorkers(1)
    const r2 = await runWithWorkers(2)
    const r4 = await runWithWorkers(4)

    const killedBy1 = sortByName(r1.killed).map(m => ({ name: m.name, killedBy: m.killedBy }))
    const killedBy2 = sortByName(r2.killed).map(m => ({ name: m.name, killedBy: m.killedBy }))
    const killedBy4 = sortByName(r4.killed).map(m => ({ name: m.name, killedBy: m.killedBy }))

    expect(killedBy1).toEqual(killedBy2)
    expect(killedBy2).toEqual(killedBy4)
  })

  it('handles all-killed mutations identically', async () => {
    const allKilled = Array.from({ length: 8 }, (_, i) => ({
      line: i + 1,
      original: `orig-${i}`,
      mutated: `mut-${i}`,
      name: `kill-${i}`,
      source: `killed-code-${i}`
    }))

    const pool1 = createPool({ workerCount: 1, createRunner: () => Promise.resolve(deterministicRunner()) })
    const pool4 = createPool({ workerCount: 4, createRunner: () => Promise.resolve(deterministicRunner()) })

    const r1 = await pool1.run(allKilled, { timeout: 100 })
    const r4 = await pool4.run(allKilled, { timeout: 100 })
    await pool1.close()
    await pool4.close()

    expect(r1.killed.length).toBe(8)
    expect(r4.killed.length).toBe(8)
    expect(r1.survived.length).toBe(0)
    expect(r4.survived.length).toBe(0)
    expect(outcomeSnapshot(r1)).toEqual(outcomeSnapshot(r4))
  })

  it('handles all-survived mutations identically', async () => {
    const allSurvived = Array.from({ length: 6 }, (_, i) => ({
      line: i + 1,
      original: `orig-${i}`,
      mutated: `mut-${i}`,
      name: `survive-mut-${i}`,
      source: `survive-code-${i}`
    }))

    const pool1 = createPool({ workerCount: 1, createRunner: () => Promise.resolve(deterministicRunner()) })
    const pool3 = createPool({ workerCount: 3, createRunner: () => Promise.resolve(deterministicRunner()) })

    const r1 = await pool1.run(allSurvived, { timeout: 100 })
    const r3 = await pool3.run(allSurvived, { timeout: 100 })
    await pool1.close()
    await pool3.close()

    expect(r1.survived.length).toBe(6)
    expect(r3.survived.length).toBe(6)
    expect(outcomeSnapshot(r1)).toEqual(outcomeSnapshot(r3))
  })

  it('total mutation count is preserved (no mutations lost or duplicated)', async () => {
    for (const wc of [1, 2, 3, 4, 8]) {
      const outcomes = await runWithWorkers(wc)
      const total = outcomes.killed.length + outcomes.survived.length + outcomes.timedOut.length
      expect(total).toBe(mutations.length)
    }
  })
})

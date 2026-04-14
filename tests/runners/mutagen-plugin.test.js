import { describe, it, expect } from 'vitest'

import { createMutantPlugin } from '../../runners/mutagen-plugin.js'

describe('createMutantPlugin', () => {
  it('returns a vite plugin with name and load hook', () => {
    const { plugin } = createMutantPlugin()

    expect(plugin.name).toBe('mutagen-mutant')
    expect(plugin.enforce).toBe('pre')
    expect(plugin.load).toBeTypeOf('function')
  })

  it('load returns null when no mutant is set', () => {
    const { plugin } = createMutantPlugin()

    expect(plugin.load('/src/a.js')).toBeNull()
  })

  it('load returns mutated source after setMutant', () => {
    const { plugin, setMutant } = createMutantPlugin()

    setMutant('/src/a.js', 'mutated code')

    expect(plugin.load('/src/a.js')).toBe('mutated code')
  })

  it('load returns null for non-matching files', () => {
    const { plugin, setMutant } = createMutantPlugin()

    setMutant('/src/a.js', 'mutated code')

    expect(plugin.load('/src/b.js')).toBeNull()
  })

  it('clearMutant removes the mutant so load returns null', () => {
    const { plugin, setMutant, clearMutant } = createMutantPlugin()

    setMutant('/src/a.js', 'mutated code')
    clearMutant('/src/a.js')

    expect(plugin.load('/src/a.js')).toBeNull()
  })

  it('supports multiple files simultaneously', () => {
    const { plugin, setMutant } = createMutantPlugin()

    setMutant('/src/a.js', 'mutated a')
    setMutant('/src/b.js', 'mutated b')

    expect(plugin.load('/src/a.js')).toBe('mutated a')
    expect(plugin.load('/src/b.js')).toBe('mutated b')
  })

  it('setMutant overwrites previous mutant for same file', () => {
    const { plugin, setMutant } = createMutantPlugin()

    setMutant('/src/a.js', 'first')
    setMutant('/src/a.js', 'second')

    expect(plugin.load('/src/a.js')).toBe('second')
  })
})

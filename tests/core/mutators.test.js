import { describe, it, expect } from 'vitest'
import { javascript } from '../../core/mutators.js'
import { generateMutations } from '../../core/ast-engine.js'

describe('built-in AST mutators', () => {
  it('exports a non-empty javascript array', () => {
    expect(Array.isArray(javascript)).toBe(true)
    expect(javascript.length).toBeGreaterThan(0)
  })

  it('every mutator has type and mutate properties', () => {
    for (const m of javascript) {
      expect(m).toHaveProperty('type')
      expect(typeof m.type).toBe('string')
      expect(m).toHaveProperty('mutate')
      expect(typeof m.mutate).toBe('function')
    }
  })

  it('every mutator.mutate returns an array for matching real nodes', () => {
    // Use the AST engine to verify all mutators work on real source
    const source = 'if (a === b && c || !d) { x += y++ }'
    const mutations = generateMutations(source, javascript)
    expect(Array.isArray(mutations)).toBe(true)
    expect(mutations.length).toBeGreaterThan(0)
  })
})

describe('equality mutators', () => {
  it('mutates === to !==', () => {
    const mutations = generateMutations('if (a === b) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('=== → !==')
  })

  it('mutates !== to ===', () => {
    const mutations = generateMutations('if (a !== b) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('!== → ===')
  })

  it('mutates >= to <', () => {
    const mutations = generateMutations('if (a >= b) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('>= → <')
  })

  it('mutates <= to >', () => {
    const mutations = generateMutations('if (a <= b) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('<= → >')
  })

  it('mutates > to <=', () => {
    const mutations = generateMutations('if (a > b) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('> → <=')
  })

  it('mutates < to >=', () => {
    const mutations = generateMutations('if (a < b) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('< → >=')
  })
})

describe('logical mutators', () => {
  it('mutates && to ||', () => {
    const mutations = generateMutations('if (a && b) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('&& → ||')
  })

  it('mutates || to &&', () => {
    const mutations = generateMutations('if (a || b) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('|| → &&')
  })
})

describe('arithmetic mutators', () => {
  it('mutates + to -', () => {
    const mutations = generateMutations('const x = a + b', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('+ → -')
  })

  it('mutates - to +', () => {
    const mutations = generateMutations('const x = a - b', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('- → +')
  })

  it('mutates * to /', () => {
    const mutations = generateMutations('const x = a * b', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('* → /')
  })

  it('mutates / to *', () => {
    const mutations = generateMutations('const x = a / b', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('/ → *')
  })

  it('mutates % to +', () => {
    const mutations = generateMutations('const x = a % b', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('% → +')
  })

  it('mutates ** to *', () => {
    const mutations = generateMutations('const x = a ** b', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('** → *')
  })
})

describe('boolean literal mutators', () => {
  it('mutates true to false', () => {
    const mutations = generateMutations('const x = true', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('true → false')
  })

  it('mutates false to true', () => {
    const mutations = generateMutations('const x = false', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('false → true')
  })
})

describe('update expression mutators', () => {
  it('mutates ++ to --', () => {
    const mutations = generateMutations('i++', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('++ → --')
  })

  it('mutates -- to ++', () => {
    const mutations = generateMutations('i--', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('-- → ++')
  })
})

describe('assignment mutators', () => {
  it('mutates += to -=', () => {
    const mutations = generateMutations('x += 1', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('+= → -=')
  })

  it('mutates -= to +=', () => {
    const mutations = generateMutations('x -= 1', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('-= → +=')
  })
})

describe('negation mutators', () => {
  it('mutates !x to x', () => {
    const mutations = generateMutations('if (!ready) {}', javascript)
    const names = mutations.map(m => m.name)
    expect(names).toContain('!x → x')
  })
})

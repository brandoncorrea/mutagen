import { describe, it, expect } from 'vitest'
import { preparePatterns, generateMutations } from '../../core/engine.js'
import { typescript } from '../../core/patterns.js'

function findPattern(name) {
  const p = typescript.find(p => p.name === name)
  if (!p) throw new Error(`Pattern not found: ${name}`)
  return p
}

function mutate(patternName, source) {
  const prepared = preparePatterns([findPattern(patternName)])
  return generateMutations(source, prepared)
}

function testMutation(patternName, source, expectedMutated) {
  it(patternName, () => {
    const mutations = mutate(patternName, source)
    expect(mutations, `expected 1 mutation for "${patternName}" on: ${source}`).toHaveLength(1)
    expect(mutations[0].mutated).toBe(expectedMutated)
  })
}

function testNoMutation(patternName, source, reason) {
  it(`${patternName} ${reason}`, () => {
    const mutations = mutate(patternName, source)
    expect(mutations, `expected 0 mutations for "${patternName}" on: ${source}`).toHaveLength(0)
  })
}

describe('typescript mutation patterns', () => {
  describe('Type assertion removal (as)', () => {
    testMutation('as Type → (removed)', 'const x = value as string', 'const x = value')
    testMutation('as Type → (removed)', 'const x = obj as MyType', 'const x = obj')
    testNoMutation('as Type → (removed)', '// cast as string', 'skips comment lines')
  })

  describe('Non-null assertion removal', () => {
    testMutation('x! → x', 'const x = value!', 'const x = value')
    testMutation('x! → x', 'const x = obj!.prop', 'const x = obj.prop')
    testNoMutation('x! → x', 'if (a !== b) {}', 'no match for !==')
  })

  describe('Readonly removal', () => {
    testMutation('readonly → (removed)', '  readonly name: string', 'name: string')
    testMutation('readonly → (removed)', '  readonly count: number', 'count: number')
    testNoMutation('readonly → (removed)', '// readonly field', 'skips comment lines')
  })

  describe('Enum member value swap', () => {
    testMutation('= 0 → = 1 (enum)', '  A = 0,', 'A = 1,')
    testMutation('= 1 → = 0 (enum)', '  B = 1,', 'B = 0,')
  })

  describe('Generic constraint removal', () => {
    testMutation('extends constraint → (removed)', 'function f<T extends Base>(x: T)', 'function f<T>(x: T)')
    testMutation('extends constraint → (removed)', 'class C<T extends Foo>', 'class C<T>')
    testNoMutation('extends constraint → (removed)', 'class C extends Base {', 'no match without angle brackets')
  })

  describe('Interface optionality toggle', () => {
    testMutation('prop? → prop (required)', '  name?: string', 'name: string')
    testNoMutation('prop? → prop (required)', 'const x = a ?? b', 'no match for ??')
  })

  describe('Access modifier swap', () => {
    testMutation('private → public', '  private name: string', 'public name: string')
    testMutation('protected → public', '  protected name: string', 'public name: string')
  })

  describe('Type guard negation', () => {
    testMutation('is Type → is never', 'function isStr(x: any): x is string {', 'function isStr(x: any): x is never {')
  })

  describe('Definite assignment removal', () => {
    testMutation('x!: → x:', '  name!: string', 'name: string')
  })
})

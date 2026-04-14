import { describe, it, expect } from 'vitest'
import picomatch from 'picomatch'

describe('picomatch glob matching', () => {
  it('matches simple file extension patterns', () => {
    const isMatch = picomatch('*.js')
    expect(isMatch('foo.js')).toBe(true)
    expect(isMatch('foo.ts')).toBe(false)
  })

  it('matches nested directory patterns with **', () => {
    const isMatch = picomatch('src/**/*.js')
    expect(isMatch('src/foo.js')).toBe(true)
    expect(isMatch('src/deep/bar.js')).toBe(true)
    expect(isMatch('lib/foo.js')).toBe(false)
  })

  it('supports negation for exclude patterns', () => {
    const isMatch = picomatch('**/*.js')
    const isExcluded = picomatch('node_modules/**')
    expect(isMatch('src/foo.js') && !isExcluded('src/foo.js')).toBe(true)
    expect(isMatch('node_modules/pkg/index.js') && !isExcluded('node_modules/pkg/index.js')).toBe(false)
  })

  it('supports multiple patterns via array', () => {
    const isMatch = picomatch(['src/**/*.js', 'lib/**/*.js'])
    expect(isMatch('src/foo.js')).toBe(true)
    expect(isMatch('lib/bar.js')).toBe(true)
    expect(isMatch('test/baz.js')).toBe(false)
  })

  it('handles posix path separators on all platforms', () => {
    const isMatch = picomatch('src/**/*.js')
    expect(isMatch('src/sub/file.js')).toBe(true)
  })
})

import { readdirSync } from 'node:fs'
import picomatch from 'picomatch'

export function resolveGlobs({ include, exclude = [], cwd = process.cwd() }) {
  const isIncluded = picomatch(include)
  const isExcluded = exclude.length ? picomatch(exclude) : () => false

  return readdirSync(cwd, { recursive: true })
    .map(e => e.replace(/\\/g, '/'))
    .filter(e => isIncluded(e) && !isExcluded(e))
    .sort()
}

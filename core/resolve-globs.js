import { readdirSync } from 'node:fs'
import picomatch from 'picomatch'

export function resolveGlobs({ include, exclude = [], cwd = process.cwd() }) {
  const entries = readdirSync(cwd, { recursive: true })
  const isIncluded = picomatch(include)
  const isExcluded = exclude.length ? picomatch(exclude) : () => false

  return entries
    .map(e => e.replace(/\\/g, '/'))
    .filter(e => isIncluded(e) && !isExcluded(e))
    .sort()
}

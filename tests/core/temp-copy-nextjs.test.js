/**
 * Tests for temp-copy.js — Next.js path aliases, next/jest SWC
 * transform, symlinked node_modules, and copied config resolution.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  realpathSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { createTempCopy } from '../../src/core/temp-copy.js'

/**
 * Creates a minimal Next.js project structure with:
 * - tsconfig.json with @/ path aliases
 * - next.config.js
 * - jest.config.js referencing next/jest
 * - Source files under src/ using @/ imports
 * - node_modules with a mock next package
 */
function makeTempNextProject() {
  const root = mkdtempSync(join(tmpdir(), 'mutagen-nextjs-'))

  // Source files
  mkdirSync(join(root, 'src', 'components'), { recursive: true })
  mkdirSync(join(root, 'src', 'lib'), { recursive: true })
  mkdirSync(join(root, '__tests__'), { recursive: true })

  writeFileSync(
    join(root, 'src', 'lib', 'utils.js'),
    'export function add(a, b) { return a + b }\n'
  )
  writeFileSync(
    join(root, 'src', 'components', 'Button.jsx'),
    "import { add } from '@/lib/utils'\n"
      + 'export function Button() { return add(1, 2) }\n'
  )
  writeFileSync(
    join(root, '__tests__', 'Button.test.jsx'),
    "import { Button } from '@/components/Button'\n"
      + "test('renders', () => { expect(Button()).toBe(3) })\n"
  )

  // tsconfig.json with @/ path aliases
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@/*': ['./src/*']
        },
        jsx: 'preserve',
        module: 'esnext',
        moduleResolution: 'bundler'
      },
      include: ['src/**/*', '__tests__/**/*']
    }, null, 2) + '\n'
  )

  // next.config.js
  writeFileSync(
    join(root, 'next.config.js'),
    '/** @type {import("next").NextConfig} */\n'
      + 'const nextConfig = { reactStrictMode: true }\n'
      + 'module.exports = nextConfig\n'
  )

  // jest.config.js using next/jest
  writeFileSync(
    join(root, 'jest.config.js'),
    "const nextJest = require('next/jest')\n"
      + 'const createJestConfig = nextJest({ dir: "./" })\n'
      + 'module.exports = createJestConfig({\n'
      + "  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },\n"
      + "  testEnvironment: 'jest-environment-jsdom',\n"
      + '})\n'
  )

  // node_modules with mock next package
  mkdirSync(join(root, 'node_modules', 'next'), { recursive: true })
  writeFileSync(
    join(root, 'node_modules', 'next', 'jest.js'),
    'module.exports = function createJestConfig(opts) {\n'
      + '  return (config) => ({ ...config, transform: {} })\n'
      + '}\n'
  )
  writeFileSync(
    join(root, 'node_modules', 'next', 'package.json'),
    JSON.stringify({ name: 'next', version: '14.0.0' }) + '\n'
  )

  // .git directory (should be excluded)
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main')

  return root
}

describe('temp-copy with Next.js project', () => {
  const cleanups = []

  afterEach(() => {
    for (const fn of cleanups) fn()
    cleanups.length = 0
  })

  function tracked(wt) {
    cleanups.push(wt.cleanup)
    return wt
  }

  function withProject() {
    const project = makeTempNextProject()
    cleanups.push(
      () => rmSync(project, { recursive: true, force: true })
    )
    return project
  }

  describe('config file copying', () => {
    it('copies tsconfig.json with path aliases', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const tsconfigPath = join(wt.root, 'tsconfig.json')
      expect(existsSync(tsconfigPath)).toBe(true)

      const tsconfig = JSON.parse(
        readFileSync(tsconfigPath, 'utf-8')
      )
      expect(tsconfig.compilerOptions.paths).toEqual({
        '@/*': ['./src/*']
      })
      expect(tsconfig.compilerOptions.baseUrl).toBe('.')
    })

    it('copies next.config.js', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      expect(existsSync(join(wt.root, 'next.config.js'))).toBe(true)
      const content = readFileSync(
        join(wt.root, 'next.config.js'),
        'utf-8'
      )
      expect(content).toContain('reactStrictMode')
    })

    it('copies jest.config.js referencing next/jest', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      expect(
        existsSync(join(wt.root, 'jest.config.js'))
      ).toBe(true)
      const content = readFileSync(
        join(wt.root, 'jest.config.js'),
        'utf-8'
      )
      expect(content).toContain("require('next/jest')")
      expect(content).toContain('@/(.*)$')
    })
  })

  describe('path alias resolution from temp directory', () => {
    it('tsconfig paths resolve to copied src directory', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const tsconfig = JSON.parse(
        readFileSync(join(wt.root, 'tsconfig.json'), 'utf-8')
      )

      // The baseUrl is "." which means relative to tsconfig
      // location. Since tsconfig is at the temp root, @/* should
      // resolve to <temp-root>/src/*
      const baseUrl = resolve(wt.root, tsconfig.compilerOptions.baseUrl)
      const aliasTarget = tsconfig.compilerOptions.paths['@/*'][0]
      // ./src/* -> resolve from baseUrl
      const resolvedAlias = resolve(
        baseUrl,
        aliasTarget.replace('/*', '')
      )

      expect(resolvedAlias).toBe(join(wt.root, 'src'))
      expect(existsSync(resolvedAlias)).toBe(true)
    })

    it('@/ alias target contains the expected source files', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      // @/lib/utils should resolve to <temp>/src/lib/utils.js
      expect(
        existsSync(join(wt.root, 'src', 'lib', 'utils.js'))
      ).toBe(true)

      // @/components/Button should resolve to
      // <temp>/src/components/Button.jsx
      expect(
        existsSync(join(wt.root, 'src', 'components', 'Button.jsx'))
      ).toBe(true)
    })

    it('source files with @/ imports are copied verbatim', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const button = readFileSync(
        join(wt.root, 'src', 'components', 'Button.jsx'),
        'utf-8'
      )
      expect(button).toContain("from '@/lib/utils'")
    })

    it('test files with @/ imports are copied verbatim', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const test = readFileSync(
        join(wt.root, '__tests__', 'Button.test.jsx'),
        'utf-8'
      )
      expect(test).toContain("from '@/components/Button'")
    })
  })

  describe('symlinked node_modules with next/jest', () => {
    it('node_modules is a symlink, not a copy', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const nmPath = join(wt.root, 'node_modules')
      expect(existsSync(nmPath)).toBe(true)
      expect(lstatSync(nmPath).isSymbolicLink()).toBe(true)
    })

    it('symlink points to original node_modules', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const target = realpathSync(join(wt.root, 'node_modules'))
      expect(target).toBe(
        realpathSync(join(project, 'node_modules'))
      )
    })

    it(
      'next/jest is accessible through symlinked node_modules',
      () => {
        const project = withProject()
        const wt = tracked(createTempCopy(project))

        const nextJestPath = join(
          wt.root,
          'node_modules',
          'next',
          'jest.js'
        )
        expect(existsSync(nextJestPath)).toBe(true)

        const content = readFileSync(nextJestPath, 'utf-8')
        expect(content).toContain('createJestConfig')
      }
    )

    it(
      'next package.json is accessible through symlink',
      () => {
        const project = withProject()
        const wt = tracked(createTempCopy(project))

        const pkgPath = join(
          wt.root,
          'node_modules',
          'next',
          'package.json'
        )
        expect(existsSync(pkgPath)).toBe(true)

        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        expect(pkg.name).toBe('next')
      }
    )
  })

  describe('resolve/unresolve with Next.js paths', () => {
    it('resolve() maps src/components paths correctly', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const original = join(project, 'src', 'components', 'Button.jsx')
      const resolved = wt.resolve(original)

      expect(resolved).toBe(
        join(wt.root, 'src', 'components', 'Button.jsx')
      )
      expect(existsSync(resolved)).toBe(true)
    })

    it('unresolve() maps temp paths back for nested sources', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const tempPath = join(
        wt.root,
        'src',
        'components',
        'Button.jsx'
      )
      expect(wt.unresolve(tempPath)).toBe(
        'src/components/Button.jsx'
      )
    })

    it('mapPaths() handles __tests__ directory paths', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      const tempPaths = [
        join(wt.root, '__tests__', 'Button.test.jsx'),
        join(wt.root, 'src', 'lib', 'utils.js')
      ]

      expect(wt.mapPaths(tempPaths)).toEqual([
        '__tests__/Button.test.jsx',
        'src/lib/utils.js'
      ])
    })
  })

  describe('.git exclusion still applies', () => {
    it('excludes .git from the Next.js project copy', () => {
      const project = withProject()
      const wt = tracked(createTempCopy(project))

      expect(existsSync(join(wt.root, '.git'))).toBe(false)
    })
  })

  describe('extended tsconfig scenarios', () => {
    it('copies tsconfig that extends a base config', () => {
      const project = withProject()

      // Add a base tsconfig that the main one extends
      writeFileSync(
        join(project, 'tsconfig.base.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            esModuleInterop: true
          }
        }, null, 2) + '\n'
      )

      // Update main tsconfig to extend base
      writeFileSync(
        join(project, 'tsconfig.json'),
        JSON.stringify({
          extends: './tsconfig.base.json',
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['./src/*'] }
          }
        }, null, 2) + '\n'
      )

      const wt = tracked(createTempCopy(project))

      // Both configs must be present
      expect(
        existsSync(join(wt.root, 'tsconfig.json'))
      ).toBe(true)
      expect(
        existsSync(join(wt.root, 'tsconfig.base.json'))
      ).toBe(true)

      // The extends path is relative and should still resolve
      const tsconfig = JSON.parse(
        readFileSync(join(wt.root, 'tsconfig.json'), 'utf-8')
      )
      expect(tsconfig.extends).toBe('./tsconfig.base.json')

      const basePath = resolve(
        wt.root,
        tsconfig.extends
      )
      expect(existsSync(basePath)).toBe(true)
    })

    it('copies tsconfig with multiple path aliases', () => {
      const project = withProject()

      mkdirSync(join(project, 'src', 'styles'), { recursive: true })
      writeFileSync(
        join(project, 'src', 'styles', 'globals.css'),
        'body { margin: 0 }\n'
      )

      writeFileSync(
        join(project, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@/*': ['./src/*'],
              '@components/*': ['./src/components/*'],
              '@lib/*': ['./src/lib/*'],
              '@styles/*': ['./src/styles/*']
            }
          }
        }, null, 2) + '\n'
      )

      const wt = tracked(createTempCopy(project))

      const tsconfig = JSON.parse(
        readFileSync(join(wt.root, 'tsconfig.json'), 'utf-8')
      )

      // All aliases must be preserved
      const paths = tsconfig.compilerOptions.paths
      expect(paths['@/*']).toEqual(['./src/*'])
      expect(paths['@components/*']).toEqual([
        './src/components/*'
      ])
      expect(paths['@lib/*']).toEqual(['./src/lib/*'])
      expect(paths['@styles/*']).toEqual(['./src/styles/*'])

      // All alias targets must exist in temp copy
      const baseUrl = resolve(
        wt.root,
        tsconfig.compilerOptions.baseUrl
      )
      for (const [, targets] of Object.entries(paths)) {
        const dir = resolve(
          baseUrl,
          targets[0].replace('/*', '')
        )
        expect(existsSync(dir)).toBe(true)
      }
    })
  })

  describe('next.config.js variants', () => {
    it('copies next.config.mjs (ESM config)', () => {
      const project = withProject()

      writeFileSync(
        join(project, 'next.config.mjs'),
        '/** @type {import("next").NextConfig} */\n'
          + 'const nextConfig = { reactStrictMode: true }\n'
          + 'export default nextConfig\n'
      )

      const wt = tracked(createTempCopy(project))

      expect(
        existsSync(join(wt.root, 'next.config.mjs'))
      ).toBe(true)
      // Original CJS config also present
      expect(
        existsSync(join(wt.root, 'next.config.js'))
      ).toBe(true)
    })
  })
})

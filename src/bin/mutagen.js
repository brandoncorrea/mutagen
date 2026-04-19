#!/usr/bin/env node
/**
 * CLI entry point for mutagen.
 * Loads mutagen.config.js from cwd and delegates to createManualRunner.
 *
 * Usage:
 *   npx mutagen <source>               # Single file
 *   npx mutagen --all                   # All configured sources
 *   npx mutagen --incremental           # Skip unchanged files
 *   npx mutagen --diff a.json b.json    # Compare reports
 *   npx mutagen --version               # Print version
 */

import { resolve, parse as parsePath } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createManualRunner } from '../cli/manual.js'
import { defaultOut } from '../cli/shared.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json')

export async function run(
  args, { config, configPath, out, err = console.error } = {}
) {
  if (!out) out = defaultOut()

  if (versionRequested(args)) {
    out.log(version)
    return 0
  }

  if (!config) {
    const path = configPath || resolve('mutagen.config.js')
    try {
      const mod = await import(pathToFileURL(path).href)
      config = mod.default || mod
    } catch {
      err(`Error: could not load ${path}`)
      err('Create a mutagen.config.js in your project root.')
      return 1
    }
  }

  return createManualRunner({ out, ...config }).run(args)
}

function versionRequested(args) {
  return args.includes('--version') || args.includes('-v')
}

export function isMain(argv) {
  const scriptPath = argv[1]
  if (scriptPath)
    return stemOf(import.meta.url) === stemOf(scriptPath)
}

function stemOf(filepath) {
  return parsePath(filepath.replace(/\\/g, '/')).name
}

/* v8 ignore next 2 */
if (isMain(process.argv))
  process.exit(await run(process.argv.slice(2)))

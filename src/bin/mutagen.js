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
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createManualRunner } from '../cli/manual.js'

export async function run(args, { config, configPath, out = console.log, err = console.error } = {}) {
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

export function isMain(argv) {
  const scriptPath = argv[1]
  if (scriptPath)
    return import.meta.url.endsWith(toBaseName(scriptPath))
}

function toBaseName(path) {
  return path.replace(/.*[\\/]/, '')
}

/* v8 ignore next 2 */
if (isMain(process.argv))
  process.exit(await run(process.argv.slice(2)))

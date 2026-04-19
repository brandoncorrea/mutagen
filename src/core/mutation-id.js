/**
 * Mutation identity utilities.
 * Deterministic hashing and key generation for mutation tracking.
 */

const HASH_LENGTH = 8

import { createHash } from 'node:crypto'

export function mutationId(file, line, name) {
  return createHash('sha256')
    .update(`${file}:${line}:${name}`)
    .digest('hex')
    .slice(0, HASH_LENGTH)
}

export function assignMutationIds(mutations, filePath) {
  for (const mutation of mutations)
    mutation.id = mutationId(filePath, mutation.line, mutation.name)
  return mutations
}

export function mutantKey(path, { location, mutatorName, replacement }) {
  const line = location?.start?.line || 0
  return `${path}:${line}:${mutatorName || ''}:${replacement || ''}`
}

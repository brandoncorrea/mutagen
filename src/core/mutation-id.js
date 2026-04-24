/**
 * Mutation identity utilities.
 * Deterministic hashing for stable mutation tracking across runs.
 */

import { createHash } from 'node:crypto'

const HASH_LENGTH = 8

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

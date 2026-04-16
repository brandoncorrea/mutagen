/**
 * AST-based mutation visitors.
 *
 * Each mutator targets specific ESTree/Babel node types and produces source patches.
 * The AST engine walks the parsed tree, calls test() for matching node types,
 * and applies mutate() patches to generate mutation objects.
 *
 * Mutator interface:
 *   name: string                              — human-readable mutation name
 *   types: string[]                           — ESTree node types to visit
 *   test(node, source, parent) → boolean      — does this node match?
 *   mutate(node, source, parent) → patch|null — { start, end, replacement }
 *
 * The engine splices `replacement` into source at [start, end) to produce
 * the mutated file, then derives { line, original, mutated, name, source }.
 */

import {
  equalityOperators, logicalOperators, arithmeticOperators, updateOperators,
  assignmentMutations, bitwiseOperators, nullishCoalescing, optionalChaining,
  negationRemoval, unaryMinusRemoval, voidRemoval
} from './mutators/operators.js'

import {
  methodExpressions, stringMethodSwaps, mathMethodSwaps, arrayMethodSwaps,
  objectMethodSwaps, stringMethodMutations, typeConversions
} from './mutators/methods.js'

import {
  booleanLiterals, conditionalExpressions, conditionalNegation, stringLiterals,
  blockStatements, asyncMutations, fallbackRemovals, numericBoundary,
  throwRemoval, spreadRemoval, propertyAccessMutations, defaultParameterRemoval,
  newKeywordRemoval
} from './mutators/values.js'

export const javascript = [
  ...equalityOperators,
  ...logicalOperators,
  ...arithmeticOperators,
  ...booleanLiterals,
  ...conditionalExpressions,
  ...conditionalNegation,
  ...methodExpressions,
  ...stringLiterals,
  ...blockStatements,
  ...asyncMutations,
  ...fallbackRemovals,
  ...updateOperators,
  ...optionalChaining,
  ...negationRemoval,
  ...nullishCoalescing,
  ...assignmentMutations,
  ...numericBoundary,
  ...throwRemoval,
  ...stringMethodSwaps,
  ...mathMethodSwaps,
  ...arrayMethodSwaps,
  ...objectMethodSwaps,
  ...stringMethodMutations,
  ...unaryMinusRemoval,
  ...bitwiseOperators,
  ...typeConversions,
  ...spreadRemoval,
  ...voidRemoval,
  ...propertyAccessMutations,
  ...defaultParameterRemoval,
  ...newKeywordRemoval
]

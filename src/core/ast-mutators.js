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
  equalityOperators, looseEqualityOperators, logicalOperators, arithmeticOperators,
  updateOperators, assignmentMutations, bitwiseOperators, nullishCoalescing,
  optionalChaining, negationRemoval, unaryMinusRemoval, voidRemoval,
  bitwiseNotRemoval, instanceofNegation, typeofRemoval
} from './mutators/operators.js'

import {
  methodExpressions, stringMethodSwaps, mathMethodSwaps, arrayMethodSwaps,
  objectMethodSwaps, stringMethodMutations, typeConversions, promiseMethodSwaps,
  objectMutationRemovals, jsonMethodSwaps
} from './mutators/methods.js'

import {
  conditionalExpressions, conditionalNegation, blockStatements,
  asyncMutations, throwRemoval, defaultParameterRemoval, newKeywordRemoval,
  arrowShortCircuit, breakRemoval, continueRemoval, catchBlockEmptying,
  finallyRemoval, emptyReturnRemoval, forInOfSwap, yieldRemoval, deleteRemoval
} from './mutators/statements.js'

import {
  booleanLiterals, stringLiterals, fallbackRemovals, numericBoundary,
  spreadRemoval, propertyAccessMutations, nullUndefinedSwap,
  emptyArrayMutation, templateLiteralMutation
} from './mutators/values.js'

import { regexMutations } from './mutators/regex.js'

export const javascript = [
  ...equalityOperators,
  ...looseEqualityOperators,
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
  ...promiseMethodSwaps,
  ...spreadRemoval,
  ...voidRemoval,
  ...propertyAccessMutations,
  ...defaultParameterRemoval,
  ...regexMutations,
  ...newKeywordRemoval,
  ...arrowShortCircuit,
  ...bitwiseNotRemoval,
  ...instanceofNegation,
  ...typeofRemoval,
  ...breakRemoval,
  ...continueRemoval,
  ...catchBlockEmptying,
  ...finallyRemoval,
  ...emptyReturnRemoval,
  ...forInOfSwap,
  ...yieldRemoval,
  ...deleteRemoval,
  ...nullUndefinedSwap,
  ...emptyArrayMutation,
  ...templateLiteralMutation,
  ...objectMutationRemovals,
  ...jsonMethodSwaps
]

/**
 * Parse Jest --json output into mutation testing results.
 *
 * @param {string} jsonString - Raw stdout from `jest --json`
 * @returns {{ passed: boolean, killedBy: string[], coveredBy: string[] }}
 */
export function parseJestOutput(jsonString) {
  const results = parseTestResults(jsonString)
  const failed = results.filter(isFailure)
  return {
    passed: !failed.length,
    killedBy: getTestPaths(failed),
    coveredBy: getTestPaths(results)
  }
}

function parseTestResults(jsonString) {
  return JSON.parse(jsonString).testResults || []
}

function isFailure(result) {
  return result.status === 'failed'
}

function getTestPaths(results) {
  return results.map(r => r.testFilePath)
}

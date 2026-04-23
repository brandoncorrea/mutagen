/**
 * Parse Jest --json output into mutation testing results.
 *
 * @param {string} jsonString - Raw stdout from `jest --json`
 * @param {string} [stderr] - Raw stderr for diagnostics on parse failure
 * @returns {{ passed: boolean, killedBy: string[], coveredBy: string[] }}
 */
export function parseJestOutput(jsonString, stderr) {
  const results = parseTestResults(jsonString)
  if (!results)
    return { passed: false, killedBy: [], coveredBy: [], stderr }
  const failed = results.filter(isFailure)
  return {
    passed: !failed.length,
    killedBy: getTestPaths(failed),
    coveredBy: getTestPaths(results)
  }
}

function parseTestResults(jsonString) {
  try {
    return JSON.parse(jsonString).testResults || []
  } catch {}
}

function isFailure(result) {
  return result.status === 'failed'
}

function getTestPaths(results) {
  return results.map(result => result.testFilePath)
}

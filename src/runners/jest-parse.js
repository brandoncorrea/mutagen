/**
 * Parse Jest --json output into mutation testing results.
 *
 * @param {string} jsonString - Raw stdout from `jest --json`
 * @returns {{ passed: boolean, killedBy: string[], coveredBy: string[] }}
 */
export function parseJestOutput(jsonString) {
  const data = JSON.parse(jsonString)
  const results = data.testResults || []
  const failed = results.filter(r => r.status === 'failed')
  const passed = failed.length === 0
  return {
    passed,
    killedBy: failed.map(r => r.testFilePath),
    coveredBy: results.map(r => r.testFilePath)
  }
}

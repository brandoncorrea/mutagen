import { execSync } from 'node:child_process'

export function gitChangedFiles({ cwd } = {}) {
  try {
    return gitDiff(cwd)
      .split('\n')
      .map(filePath => filePath.replace(/\\/g, '/'))
      .filter(Boolean)
  } catch {
    return []
  }
}

function gitDiff(cwd) {
  return execSync('git diff --name-only HEAD', {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  })
}

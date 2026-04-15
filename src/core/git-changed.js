import { execSync } from 'node:child_process'

export function gitChangedFiles({ cwd } = {}) {
  try {
    const output = execSync('git diff --name-only HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return output
      .split('\n')
      .map(f => f.replace(/\\/g, '/'))
      .filter(Boolean)
  } catch {
    return []
  }
}

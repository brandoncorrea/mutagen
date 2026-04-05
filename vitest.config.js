import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['core/**/*.js', 'cli/**/*.js', 'runners/**/*.js', 'stryker.js']
    }
  }
})

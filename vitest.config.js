import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 1000,
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js']
    }
  }
})

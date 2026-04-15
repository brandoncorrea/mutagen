import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js']
    }
  }
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80 },
      include: ['src/**'],
      exclude: ['src/server.ts', 'src/scripts/**'],
    },
  },
})

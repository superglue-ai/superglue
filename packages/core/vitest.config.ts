import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 12000000, // 120 minutes for integration tests
    hookTimeout: 180000,   // 3 minutes for setup/teardown hooks
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        'test/**',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
  },
  envDir: '../../',
  build: {
    sourcemap: true,
  }
})
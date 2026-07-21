import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/*.test.ts', 'tests/e2e/*.test.ts'],
    exclude: ['node_modules'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**'],
      thresholds: {
        100: true,
        perFile: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 10000,
    // Several suites intentionally mutate process-wide CLI configuration and network adapters.
    // Serial files keep those acceptance surfaces isolated and prevent worker teardown races.
    fileParallelism: false,
    maxWorkers: 1,
    deps: {
      interopDefault: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    mainFields: ['module', 'main'],
  },
});

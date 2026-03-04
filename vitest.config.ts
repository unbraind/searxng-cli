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
      exclude: ['src/searxng-cli.ts', 'src/types/**'],
      all: true,
    },
    testTimeout: 30000,
    hookTimeout: 10000,
    fileParallelism: true,
    deps: {
      interopDefault: true,
    },
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'node',
      },
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

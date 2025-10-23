import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Global setup/teardown for test database
    globalSetup: ['./tests/globalSetup.js'],
    globalTeardown: ['./tests/globalTeardown.js'],
    // Run tests sequentially to avoid database conflicts with shared auth.db (v4 syntax)
    pool: 'forks',
    maxWorkers: 1, // Run all tests in a single worker
    fileParallelism: false, // Disable parallel file execution
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/TEMPLATE.test.js', // Exclude template file from test runs
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.spec.js',
        '**/*.test.js',
        '**/test/**',
        '**/tests/**',
        'src/server.js', // Exclude main server file
        'src/routes/index.js', // Exclude main routes index file
        'src/migrations/**', // Exclude migrations
        'src/docs/**', // Exclude Swagger docs
        'src/config/**', // Exclude config files
        'src/constants.js', // Exclude constants
        'src/lib/auth.js', // Exclude third-party auth config
      ],
      include: ['src/**/*.js'],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    setupFiles: ['./tests/setup.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '#utils/mqAPI': path.resolve(__dirname, 'src/utils/mqAPI.js'),
    },
  },
});

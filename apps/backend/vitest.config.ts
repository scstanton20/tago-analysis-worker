import { defineConfig } from 'vitest/config';
import type { UserWorkspaceConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shared resolve configuration
const sharedResolve = {
  alias: {
    '#tago-utils': path.resolve(
      __dirname,
      'src/utils/in-process-utils/index.ts',
    ),
  },
};

// Unit tests project - fast, isolated (no auth state)
const unitProject: UserWorkspaceConfig = {
  test: {
    name: 'unit',
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/TEMPLATE.test.ts',
      'tests/**/*.integration.test.ts',
      'tests/integration/**',
      'tests/routes/**', // Routes use real auth, need sequential execution
    ],
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    sequence: {
      groupOrder: 1,
    },
  },
  resolve: sharedResolve,
};

// Route tests project - use real auth, need sequential execution
const routesProject: UserWorkspaceConfig = {
  test: {
    name: 'routes',
    include: ['tests/routes/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    environment: 'node',
    globalSetup: './tests/globalSetup.ts',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    // Route tests run sequentially to avoid auth state conflicts
    pool: 'forks',
    isolate: false,
    fileParallelism: false,
    sequence: {
      groupOrder: 2,
    },
  },
  resolve: sharedResolve,
};

// Integration tests project - real database, file I/O
const integrationProject: UserWorkspaceConfig = {
  test: {
    name: 'integration',
    include: [
      'tests/**/*.integration.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    environment: 'node',
    globalSetup: './tests/globalSetup.ts',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    // Integration tests run sequentially
    pool: 'forks',
    isolate: false,
    fileParallelism: false,
    sequence: {
      groupOrder: 3,
    },
  },
  resolve: sharedResolve,
};

export default defineConfig({
  test: {
    projects: [unitProject, routesProject, integrationProject],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/test/**',
        '**/tests/**',
        'src/server.ts',
        'src/routes/index.ts',
        'src/migrations/**',
        'src/docs/**',
        'src/config/**',
        'src/constants.ts',
        'src/lib/auth.ts',
        // Files pending test coverage - to be addressed in future sprints
        'src/services/analysis/analysisFileService.ts',
        'src/services/analysis/analysisPermissionService.ts',
        'src/utils/analysisWrapper.ts',
      ],
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: sharedResolve,
});

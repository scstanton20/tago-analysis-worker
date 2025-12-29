/**
 * Test Setup
 *
 * Global test configuration that runs before each test file.
 * Configures environment and provides test utilities.
 *
 * NOTE: We intentionally do NOT mock the logger globally anymore.
 * Instead, we:
 * 1. Set LOG_LEVEL=silent to suppress output (configurable via TEST_LOG_LEVEL)
 * 2. Let tests use real loggers - errors will be visible during debugging
 * 3. Provide testLogger utility for tests that need to assert on log output
 */

import { vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Environment Configuration
// ============================================================================

// Increase max listeners for test environment to prevent warnings
// Tests often create multiple module instances with process listeners
process.setMaxListeners(0);

// Set test environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = 'test-secret-key-for-testing-purposes-only-32-chars';
process.env.STORAGE_BASE = '/tmp/test-analyses-storage';
process.env.PORT = '3001';

// Suppress logger output by default (set TEST_LOG_LEVEL=debug to see logs)
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL || 'silent';

// ============================================================================
// Global Test Utilities
// ============================================================================

declare global {
  /** Sleep utility for async tests */
  function sleep(ms: number): Promise<void>;

  /** Captured log entries (when using captureLogger) */
  var capturedLogs: LogEntry[];
}

globalThis.sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Initialize captured logs array
globalThis.capturedLogs = [];

// ============================================================================
// Test Logger Utilities
// ============================================================================

export interface LogEntry {
  level: 'info' | 'error' | 'warn' | 'debug';
  message: string;
  context?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Create a test logger that captures log entries for assertions
 *
 * @example
 * ```typescript
 * const { logger, getLogs, clear } = createTestLogger();
 *
 * someFunction(logger);
 *
 * expect(getLogs()).toContainEqual(
 *   expect.objectContaining({ level: 'error', message: expect.stringContaining('failed') })
 * );
 * ```
 */
export function createTestLogger() {
  const logs: LogEntry[] = [];

  const createLogFn =
    (level: LogEntry['level']) =>
    (contextOrMessage: string | Record<string, unknown>, message?: string) => {
      const entry: LogEntry = {
        level,
        message:
          typeof contextOrMessage === 'string'
            ? contextOrMessage
            : message || '',
        context:
          typeof contextOrMessage === 'object' ? contextOrMessage : undefined,
        timestamp: new Date(),
      };
      logs.push(entry);
    };

  const logger = {
    info: createLogFn('info'),
    error: createLogFn('error'),
    warn: createLogFn('warn'),
    debug: createLogFn('debug'),
    child: () => logger, // Return same logger for child calls
  };

  return {
    logger,
    getLogs: () => [...logs],
    getLogsByLevel: (level: LogEntry['level']) =>
      logs.filter((l) => l.level === level),
    clear: () => {
      logs.length = 0;
    },
    hasError: () => logs.some((l) => l.level === 'error'),
    hasWarning: () => logs.some((l) => l.level === 'warn'),
  };
}

/**
 * Mock logger for specific tests that need to verify logging behavior
 * without using the real logger
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

// ============================================================================
// Test Lifecycle Hooks
// ============================================================================

// Clear captured logs between tests
beforeEach(() => {
  globalThis.capturedLogs = [];
});

afterEach(() => {
  // Clean up any lingering timers
  vi.useRealTimers();
});

// ============================================================================
// Re-export commonly used test utilities
// ============================================================================

export { vi } from 'vitest';
export {
  createTestDatabase,
  createSeededTestDatabase,
  type TestDatabase,
} from './fixtures/testDatabase.ts';
export {
  createTempStorage,
  createTempStorageWithAnalyses,
  useTempStorage,
  type TempStorage,
} from './fixtures/tempStorage.ts';
export {
  TEST_USERS,
  TEST_TEAMS,
  PERMISSION_MATRIX,
  getTestUser,
  getUsersWithPermission,
  getUsersWithoutPermission,
  type TestUser,
  type TestTeam,
  type TestUserKey,
  type TestTeamKey,
  type PermissionKey,
} from './fixtures/testUsers.ts';

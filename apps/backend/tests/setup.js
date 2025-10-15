import { vi } from 'vitest';

// Increase max listeners for test environment to prevent warnings
// Tests often create multiple module instances with process listeners
// Set to 0 (unlimited) for test environment
process.setMaxListeners(0);

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = 'test-secret-key-for-testing-purposes-only-32-chars';
process.env.STORAGE_BASE = '/tmp/test-analyses-storage';
process.env.PORT = '3001';

// Mock logger to prevent console output during tests
vi.mock('../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  })),
  parseLogLine: vi.fn((line, returnObject) => {
    if (returnObject) {
      return {
        timestamp: '2025-01-01 00:00:00',
        message: 'test log',
        date: new Date('2025-01-01'),
      };
    }
    return '[2025-01-01 00:00:00] test log';
  }),
}));

// Global test utilities
global.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

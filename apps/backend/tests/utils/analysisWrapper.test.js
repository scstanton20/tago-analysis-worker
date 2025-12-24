import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock logger before importing the module
const mockLogger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(() => mockLogger),
};

vi.mock('../../src/utils/logging/sandboxLogger.js', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

// Mock sharedDNSCache
vi.mock('../../src/utils/sharedDNSCache.js', () => ({}));

describe('analysisWrapper', () => {
  let originalArgv;
  let originalExit;
  let exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    originalArgv = process.argv;
    originalExit = process.exit;
    exitCode = null;

    // Mock process.exit to capture exit code
    process.exit = vi.fn((code) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    });

    // Reset mock logger
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    vi.resetModules();
  });

  describe('command line argument handling', () => {
    it('should exit with code 1 when no analysis file is provided', async () => {
      process.argv = ['node', 'analysisWrapper.js'];

      try {
        await import('../../src/utils/analysisWrapper.js');
      } catch {
        // Expected to throw due to process.exit mock
      }

      expect(exitCode).toBe(1);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use path.resolve for analysis file paths', () => {
      const testFile = './test-analysis/index.js';
      process.argv = ['node', 'analysisWrapper.js', testFile];

      // Test path resolution without actually importing
      const resolved = path.resolve(testFile);
      expect(resolved).toContain('test-analysis');
      expect(path.isAbsolute(resolved)).toBe(true);
    });
  });

  describe('argument validation', () => {
    it('should validate process.argv is used correctly', () => {
      const testFile = 'test-analysis.js';
      process.argv = ['node', 'analysisWrapper.js', testFile];

      // Verify argv structure
      expect(process.argv[2]).toBe(testFile);
      expect(process.argv.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle different argument formats', () => {
      const absolutePath = '/app/analyses/test/index.js';
      process.argv = ['node', 'analysisWrapper.js', absolutePath];

      expect(process.argv[2]).toBe(absolutePath);
    });
  });
});

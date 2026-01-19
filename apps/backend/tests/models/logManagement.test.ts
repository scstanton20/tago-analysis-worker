/**
 * LogManagement Tests
 *
 * Tests the LogManager class which handles log file management,
 * in-memory log buffering, and log rotation.
 *
 * Uses real pino (with LOG_LEVEL=silent) instead of mocking.
 * Only filesystem operations and SSE are mocked to enable isolated testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockLogger } from '../setup.ts';

// Mock filesystem operations (we don't want real file I/O in unit tests)
vi.mock('../../src/utils/safePath.ts', () => ({
  safeMkdir: vi.fn().mockResolvedValue(undefined),
  safeStat: vi.fn().mockResolvedValue({
    size: 1024,
    isFile: () => true,
  }),
  safeUnlink: vi.fn().mockResolvedValue(undefined),
  safeReadFile: vi.fn().mockResolvedValue(''),
  safeWriteFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock SSE to avoid broadcasting during tests
vi.mock('../../src/utils/sse/index.ts', () => ({
  sseManager: {
    broadcastUpdate: vi.fn().mockResolvedValue(undefined),
    broadcastAnalysisUpdate: vi.fn().mockResolvedValue(undefined),
    broadcastAnalysisLog: vi.fn(),
    broadcastAnalysisStats: vi.fn(),
    broadcast: vi.fn(),
  },
}));

const { safeMkdir, safeStat, safeReadFile, safeWriteFile, safeUnlink } =
  await import('../../src/utils/safePath.ts');
const { sseManager } = await import('../../src/utils/sse/index.ts');

const { LogManager } =
  await import('../../src/models/analysisProcess/LogManagement.ts');

describe('LogManagement', () => {
  let mockAnalysisProcess: {
    analysisId: string;
    analysisName: string;
    logFile: string;
    logs: unknown[];
    logSequence: number;
    totalLogCount: number;
    maxMemoryLogs: number;
    fileLogger: ReturnType<typeof createMockLogger> | null;
    fileLoggerStream: unknown;
    logger: ReturnType<typeof createMockLogger>;
  };

  let mockConfig: {
    paths: { analysis: string };
  };

  let logManager: InstanceType<typeof LogManager>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAnalysisProcess = {
      analysisId: 'test-analysis-id',
      analysisName: 'test-analysis',
      logFile: '/tmp/test/logs/analysis.log',
      logs: [],
      logSequence: 0,
      totalLogCount: 0,
      maxMemoryLogs: 100,
      fileLogger: createMockLogger(),
      fileLoggerStream: null,
      logger: createMockLogger(),
    };

    mockConfig = {
      paths: { analysis: '/tmp/test' },
    };

    logManager = new LogManager(
      mockAnalysisProcess as never,
      mockConfig as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize log manager correctly', () => {
      expect(logManager).toBeDefined();
    });
  });

  describe('initializeFileLogger', () => {
    it('should handle initialization errors gracefully', () => {
      // Force an error by making safeMkdir fail
      (safeMkdir as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Failed to create directory'),
      );

      // Should not throw
      expect(() => logManager.initializeFileLogger()).not.toThrow();
    });
  });

  describe('addLog', () => {
    it('should add log entry to memory buffer', async () => {
      await logManager.addLog('Test message');

      expect(mockAnalysisProcess.logs).toHaveLength(1);
      expect((mockAnalysisProcess.logs[0] as { message: string }).message).toBe(
        'Test message',
      );
      expect(mockAnalysisProcess.totalLogCount).toBe(1);
      expect(mockAnalysisProcess.logSequence).toBe(1);
    });

    it('should broadcast log via SSE', async () => {
      await logManager.addLog('Test message');

      expect(sseManager.broadcastAnalysisLog).toHaveBeenCalledWith(
        'test-analysis-id',
        expect.objectContaining({
          type: 'log',
          data: expect.objectContaining({
            analysisId: 'test-analysis-id',
            analysisName: 'test-analysis',
            log: expect.any(Object),
          }),
        }),
      );
    });

    it('should evict oldest log when buffer is full', async () => {
      mockAnalysisProcess.maxMemoryLogs = 3;

      await logManager.addLog('Message 1');
      await logManager.addLog('Message 2');
      await logManager.addLog('Message 3');
      await logManager.addLog('Message 4');

      expect(mockAnalysisProcess.logs).toHaveLength(3);
      // Newest first (FIFO)
      expect((mockAnalysisProcess.logs[0] as { message: string }).message).toBe(
        'Message 4',
      );
    });

    it('should write to file logger when available', async () => {
      await logManager.addLog('Test message');

      expect(mockAnalysisProcess.fileLogger?.info).toHaveBeenCalledWith(
        'Test message',
      );
    });

    it('should warn when file logger is not available', async () => {
      mockAnalysisProcess.fileLogger = null;

      await logManager.addLog('Test message');

      expect(mockAnalysisProcess.logger.warn).toHaveBeenCalled();
    });
  });

  describe('getMemoryLogs', () => {
    it('should return paginated logs', async () => {
      await logManager.addLog('Log 1');
      await logManager.addLog('Log 2');
      await logManager.addLog('Log 3');

      const result = logManager.getMemoryLogs(1, 2);

      expect(result.logs).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.totalCount).toBe(3);
    });

    it('should handle empty logs', () => {
      const result = logManager.getMemoryLogs(1, 10);

      expect(result.logs).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.totalCount).toBe(0);
    });

    it('should handle page beyond available data', async () => {
      await logManager.addLog('Log 1');
      await logManager.addLog('Log 2');

      const result = logManager.getMemoryLogs(5, 10);

      expect(result.logs).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('should use default pagination values', async () => {
      await logManager.addLog('Log 1');

      const result = logManager.getMemoryLogs();

      expect(result.logs).toHaveLength(1);
    });
  });

  describe('initializeLogState', () => {
    it('should handle missing log file gracefully', async () => {
      const error = new Error('File not found') as Error & { code: string };
      error.code = 'ENOENT';
      (safeStat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

      await expect(logManager.initializeLogState()).resolves.not.toThrow();

      expect(mockAnalysisProcess.totalLogCount).toBe(0);
      expect(mockAnalysisProcess.logs).toEqual([]);
    });

    it('should load existing logs from file', async () => {
      const mockLogs = [
        '{"time":"2025-01-01T00:00:00.000Z","msg":"Log 1"}',
        '{"time":"2025-01-01T00:00:01.000Z","msg":"Log 2"}',
      ].join('\n');

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockLogs,
      );

      await logManager.initializeLogState();

      expect(mockAnalysisProcess.totalLogCount).toBe(2);
      expect(mockAnalysisProcess.logs).toHaveLength(2);
    });

    it('should handle oversized log files', async () => {
      // 60MB file - over the 50MB limit
      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 60 * 1024 * 1024,
      });

      await logManager.initializeLogState();

      expect(safeUnlink).toHaveBeenCalled();
      expect(mockAnalysisProcess.logger.warn).toHaveBeenCalled();
    });

    it('should handle non-ENOENT errors', async () => {
      const error = new Error('Permission denied') as Error & { code: string };
      error.code = 'EACCES';
      (safeStat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

      await expect(logManager.initializeLogState()).resolves.not.toThrow();

      expect(mockAnalysisProcess.logger.error).toHaveBeenCalled();
    });

    it('should skip malformed log lines', async () => {
      const mockLogs = [
        '{"time":"2025-01-01T00:00:00.000Z","msg":"Log 1"}',
        'invalid json line',
        '{"time":"2025-01-01T00:00:02.000Z","msg":"Log 3"}',
      ].join('\n');

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockLogs,
      );

      await logManager.initializeLogState();

      expect(mockAnalysisProcess.totalLogCount).toBe(3);
      // Only 2 valid entries should be in memory
      expect(mockAnalysisProcess.logs).toHaveLength(2);
    });

    it('should skip log entries with missing time or msg', async () => {
      const mockLogs = [
        '{"time":"2025-01-01T00:00:00.000Z","msg":"Valid log"}',
        '{"time":"2025-01-01T00:00:01.000Z"}', // Missing msg
        '{"msg":"No time"}', // Missing time
      ].join('\n');

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockLogs,
      );

      await logManager.initializeLogState();

      // Only the valid entry should be parsed
      expect(mockAnalysisProcess.logs).toHaveLength(1);
    });
  });

  describe('runtime log rotation', () => {
    it('should check for rotation periodically when size is high', async () => {
      // Set up for rotation check
      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024; // Over 50MB limit

      // Mock stat to return file size
      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 60 * 1024 * 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValue('');

      // Add 101 logs to trigger rotation check (LOG_SIZE_CHECK_INTERVAL = 100)
      for (let i = 0; i < 101; i++) {
        await logManager.addLog('test message');
      }

      // safeStat should be called for size verification
      expect(safeStat).toHaveBeenCalled();
    });

    it('should not check rotation if below interval threshold', async () => {
      // Add fewer than 100 logs
      for (let i = 0; i < 50; i++) {
        await logManager.addLog('test message');
      }

      // safeStat should not be called for rotation check
      // (it's only called during initialization)
      expect((safeStat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });

    it('should rotate log file when size exceeds limit', async () => {
      const mockStream = {
        flush: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      };
      mockAnalysisProcess.fileLoggerStream = mockStream;

      // Set estimated size over limit
      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      // Mock file size verification to confirm large file
      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 60 * 1024 * 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        '{"time":"2025-01-01T00:00:00.000Z","msg":"test"}\n',
      );

      await logManager.addLog('trigger rotation');

      // Should have written the preserved content back
      expect(safeWriteFile).toHaveBeenCalled();
    });

    it('should handle ENOENT during rotation size check', async () => {
      const error = new Error('File not found') as Error & { code: string };
      error.code = 'ENOENT';

      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      (safeStat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

      // Should not throw
      await expect(logManager.addLog('test message')).resolves.not.toThrow();

      // Should reset estimated size
      expect(
        (logManager as unknown as { estimatedFileSize: number })
          .estimatedFileSize,
      ).toBe(0);
    });

    it('should prevent concurrent rotation', async () => {
      const mockStream = {
        flush: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      };
      mockAnalysisProcess.fileLoggerStream = mockStream;

      // Set up for rotation
      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;
      (logManager as unknown as { isRotating: boolean }).isRotating = true;

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 60 * 1024 * 1024,
      });

      await logManager.addLog('test message');

      // Should not call rotation-related functions
      expect(safeReadFile).not.toHaveBeenCalled();
    });

    it('should preserve recent logs during rotation', async () => {
      const mockStream = {
        flush: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      };
      mockAnalysisProcess.fileLoggerStream = mockStream;

      // Create multiple log lines
      const logLines = [];
      for (let i = 0; i < 150; i++) {
        logLines.push(
          `{"time":"2025-01-01T00:00:0${String(i).padStart(2, '0')}.000Z","msg":"Log ${i}"}`,
        );
      }

      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 60 * 1024 * 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        logLines.join('\n'),
      );

      await logManager.addLog('trigger rotation');

      // Should preserve last 100 lines (ROTATION_PRESERVE_LINES = 100)
      expect(safeWriteFile).toHaveBeenCalled();
    });

    it('should handle read errors during rotation gracefully', async () => {
      const mockStream = {
        flush: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      };
      mockAnalysisProcess.fileLoggerStream = mockStream;

      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 60 * 1024 * 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Read error'),
      );

      // Should not throw
      await expect(logManager.addLog('test message')).resolves.not.toThrow();
      expect(mockAnalysisProcess.logger.warn).toHaveBeenCalled();
    });

    it('should broadcast rotation event via SSE', async () => {
      const mockStream = {
        flush: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      };
      mockAnalysisProcess.fileLoggerStream = mockStream;

      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 60 * 1024 * 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        '{"time":"2025-01-01T00:00:00.000Z","msg":"test"}\n',
      );

      await logManager.addLog('trigger rotation');

      // Should broadcast logsCleared event via global broadcast
      expect(sseManager.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'logsCleared',
          data: expect.objectContaining({
            analysisId: 'test-analysis-id',
            analysisName: 'test-analysis',
            reason: 'rotation',
          }),
        }),
      );
    });
  });

  describe('safeStat result validation', () => {
    it('should handle safeStat returning non-FileStats during rotation check', async () => {
      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      // Return something that's not FileStats (null, undefined, or object without size)
      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      // Should not throw and should not trigger rotation
      await expect(logManager.addLog('test message')).resolves.not.toThrow();
      expect(safeWriteFile).not.toHaveBeenCalled();
    });

    it('should handle safeStat returning object without size property', async () => {
      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      // Return object without size property
      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        isFile: () => true,
      });

      await expect(logManager.addLog('test message')).resolves.not.toThrow();
      expect(safeWriteFile).not.toHaveBeenCalled();
    });

    it('should handle safeStat returning invalid stats during initializeLogState', async () => {
      // Return object without proper size property
      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        notSize: 1024,
      });

      await logManager.initializeLogState();

      // Should start fresh with empty logs
      expect(mockAnalysisProcess.totalLogCount).toBe(0);
      expect(mockAnalysisProcess.logSequence).toBe(0);
      expect(mockAnalysisProcess.logs).toEqual([]);
    });
  });

  describe('loadExistingLogs edge cases', () => {
    it('should handle safeReadFile returning non-string content', async () => {
      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 1024,
      });
      // Return something that's not a string (e.g., Buffer)
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        Buffer.from('test'),
      );

      await expect(logManager.initializeLogState()).resolves.not.toThrow();

      // Should log error about non-string content
      expect(mockAnalysisProcess.logger.error).toHaveBeenCalled();
    });

    it('should re-throw non-ENOENT errors during log loading', async () => {
      const error = new Error('Disk full') as Error & { code: string };
      error.code = 'ENOSPC';

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 1024,
      });
      (safeReadFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

      // initializeLogState catches this at the outer level
      await expect(logManager.initializeLogState()).resolves.not.toThrow();

      // The error should have been logged (as non-ENOENT error)
      expect(mockAnalysisProcess.logger.error).toHaveBeenCalled();
    });
  });

  describe('rotation content handling', () => {
    it('should handle non-string content during rotation', async () => {
      const mockStream = {
        flush: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      };
      mockAnalysisProcess.fileLoggerStream = mockStream;

      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 60 * 1024 * 1024,
      });
      // Return Buffer instead of string
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        Buffer.from('test'),
      );

      await expect(logManager.addLog('test message')).resolves.not.toThrow();

      // Should warn about preservation failure
      expect(mockAnalysisProcess.logger.warn).toHaveBeenCalled();
    });

    it('should handle empty log file during rotation', async () => {
      const mockStream = {
        flush: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      };
      mockAnalysisProcess.fileLoggerStream = mockStream;

      (
        logManager as unknown as { estimatedFileSize: number }
      ).estimatedFileSize = 60 * 1024 * 1024;
      (
        logManager as unknown as { logsSinceLastCheck: number }
      ).logsSinceLastCheck = 100;

      (safeStat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        size: 60 * 1024 * 1024,
      });
      // Return empty string
      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

      await expect(logManager.addLog('test message')).resolves.not.toThrow();

      // Should write empty preserved content
      expect(safeWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        '',
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe('log entry format', () => {
    it('should create log entries with correct structure', async () => {
      await logManager.addLog('Test message');

      const logEntry = mockAnalysisProcess.logs[0] as {
        sequence: number;
        timestamp: string;
        message: string;
        createdAt: number;
      };

      expect(logEntry.sequence).toBe(1);
      expect(logEntry.timestamp).toBeDefined();
      expect(logEntry.message).toBe('Test message');
      expect(logEntry.createdAt).toBeDefined();
      expect(typeof logEntry.createdAt).toBe('number');
    });

    it('should increment sequence for each log', async () => {
      await logManager.addLog('Message 1');
      await logManager.addLog('Message 2');
      await logManager.addLog('Message 3');

      expect(mockAnalysisProcess.logSequence).toBe(3);
      expect(
        (mockAnalysisProcess.logs[0] as { sequence: number }).sequence,
      ).toBe(3);
      expect(
        (mockAnalysisProcess.logs[2] as { sequence: number }).sequence,
      ).toBe(1);
    });
  });
});

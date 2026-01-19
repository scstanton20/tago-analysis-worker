/**
 * AnalysisLogService Tests
 *
 * Tests the log management service for analysis processes.
 * Covers adding, retrieving, clearing, and downloading logs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { EventEmitter } from 'events';

// Create hoisted mocks
const {
  mockConfigService,
  mockFs,
  mockSseManager,
  mockSafeReadFile,
  mockSafeWriteFile,
  mockParseLogLine,
} = vi.hoisted(() => ({
  mockConfigService: {
    getAnalysisProcess: vi.fn(),
    saveConfig: vi.fn(),
  },
  mockFs: {
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
  mockSseManager: {
    broadcastAnalysisUpdate: vi.fn(),
  },
  mockSafeReadFile: vi.fn(),
  mockSafeWriteFile: vi.fn(),
  mockParseLogLine: vi.fn(),
}));

// Create a mock readline interface
class MockReadlineInterface extends EventEmitter {
  close() {
    this.emit('close');
  }
}

// Mock fs module
vi.mock('fs', () => ({
  promises: mockFs,
  createReadStream: vi.fn(() => {
    const readable = new Readable({
      read() {
        this.push(null);
      },
    });
    return readable;
  }),
}));

// Mock readline
vi.mock('readline', () => ({
  createInterface: vi.fn(() => new MockReadlineInterface()),
}));

// Mock config
vi.mock('../../src/config/default.ts', () => ({
  config: {
    paths: {
      analysis: '/tmp/test-analyses',
    },
  },
}));

// Mock safePath utilities
vi.mock('../../src/utils/safePath.ts', () => ({
  safeReadFile: mockSafeReadFile,
  safeWriteFile: mockSafeWriteFile,
}));

// Mock logger
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  parseLogLine: mockParseLogLine,
}));

// Mock lazyLoader
vi.mock('../../src/utils/lazyLoader.ts', () => ({
  getSseManager: vi.fn(async () => mockSseManager),
}));

// Mock constants
vi.mock('../../src/constants.ts', () => ({
  ANALYSIS_SERVICE: {
    DEFAULT_LOGS_LIMIT: 100,
    DEFAULT_PAGINATION_LIMIT: 50,
    LOG_REVERSE_SORT_BUFFER: 100,
  },
}));

// Mock validation schemas
vi.mock('../../src/validation/analysisSchemas.ts', () => ({
  LOG_TIME_RANGE_VALUES: ['all', '1h', '24h', '7d', '30d'] as const,
}));

// Import after mocks
import {
  AnalysisLogService,
  createAnalysisLogService,
} from '../../src/services/analysis/AnalysisLogService.ts';
import type { IAnalysisConfigService } from '../../src/services/analysis/types.ts';

// Helper to create a mock analysis process
function createMockAnalysisProcess(overrides = {}) {
  return {
    analysisId: 'test-analysis-id',
    analysisName: 'Test Analysis',
    logs: [],
    logSequence: 0,
    totalLogCount: 0,
    addLog: vi.fn(),
    getMemoryLogs: vi.fn().mockReturnValue({ logs: [], totalCount: 0 }),
    ...overrides,
  };
}

describe('AnalysisLogService', () => {
  let service: AnalysisLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalysisLogService(
      mockConfigService as unknown as IAnalysisConfigService,
    );
  });

  describe('constructor and factory', () => {
    it('should create service via factory function', () => {
      const factoryService = createAnalysisLogService(
        mockConfigService as unknown as IAnalysisConfigService,
      );
      expect(factoryService).toBeInstanceOf(AnalysisLogService);
    });
  });

  describe('validateTimeRange', () => {
    it('should return true for valid time ranges', () => {
      expect(service.validateTimeRange('all')).toBe(true);
      expect(service.validateTimeRange('1h')).toBe(true);
      expect(service.validateTimeRange('24h')).toBe(true);
      expect(service.validateTimeRange('7d')).toBe(true);
      expect(service.validateTimeRange('30d')).toBe(true);
    });

    it('should return false for invalid time ranges', () => {
      expect(service.validateTimeRange('invalid')).toBe(false);
      expect(service.validateTimeRange('')).toBe(false);
      expect(service.validateTimeRange('2h')).toBe(false);
      expect(service.validateTimeRange('14d')).toBe(false);
    });
  });

  describe('addLog', () => {
    it('should add log to existing analysis', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      await service.addLog('test-id', 'Test message');

      expect(mockConfigService.getAnalysisProcess).toHaveBeenCalledWith(
        'test-id',
      );
      expect(mockAnalysis.addLog).toHaveBeenCalledWith('Test message');
    });

    it('should do nothing if analysis not found', async () => {
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      await service.addLog('nonexistent-id', 'Test message');

      expect(mockConfigService.getAnalysisProcess).toHaveBeenCalledWith(
        'nonexistent-id',
      );
      // No error thrown, just returns silently
    });
  });

  describe('getInitialLogs', () => {
    it('should return empty logs when analysis not found', async () => {
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      const result = await service.getInitialLogs('nonexistent-id');

      expect(result).toEqual({ logs: [], totalCount: 0 });
    });

    it('should return logs from memory when analysis exists', async () => {
      const mockLogs = [
        {
          sequence: 1,
          message: 'Log 1',
          timestamp: '10:00:00',
          createdAt: Date.now(),
        },
        {
          sequence: 2,
          message: 'Log 2',
          timestamp: '10:00:01',
          createdAt: Date.now(),
        },
      ];
      const mockAnalysis = createMockAnalysisProcess({
        getMemoryLogs: vi
          .fn()
          .mockReturnValue({ logs: mockLogs, totalCount: 2 }),
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const result = await service.getInitialLogs('test-id', 100);

      expect(result.logs).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(mockAnalysis.getMemoryLogs).toHaveBeenCalledWith(1, 100);
    });

    it('should use default limit when not provided', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        getMemoryLogs: vi.fn().mockReturnValue({ logs: [], totalCount: 0 }),
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      await service.getInitialLogs('test-id');

      expect(mockAnalysis.getMemoryLogs).toHaveBeenCalledWith(1, 100); // DEFAULT_LOGS_LIMIT
    });
  });

  describe('getLogs', () => {
    it('should throw error when analysis not found', async () => {
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      await expect(service.getLogs('nonexistent-id')).rejects.toThrow(
        'Analysis not found',
      );
    });

    it('should return memory logs for page 1 when available', async () => {
      const mockLogs = [
        {
          sequence: 1,
          message: 'Log 1',
          timestamp: '10:00:00',
          createdAt: Date.now(),
        },
      ];
      const mockAnalysis = createMockAnalysisProcess({
        getMemoryLogs: vi
          .fn()
          .mockReturnValue({ logs: mockLogs, totalCount: 1 }),
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const result = await service.getLogs('test-id', 1, 50);

      expect(result.logs).toHaveLength(1);
      expect(result.source).toBe('memory');
      expect(result.hasMore).toBe(false);
    });

    it('should indicate hasMore when totalCount exceeds limit', async () => {
      const mockLogs = [
        {
          sequence: 1,
          message: 'Log 1',
          timestamp: '10:00:00',
          createdAt: Date.now(),
        },
      ];
      const mockAnalysis = createMockAnalysisProcess({
        getMemoryLogs: vi
          .fn()
          .mockReturnValue({ logs: mockLogs, totalCount: 100 }),
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const result = await service.getLogs('test-id', 1, 50);

      expect(result.hasMore).toBe(true);
      expect(result.totalCount).toBe(100);
    });

    it('should fall through to file reading when memory is empty for page 1', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        getMemoryLogs: vi.fn().mockReturnValue({ logs: [], totalCount: 0 }),
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      // Mock file not found
      mockFs.access.mockRejectedValue({ code: 'ENOENT' });

      const result = await service.getLogs('test-id', 1, 50);

      expect(result.source).toBe('file');
      expect(result.logs).toEqual([]);
    });
  });

  describe('clearLogs', () => {
    it('should throw error when analysis not found', async () => {
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      await expect(service.clearLogs('nonexistent-id')).rejects.toThrow(
        'Analysis not found',
      );
    });

    it('should clear logs and broadcast update', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        logs: [{ message: 'old log' }],
        logSequence: 5,
        totalLogCount: 10,
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);
      mockSafeWriteFile.mockResolvedValue(undefined);

      const result = await service.clearLogs('test-id');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Logs cleared successfully');
      expect(mockSafeWriteFile).toHaveBeenCalledWith(
        '/tmp/test-analyses/test-id/logs/analysis.log',
        '',
        '/tmp/test-analyses',
      );
      expect(mockAnalysis.logs).toEqual([]);
      expect(mockAnalysis.logSequence).toBe(0);
      expect(mockAnalysis.totalLogCount).toBe(0);
      expect(mockSseManager.broadcastAnalysisUpdate).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          type: 'logsCleared',
        }),
      );
    });

    it('should skip broadcast when broadcast option is false', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);
      mockSafeWriteFile.mockResolvedValue(undefined);

      await service.clearLogs('test-id', { broadcast: false });

      expect(mockSseManager.broadcastAnalysisUpdate).not.toHaveBeenCalled();
    });

    it('should throw error when file write fails', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);
      mockSafeWriteFile.mockRejectedValue(new Error('Write failed'));

      await expect(service.clearLogs('test-id')).rejects.toThrow(
        'Failed to clear logs: Write failed',
      );
    });
  });

  describe('getLogsForDownload', () => {
    it('should return all logs when timeRange is "all"', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockSafeReadFile.mockResolvedValue(
        '{"timestamp":"2024-01-01T10:00:00","msg":"Log 1"}\n{"timestamp":"2024-01-01T10:00:01","msg":"Log 2"}',
      );
      mockParseLogLine.mockImplementation(
        (_line: string, withDate: boolean) => {
          if (withDate) {
            return {
              timestamp: '10:00:00',
              message: 'Parsed log',
              date: new Date(),
            };
          }
          return '[10:00:00] Parsed log';
        },
      );

      const result = await service.getLogsForDownload('test-id', 'all');

      expect(result.logFile).toBe(
        '/tmp/test-analyses/test-id/logs/analysis.log',
      );
      expect(result.content).toContain('[10:00:00] Parsed log');
    });

    it('should filter logs by 1h time range', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago
      const oldDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

      mockFs.access.mockResolvedValue(undefined);
      mockSafeReadFile.mockResolvedValue(
        '{"timestamp":"old"}\n{"timestamp":"recent"}',
      );

      let callCount = 0;
      mockParseLogLine.mockImplementation(
        (_line: string, withDate: boolean) => {
          callCount++;
          if (withDate) {
            // First call (check date) returns old, second returns recent
            const date = callCount <= 2 ? oldDate : recentDate;
            return { timestamp: '10:00:00', message: 'Log', date };
          }
          return callCount > 2 ? '[10:00:00] Recent log' : null;
        },
      );

      const result = await service.getLogsForDownload('test-id', '1h');

      expect(result.logFile).toContain('analysis.log');
    });

    it('should filter logs by 24h time range', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago

      mockFs.access.mockResolvedValue(undefined);
      mockSafeReadFile.mockResolvedValue('{"timestamp":"recent"}');
      mockParseLogLine.mockImplementation(
        (_line: string, withDate: boolean) => {
          if (withDate) {
            return { timestamp: '10:00:00', message: 'Log', date: recentDate };
          }
          return '[10:00:00] Recent log';
        },
      );

      const result = await service.getLogsForDownload('test-id', '24h');

      expect(result.logFile).toContain('analysis.log');
    });

    it('should filter logs by 7d time range', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago

      mockFs.access.mockResolvedValue(undefined);
      mockSafeReadFile.mockResolvedValue('{"timestamp":"recent"}');
      mockParseLogLine.mockImplementation(
        (_line: string, withDate: boolean) => {
          if (withDate) {
            return { timestamp: '10:00:00', message: 'Log', date: recentDate };
          }
          return '[10:00:00] Recent log';
        },
      );

      const result = await service.getLogsForDownload('test-id', '7d');

      expect(result.logFile).toContain('analysis.log');
    });

    it('should filter logs by 30d time range', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago

      mockFs.access.mockResolvedValue(undefined);
      mockSafeReadFile.mockResolvedValue('{"timestamp":"recent"}');
      mockParseLogLine.mockImplementation(
        (_line: string, withDate: boolean) => {
          if (withDate) {
            return { timestamp: '10:00:00', message: 'Log', date: recentDate };
          }
          return '[10:00:00] Recent log';
        },
      );

      const result = await service.getLogsForDownload('test-id', '30d');

      expect(result.logFile).toContain('analysis.log');
    });

    it('should throw error when log file not found', async () => {
      mockFs.access.mockRejectedValue({ code: 'ENOENT' });

      await expect(
        service.getLogsForDownload('test-id', 'all'),
      ).rejects.toThrow('Log file not found for analysis: test-id');
    });

    it('should rethrow non-ENOENT errors', async () => {
      const permissionError = new Error('Permission denied');
      (permissionError as NodeJS.ErrnoException).code = 'EACCES';
      mockFs.access.mockRejectedValue(permissionError);

      await expect(
        service.getLogsForDownload('test-id', 'all'),
      ).rejects.toThrow('Permission denied');
    });

    it('should handle empty log file', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockSafeReadFile.mockResolvedValue('');

      const result = await service.getLogsForDownload('test-id', 'all');

      expect(result.content).toBe('');
    });

    it('should filter out invalid log lines', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockSafeReadFile.mockResolvedValue(
        '{"valid":"log"}\ninvalid-line\n{"another":"log"}',
      );
      mockParseLogLine.mockImplementation((line: string) => {
        if (line.includes('invalid')) return null;
        return '[10:00:00] Valid log';
      });

      const result = await service.getLogsForDownload('test-id', 'all');

      // Should only include valid parsed logs
      expect(result.content).not.toContain('invalid');
    });
  });
});

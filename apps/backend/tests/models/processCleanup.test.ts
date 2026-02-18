/**
 * ProcessCleanup Tests
 *
 * Comprehensive unit tests for the ProcessCleanupManager class.
 * Tests all cleanup operations, resource management, and error handling.
 *
 * Focus areas:
 * - File logger closure and stream destruction
 * - Connection grace timer cleanup
 * - State reset for all process aspects
 * - Process termination with error handling
 * - Edge cases: already cleaned, missing resources
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from 'pino';
import type { ChildProcess } from 'child_process';
import type {
  AnalysisProcessState,
  PinoDestinationStream,
} from '../../src/models/analysisProcess/types.ts';
import { ProcessCleanupManager } from '../../src/models/analysisProcess/ProcessCleanup.ts';
import { createMockChildProcess } from '../utils/testHelpers.ts';

/**
 * Create a mock logger
 */
function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
  } as unknown as Logger;
}

/**
 * Create a mock file logger stream
 */
function createMockStream(): PinoDestinationStream {
  return {
    flush: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
  } as unknown as PinoDestinationStream;
}

/**
 * Create a mock analysis process state
 */
function createMockAnalysisProcessState(
  overrides: Partial<AnalysisProcessState> = {},
): AnalysisProcessState {
  const logger = createMockLogger();

  return {
    analysisId: 'test-analysis-id',
    analysisName: 'test-analysis',
    service: {
      getEnvironment: vi.fn(),
      saveConfig: vi.fn(),
    },
    logger,
    logFile: '/tmp/test.log',
    process: null,
    status: 'stopped',
    enabled: false,
    intendedState: 'stopped',
    isStarting: false,
    isManualStop: false,
    lastStartTime: null,
    logs: [],
    logSequence: 0,
    totalLogCount: 0,
    maxMemoryLogs: 100,
    fileLogger: null,
    fileLoggerStream: null,
    restartTimer: null,
    restartAttempts: 0,
    restartDelay: 100,
    maxRestartDelay: 10000,
    connectionErrorDetected: false,
    connectionGracePeriod: 30000,
    connectionGraceTimer: null,
    reconnectionAttempts: 0,
    isConnected: false,
    stdoutBuffer: '',
    stderrBuffer: '',
    ...overrides,
  };
}

describe('ProcessCleanupManager', () => {
  let cleanupManager: ProcessCleanupManager;
  let mockState: AnalysisProcessState;
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    mockState = createMockAnalysisProcessState({ logger: mockLogger });
    cleanupManager = new ProcessCleanupManager(mockState);
  });

  describe('cleanup()', () => {
    it('should clean up all resources successfully', async () => {
      const mockProcess = createMockChildProcess();
      mockState.process = mockProcess as unknown as ChildProcess;
      mockState.status = 'running';
      mockState.logs = [
        {
          sequence: 1,
          timestamp: new Date().toISOString(),
          message: 'test log',
        },
      ];
      mockState.connectionGraceTimer = setTimeout(() => {}, 10000);
      mockState.reconnectionAttempts = 5;
      mockState.isConnected = true;
      mockState.stdoutBuffer = 'output data';
      mockState.stderrBuffer = 'error data';

      await cleanupManager.cleanup();

      // Process should be killed and cleared
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(mockState.process).toBeNull();

      // State should be reset
      expect(mockState.status).toBe('stopped');
      expect(mockState.enabled).toBe(false);
      expect(mockState.intendedState).toBe('stopped');
      expect(mockState.logs).toEqual([]);
      expect(mockState.logSequence).toBe(0);
      expect(mockState.totalLogCount).toBe(0);
      expect(mockState.stdoutBuffer).toBe('');
      expect(mockState.stderrBuffer).toBe('');
      expect(mockState.reconnectionAttempts).toBe(0);
      expect(mockState.isConnected).toBe(false);
      expect(mockState.connectionErrorDetected).toBe(false);
      expect(mockState.isStarting).toBe(false);
      expect(mockState.isManualStop).toBe(false);
      expect(mockState.restartAttempts).toBe(0);

      // Grace timer should be cleared
      expect(mockState.connectionGraceTimer).toBeNull();

      // Logger should log completion
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaning up analysis resources',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Analysis resources cleaned up successfully',
      );
    });

    it('should handle cleanup when process is already killed', async () => {
      const mockProcess = createMockChildProcess();
      mockProcess.killed = true;
      mockState.process = mockProcess as unknown as ChildProcess;

      await cleanupManager.cleanup();

      // Kill should not be called if already killed
      expect(mockProcess.kill).not.toHaveBeenCalled();
      // Note: process is NOT set to null when already killed (see ProcessCleanup.ts:136)
      // The code only nullifies if !process.killed
      expect(mockState.process).toBe(mockProcess);
    });

    it('should handle cleanup when process is null', async () => {
      mockState.process = null;

      await cleanupManager.cleanup();

      // Should not throw and process should remain null
      expect(mockState.process).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Analysis resources cleaned up successfully',
      );
    });

    it('should continue cleanup even if process.kill() throws error', async () => {
      const mockProcess = createMockChildProcess();
      mockProcess.kill.mockImplementation(() => {
        throw new Error('Kill failed');
      });
      mockState.process = mockProcess as unknown as ChildProcess;

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();

      // Process should still be cleared even if kill failed
      expect(mockState.process).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Error killing process during cleanup',
      );
    });

    it('should reset all state fields', async () => {
      mockState.status = 'running';
      mockState.enabled = true;
      mockState.intendedState = 'running';
      mockState.connectionErrorDetected = true;
      mockState.restartAttempts = 3;
      mockState.isStarting = true;
      mockState.isManualStop = true;

      await cleanupManager.cleanup();

      expect(mockState.status).toBe('stopped');
      expect(mockState.enabled).toBe(false);
      expect(mockState.intendedState).toBe('stopped');
      expect(mockState.connectionErrorDetected).toBe(false);
      expect(mockState.restartAttempts).toBe(0);
      expect(mockState.isStarting).toBe(false);
      expect(mockState.isManualStop).toBe(false);
    });

    it('should reset all connection state', async () => {
      mockState.reconnectionAttempts = 5;
      mockState.isConnected = true;
      mockState.connectionErrorDetected = true;

      await cleanupManager.cleanup();

      expect(mockState.reconnectionAttempts).toBe(0);
      expect(mockState.isConnected).toBe(false);
      expect(mockState.connectionErrorDetected).toBe(false);
    });

    it('should reset all log state', async () => {
      mockState.logs = [
        { sequence: 1, timestamp: new Date().toISOString(), message: 'log 1' },
        { sequence: 2, timestamp: new Date().toISOString(), message: 'log 2' },
      ];
      mockState.logSequence = 2;
      mockState.totalLogCount = 2;

      await cleanupManager.cleanup();

      expect(mockState.logs).toEqual([]);
      expect(mockState.logSequence).toBe(0);
      expect(mockState.totalLogCount).toBe(0);
    });

    it('should reset output buffers', async () => {
      mockState.stdoutBuffer = 'stdout data here';
      mockState.stderrBuffer = 'stderr data here';

      await cleanupManager.cleanup();

      expect(mockState.stdoutBuffer).toBe('');
      expect(mockState.stderrBuffer).toBe('');
    });

    it('should clear connection grace period', async () => {
      const timerId = setTimeout(() => {}, 30000);
      mockState.connectionGraceTimer = timerId;

      await cleanupManager.cleanup();

      expect(mockState.connectionGraceTimer).toBeNull();
    });

    it('should close file logger if present', async () => {
      const mockStream = createMockStream();
      const mockFileLogger = createMockLogger();
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await cleanupManager.cleanup();

      // Stream should be destroyed
      expect(mockStream.destroy).toHaveBeenCalled();
      expect(mockState.fileLogger).toBeNull();
      expect(mockState.fileLoggerStream).toBeNull();
    });
  });

  describe('closeFileLogger()', () => {
    it('should return early if fileLogger is null', async () => {
      mockState.fileLogger = null;
      mockState.fileLoggerStream = null;

      // Access private method through cleanup
      await cleanupManager.cleanup();

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should flush logger before closing', async () => {
      const mockStream = createMockStream();
      const mockFileLogger = createMockLogger();
      mockFileLogger.flush = vi.fn();
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await cleanupManager.cleanup();

      expect(mockFileLogger.flush).toHaveBeenCalled();
    });

    it('should handle logger without flush method', async () => {
      const mockStream = createMockStream();
      const mockFileLogger = createMockLogger();

      delete (mockFileLogger as any).flush;
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();

      expect(mockState.fileLogger).toBeNull();
      expect(mockState.fileLoggerStream).toBeNull();
    });

    it('should destroy stream if present and has destroy method', async () => {
      const mockStream = createMockStream();
      const mockFileLogger = createMockLogger();
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await cleanupManager.cleanup();

      expect(mockStream.destroy).toHaveBeenCalled();
    });

    it('should skip destroy if stream has no destroy method', async () => {
      const mockFileLogger = createMockLogger();
      const mockStream = {
        flush: vi.fn(),
        end: vi.fn(),
      } as unknown as PinoDestinationStream;

      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();

      expect(mockState.fileLogger).toBeNull();
      expect(mockState.fileLoggerStream).toBeNull();
    });

    it('should set fileLoggerStream to null after destroying', async () => {
      const mockStream = createMockStream();
      const mockFileLogger = createMockLogger();
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await cleanupManager.cleanup();

      expect(mockState.fileLoggerStream).toBeNull();
    });

    it('should handle error during stream destroy', async () => {
      const mockStream = createMockStream();
      mockStream.destroy = vi.fn().mockImplementation(() => {
        throw new Error('Destroy failed');
      });
      const mockFileLogger = createMockLogger();
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();

      expect(mockState.fileLogger).toBeNull();
      expect(mockState.fileLoggerStream).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Error closing file logger during cleanup',
      );
    });

    it('should handle error during flush', async () => {
      const mockStream = createMockStream();
      const mockFileLogger = createMockLogger();
      mockFileLogger.flush = vi.fn().mockImplementation(() => {
        throw new Error('Flush failed');
      });
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();

      expect(mockState.fileLogger).toBeNull();
      expect(mockState.fileLoggerStream).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Error closing file logger during cleanup',
      );
    });

    it('should clear references even if error occurs during destroy', async () => {
      const mockStream = createMockStream();
      mockStream.destroy = vi.fn().mockImplementation(() => {
        throw new Error('Destroy error');
      });
      const mockFileLogger = createMockLogger();
      mockFileLogger.flush = vi.fn();
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await cleanupManager.cleanup();

      // Even though error occurred, references should be cleared
      expect(mockState.fileLogger).toBeNull();
      expect(mockState.fileLoggerStream).toBeNull();
    });

    it('should handle stream destroy throwing and still clear logger reference', async () => {
      const mockStream = createMockStream();
      mockStream.destroy = vi.fn().mockImplementation(() => {
        throw new Error('Destroy failed');
      });
      const mockFileLogger = createMockLogger();
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await cleanupManager.cleanup();

      expect(mockState.fileLogger).toBeNull();
    });
  });

  describe('clearConnectionGracePeriod()', () => {
    it('should clear grace period timer if set', async () => {
      const timerId = setTimeout(() => {}, 30000);
      mockState.connectionGraceTimer = timerId;

      await cleanupManager.cleanup();

      expect(mockState.connectionGraceTimer).toBeNull();
    });

    it('should handle null grace period timer gracefully', async () => {
      mockState.connectionGraceTimer = null;

      await cleanupManager.cleanup();

      expect(mockState.connectionGraceTimer).toBeNull();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should clear timer without throwing', async () => {
      const timerId = setTimeout(() => {}, 30000);
      mockState.connectionGraceTimer = timerId;

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('resetConnectionState()', () => {
    it('should reset all connection state fields', async () => {
      mockState.reconnectionAttempts = 5;
      mockState.isConnected = true;
      mockState.connectionErrorDetected = true;

      await cleanupManager.cleanup();

      expect(mockState.reconnectionAttempts).toBe(0);
      expect(mockState.isConnected).toBe(false);
      expect(mockState.connectionErrorDetected).toBe(false);
    });

    it('should reset reconnection attempts to zero', async () => {
      mockState.reconnectionAttempts = 10;

      await cleanupManager.cleanup();

      expect(mockState.reconnectionAttempts).toBe(0);
    });

    it('should clear connection status', async () => {
      mockState.isConnected = true;

      await cleanupManager.cleanup();

      expect(mockState.isConnected).toBe(false);
    });

    it('should clear connection error flag', async () => {
      mockState.connectionErrorDetected = true;

      await cleanupManager.cleanup();

      expect(mockState.connectionErrorDetected).toBe(false);
    });
  });

  describe('resetLogState()', () => {
    it('should clear all logs', async () => {
      mockState.logs = [
        { sequence: 1, timestamp: new Date().toISOString(), message: 'log 1' },
        { sequence: 2, timestamp: new Date().toISOString(), message: 'log 2' },
        { sequence: 3, timestamp: new Date().toISOString(), message: 'log 3' },
      ];

      await cleanupManager.cleanup();

      expect(mockState.logs).toEqual([]);
      expect(mockState.logs.length).toBe(0);
    });

    it('should reset log sequence to zero', async () => {
      mockState.logSequence = 100;

      await cleanupManager.cleanup();

      expect(mockState.logSequence).toBe(0);
    });

    it('should reset total log count to zero', async () => {
      mockState.totalLogCount = 500;

      await cleanupManager.cleanup();

      expect(mockState.totalLogCount).toBe(0);
    });

    it('should reset all three log state fields together', async () => {
      mockState.logs = [
        { sequence: 1, timestamp: new Date().toISOString(), message: 'log' },
      ];
      mockState.logSequence = 99;
      mockState.totalLogCount = 999;

      await cleanupManager.cleanup();

      expect(mockState.logs).toEqual([]);
      expect(mockState.logSequence).toBe(0);
      expect(mockState.totalLogCount).toBe(0);
    });
  });

  describe('resetOutputBuffers()', () => {
    it('should clear stdout buffer', async () => {
      mockState.stdoutBuffer = 'standard output data';

      await cleanupManager.cleanup();

      expect(mockState.stdoutBuffer).toBe('');
    });

    it('should clear stderr buffer', async () => {
      mockState.stderrBuffer = 'standard error data';

      await cleanupManager.cleanup();

      expect(mockState.stderrBuffer).toBe('');
    });

    it('should clear both buffers', async () => {
      mockState.stdoutBuffer = 'stdout content';
      mockState.stderrBuffer = 'stderr content';

      await cleanupManager.cleanup();

      expect(mockState.stdoutBuffer).toBe('');
      expect(mockState.stderrBuffer).toBe('');
    });

    it('should handle large buffers', async () => {
      mockState.stdoutBuffer = 'x'.repeat(10000);
      mockState.stderrBuffer = 'y'.repeat(10000);

      await cleanupManager.cleanup();

      expect(mockState.stdoutBuffer).toBe('');
      expect(mockState.stderrBuffer).toBe('');
    });
  });

  describe('resetProcessState()', () => {
    it('should set status to stopped', async () => {
      mockState.status = 'running';

      await cleanupManager.cleanup();

      expect(mockState.status).toBe('stopped');
    });

    it('should set enabled to false', async () => {
      mockState.enabled = true;

      await cleanupManager.cleanup();

      expect(mockState.enabled).toBe(false);
    });

    it('should set intendedState to stopped', async () => {
      mockState.intendedState = 'running';

      await cleanupManager.cleanup();

      expect(mockState.intendedState).toBe('stopped');
    });

    it('should clear connection error detected flag', async () => {
      mockState.connectionErrorDetected = true;

      await cleanupManager.cleanup();

      expect(mockState.connectionErrorDetected).toBe(false);
    });

    it('should reset restart attempts', async () => {
      mockState.restartAttempts = 5;

      await cleanupManager.cleanup();

      expect(mockState.restartAttempts).toBe(0);
    });

    it('should clear isStarting flag', async () => {
      mockState.isStarting = true;

      await cleanupManager.cleanup();

      expect(mockState.isStarting).toBe(false);
    });

    it('should clear isManualStop flag', async () => {
      mockState.isManualStop = true;

      await cleanupManager.cleanup();

      expect(mockState.isManualStop).toBe(false);
    });

    it('should reset all process state fields together', async () => {
      mockState.status = 'running';
      mockState.enabled = true;
      mockState.intendedState = 'running';
      mockState.connectionErrorDetected = true;
      mockState.restartAttempts = 3;
      mockState.isStarting = true;
      mockState.isManualStop = true;

      await cleanupManager.cleanup();

      expect(mockState.status).toBe('stopped');
      expect(mockState.enabled).toBe(false);
      expect(mockState.intendedState).toBe('stopped');
      expect(mockState.connectionErrorDetected).toBe(false);
      expect(mockState.restartAttempts).toBe(0);
      expect(mockState.isStarting).toBe(false);
      expect(mockState.isManualStop).toBe(false);
    });
  });

  describe('cleanup order and completeness', () => {
    it('should complete all cleanup steps in correct order', async () => {
      const mockProcess = createMockChildProcess();
      const mockStream = createMockStream();
      const mockFileLogger = createMockLogger();
      const timerId = setTimeout(() => {}, 30000);

      mockState.process = mockProcess as unknown as ChildProcess;
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;
      mockState.connectionGraceTimer = timerId;
      mockState.status = 'running';
      mockState.enabled = true;

      await cleanupManager.cleanup();

      // All cleanup should be complete
      expect(mockState.process).toBeNull();
      expect(mockState.fileLogger).toBeNull();
      expect(mockState.fileLoggerStream).toBeNull();
      expect(mockState.connectionGraceTimer).toBeNull();
      expect(mockState.status).toBe('stopped');
      expect(mockState.enabled).toBe(false);
    });

    it('should not throw even with all resources present', async () => {
      const mockProcess = createMockChildProcess();
      const mockStream = createMockStream();
      const mockFileLogger = createMockLogger();
      const timerId = setTimeout(() => {}, 30000);

      mockState.process = mockProcess as unknown as ChildProcess;
      mockState.fileLogger = mockFileLogger as unknown as Logger;
      mockState.fileLoggerStream = mockStream;
      mockState.connectionGraceTimer = timerId;
      mockState.logs = [
        { sequence: 1, timestamp: new Date().toISOString(), message: 'test' },
      ];

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle cleanup called multiple times', async () => {
      const mockProcess = createMockChildProcess();
      mockState.process = mockProcess as unknown as ChildProcess;

      // First cleanup
      await cleanupManager.cleanup();
      expect(mockState.process).toBeNull();

      // Second cleanup - should not throw
      await expect(cleanupManager.cleanup()).resolves.not.toThrow();
    });

    it('should handle cleanup with minimal state', async () => {
      mockState = createMockAnalysisProcessState();
      cleanupManager = new ProcessCleanupManager(mockState);

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();
    });

    it('should handle cleanup with empty logs array', async () => {
      mockState.logs = [];

      await cleanupManager.cleanup();

      expect(mockState.logs).toEqual([]);
    });

    it('should preserve analysis ID and name during cleanup', async () => {
      const originalId = mockState.analysisId;
      const originalName = mockState.analysisName;

      await cleanupManager.cleanup();

      expect(mockState.analysisId).toBe(originalId);
      expect(mockState.analysisName).toBe(originalName);
    });

    it('should preserve service and logger during cleanup', async () => {
      const originalService = mockState.service;
      const originalLogger = mockState.logger;

      await cleanupManager.cleanup();

      expect(mockState.service).toBe(originalService);
      expect(mockState.logger).toBe(originalLogger);
    });
  });

  describe('error resilience', () => {
    it('should continue cleanup even if process.kill throws multiple errors', async () => {
      const mockProcess = createMockChildProcess();
      mockProcess.kill.mockImplementation(() => {
        throw new Error('Kill error');
      });
      mockState.process = mockProcess as unknown as ChildProcess;
      mockState.fileLogger = createMockLogger() as unknown as Logger;
      mockState.fileLoggerStream = createMockStream();

      await expect(cleanupManager.cleanup()).resolves.not.toThrow();

      expect(mockState.process).toBeNull();
      expect(mockState.fileLogger).toBeNull();
    });

    it('should handle cleanup with process in any state', async () => {
      const mockProcess = createMockChildProcess();
      mockProcess.killed = false;
      mockState.process = mockProcess as unknown as ChildProcess;

      // Process might be in various states
      mockState.status = 'running';
      mockState.intendedState = 'running';
      mockState.isStarting = true;

      await cleanupManager.cleanup();

      expect(mockState.process).toBeNull();
      expect(mockState.status).toBe('stopped');
    });

    it('should handle stream destroy error followed by reference clearing', async () => {
      const mockStream = createMockStream();
      mockStream.destroy = vi.fn().mockImplementation(() => {
        throw new Error('Stream destroy failed');
      });
      mockState.fileLogger = createMockLogger() as unknown as Logger;
      mockState.fileLoggerStream = mockStream;

      await cleanupManager.cleanup();

      // References should still be cleared despite error
      expect(mockState.fileLogger).toBeNull();
      expect(mockState.fileLoggerStream).toBeNull();
    });
  });
});

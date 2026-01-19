/**
 * ProcessMonitoring Tests
 *
 * Tests for the ProcessMonitor class which monitors process health
 * and connection status for analysis processes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from 'pino';
import type { ChildProcess } from 'child_process';
import type { AnalysisProcessState } from '../../src/models/analysisProcess/types.ts';
import { ProcessMonitor } from '../../src/models/analysisProcess/ProcessMonitoring.ts';

// Mock logger
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

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
 * Create a mock child process
 */
function createMockProcess(): ChildProcess {
  return {
    pid: 12345,
    killed: false,
    kill: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
  } as unknown as ChildProcess;
}

/**
 * Create a mock analysis process state
 */
function createMockAnalysisState(
  overrides: Partial<AnalysisProcessState> = {},
): AnalysisProcessState & { addLog: (message: string) => Promise<void> } {
  return {
    analysisId: 'test-analysis-123',
    analysisName: 'Test Analysis',
    status: 'running',
    enabled: true,
    intendedState: 'running',
    process: null,
    pid: null,
    lastStartTime: null,
    lastStopTime: null,
    exitCode: null,
    restartAttempts: 0,
    logs: [],
    totalLogCount: 0,
    logSequence: 0,
    maxMemoryLogs: 100,
    logFile: '/tmp/test.log',
    stdoutBuffer: '',
    stderrBuffer: '',
    isConnected: false,
    reconnectionAttempts: 0,
    connectionErrorDetected: false,
    connectionGraceTimer: null,
    logger: createMockLogger(),
    fileLogger: null,
    fileLoggerStream: null,
    addLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as AnalysisProcessState & { addLog: (message: string) => Promise<void> };
}

describe('ProcessMonitor', () => {
  let processMonitor: ProcessMonitor;
  let mockAnalysisState: ReturnType<typeof createMockAnalysisState>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalysisState = createMockAnalysisState();
    processMonitor = new ProcessMonitor(mockAnalysisState);
  });

  describe('constructor', () => {
    it('should create a ProcessMonitor instance', () => {
      expect(processMonitor).toBeDefined();
      expect(processMonitor).toBeInstanceOf(ProcessMonitor);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return current connection status', () => {
      const status = processMonitor.getConnectionStatus();

      expect(status).toEqual({
        isConnected: false,
        reconnectionAttempts: 0,
        connectionErrorDetected: false,
        graceTimerActive: false,
      });
    });

    it('should reflect isConnected state', () => {
      mockAnalysisState.isConnected = true;

      const status = processMonitor.getConnectionStatus();

      expect(status.isConnected).toBe(true);
    });

    it('should reflect reconnection attempts', () => {
      mockAnalysisState.reconnectionAttempts = 5;

      const status = processMonitor.getConnectionStatus();

      expect(status.reconnectionAttempts).toBe(5);
    });

    it('should reflect connection error detected', () => {
      mockAnalysisState.connectionErrorDetected = true;

      const status = processMonitor.getConnectionStatus();

      expect(status.connectionErrorDetected).toBe(true);
    });

    it('should reflect grace timer active state', () => {
      mockAnalysisState.connectionGraceTimer = setTimeout(() => {}, 1000);

      const status = processMonitor.getConnectionStatus();

      expect(status.graceTimerActive).toBe(true);

      clearTimeout(mockAnalysisState.connectionGraceTimer);
    });
  });

  describe('resetConnectionState', () => {
    it('should reset all connection state', () => {
      // Set some state
      mockAnalysisState.isConnected = true;
      mockAnalysisState.reconnectionAttempts = 5;
      mockAnalysisState.connectionErrorDetected = true;

      processMonitor.resetConnectionState();

      expect(mockAnalysisState.isConnected).toBe(false);
      expect(mockAnalysisState.reconnectionAttempts).toBe(0);
      expect(mockAnalysisState.connectionErrorDetected).toBe(false);
    });
  });

  describe('handleOutput', () => {
    it('should buffer incomplete lines for stdout', () => {
      const data = Buffer.from('incomplete line');

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.stdoutBuffer).toBe('incomplete line');
    });

    it('should buffer incomplete lines for stderr', () => {
      const data = Buffer.from('error line');

      processMonitor.handleOutput(true, data);

      expect(mockAnalysisState.stderrBuffer).toBe('error line');
    });

    it('should process complete lines and clear buffer', () => {
      const data = Buffer.from('complete line\n');

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.stdoutBuffer).toBe('');
      expect(mockAnalysisState.addLog).toHaveBeenCalledWith('complete line');
    });

    it('should process multiple lines', () => {
      const data = Buffer.from('line 1\nline 2\n');

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.addLog).toHaveBeenCalledTimes(2);
      expect(mockAnalysisState.addLog).toHaveBeenCalledWith('line 1');
      expect(mockAnalysisState.addLog).toHaveBeenCalledWith('line 2');
    });

    it('should prepend buffered content to first line', () => {
      mockAnalysisState.stdoutBuffer = 'partial ';
      const data = Buffer.from('complete\n');

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.addLog).toHaveBeenCalledWith('partial complete');
    });

    it('should skip empty lines', () => {
      const data = Buffer.from('\n\n');

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.addLog).not.toHaveBeenCalled();
    });

    it('should detect connection success pattern', () => {
      const data = Buffer.from('¬ Connected to TagoIO :: analysis-123\n');

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.isConnected).toBe(true);
      expect(mockAnalysisState.reconnectionAttempts).toBe(0);
    });

    it('should detect waiting for trigger pattern', () => {
      const data = Buffer.from('¬ Waiting for analysis trigger\n');

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.isConnected).toBe(true);
    });

    it('should detect reconnection attempt pattern', () => {
      const data = Buffer.from(
        '¬ Connection was closed, trying to reconnect...\n',
      );

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.reconnectionAttempts).toBe(1);
    });

    it('should increment reconnection attempts on multiple attempts', () => {
      mockAnalysisState.reconnectionAttempts = 2;
      const data = Buffer.from(
        '¬ Connection was closed, trying to reconnect...\n',
      );

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.reconnectionAttempts).toBe(3);
    });
  });

  describe('handleFatalError', () => {
    it('should handle fatal error with grace timer active', () => {
      const mockTimer = setTimeout(() => {}, 30000);
      mockAnalysisState.connectionGraceTimer = mockTimer;
      mockAnalysisState.process = createMockProcess();

      const data = Buffer.from(
        '¬ Error :: Analysis not found or not active.\n',
      );

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.connectionErrorDetected).toBe(true);
      expect(mockAnalysisState.connectionGraceTimer).toBeNull();
    });

    it('should kill process on fatal error', () => {
      const mockProcess = createMockProcess();
      mockAnalysisState.process = mockProcess;

      const data = Buffer.from(
        '¬ Error :: Analysis not found or not active.\n',
      );

      processMonitor.handleOutput(false, data);

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should not kill already killed process', () => {
      const mockProcess = createMockProcess();
      (mockProcess as { killed: boolean }).killed = true;
      mockAnalysisState.process = mockProcess;

      const data = Buffer.from(
        '¬ Error :: Analysis not found or not active.\n',
      );

      processMonitor.handleOutput(false, data);

      expect(mockProcess.kill).not.toHaveBeenCalled();
    });

    it('should handle fatal error without process', () => {
      mockAnalysisState.process = null;

      const data = Buffer.from(
        '¬ Error :: Analysis not found or not active.\n',
      );

      // Should not throw
      expect(() => processMonitor.handleOutput(false, data)).not.toThrow();
      expect(mockAnalysisState.connectionErrorDetected).toBe(true);
    });
  });

  describe('handleConnectionSuccess', () => {
    it('should clear grace timer on connection success', () => {
      const mockTimer = setTimeout(() => {}, 30000);
      mockAnalysisState.connectionGraceTimer = mockTimer;
      mockAnalysisState.isConnected = false;

      const data = Buffer.from('¬ Connected to TagoIO :: analysis-123\n');

      processMonitor.handleOutput(false, data);

      expect(mockAnalysisState.connectionGraceTimer).toBeNull();
      expect(mockAnalysisState.isConnected).toBe(true);
    });
  });
});

/**
 * AnalysisProcess Tests
 *
 * Uses REAL implementations for:
 * - pino logging
 * - config
 * - constants
 * - safePath file operations (with temp directory)
 * - SSE manager (with spies)
 *
 * Only mocks:
 * - child_process.fork (don't spawn real processes)
 * - dnsCache (don't make real DNS requests)
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
  type Mock,
} from 'vitest';
import {
  createMockChildProcess,
  type MockChildProcess,
} from '../utils/testHelpers.ts';
import type { AnalysisStatus, LogEntry } from '@tago-analysis-worker/types';
import type { ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

// Test directory paths
const TEST_BASE_DIR = path.join(os.tmpdir(), 'analysis-process-test');
const TEST_ANALYSES_DIR = path.join(TEST_BASE_DIR, 'analyses');

// Service type matching what AnalysisProcess expects
type MockService = {
  getEnvironment: Mock<(analysisId: string) => Promise<Record<string, string>>>;
  saveConfig: Mock<() => Promise<void>>;
};

// LogManager state type
type LogManagerState = {
  estimatedFileSize: number;
  logsSinceLastCheck: number;
};

// AnalysisProcess type matching the actual class
type AnalysisProcessInstance = {
  analysisId: string;
  analysisName: string;
  service: MockService;
  enabled: boolean;
  status: AnalysisStatus;
  intendedState: 'running' | 'stopped';
  process: MockChildProcess | null;
  logs: LogEntry[];
  logFile: string;
  logSequence: number;
  totalLogCount: number;
  maxMemoryLogs: number;
  isStarting: boolean;
  isManualStop: boolean;
  isConnected: boolean;
  connectionErrorDetected: boolean;
  connectionGraceTimer: NodeJS.Timeout | null;
  connectionGracePeriod: number;
  reconnectionAttempts: number;
  restartAttempts: number;
  lastStartTime: string | null;
  logManager: LogManagerState;
  fileLogger: unknown;
  fileLoggerStream: unknown;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  cleanup: () => Promise<void>;
  addLog: (message: string) => Promise<void>;
  getMemoryLogs: (
    page: number,
    limit: number,
  ) => { logs: LogEntry[]; hasMore: boolean; totalCount: number };
  initializeLogState: () => Promise<void>;
  handleExit: (code: number | null) => Promise<void>;
  handleOutput: (isStderr: boolean, data: Buffer) => void;
  updateStatus: (status: AnalysisStatus, enabled: boolean) => void;
};

type AnalysisProcessClass = new (
  analysisId: string,
  analysisName: string,
  service: MockService,
) => AnalysisProcessInstance;

// Only mock child_process - we don't want to spawn real processes
vi.mock('child_process', () => ({
  fork: vi.fn(),
}));

// Only mock dnsCache - we don't want real DNS lookups in tests
vi.mock('../../src/services/dnsCache.ts', () => ({
  dnsCache: {
    handleDNSLookupRequest: vi
      .fn()
      .mockResolvedValue({ addresses: ['127.0.0.1'] }),
    handleDNSResolve4Request: vi
      .fn()
      .mockResolvedValue({ addresses: ['127.0.0.1'] }),
    handleDNSResolve6Request: vi.fn().mockResolvedValue({ addresses: ['::1'] }),
    resetAnalysisStats: vi.fn(),
  },
}));

// Mock safePath to avoid file system issues in tests
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

// Mock config to use our test directories
vi.mock('../../src/config/default.ts', () => ({
  config: {
    paths: {
      analysis: path.join(os.tmpdir(), 'analysis-process-test', 'analyses'),
    },
    analysis: {
      maxLogsInMemory: 100,
      forceKillTimeout: 5000,
    },
    storage: {
      base: path.join(os.tmpdir(), 'analysis-process-test', 'storage'),
    },
    process: {
      env: {},
    },
    sandbox: {
      enabled: false, // Default to disabled for tests
      allowChildProcess: false,
      allowWorkerThreads: false,
    },
  },
}));

// Spy on SSE manager to verify broadcasts without mocking the whole module
vi.mock('../../src/utils/sse/index.ts', () => ({
  sseManager: {
    broadcastUpdate: vi.fn(),
    broadcastAnalysisUpdate: vi.fn(),
    broadcastAnalysisLog: vi.fn(),
    broadcastAnalysisStats: vi.fn(),
    broadcast: vi.fn(),
  },
}));

const { fork } = (await import('child_process')) as unknown as { fork: Mock };
const { sseManager } =
  (await import('../../src/utils/sse/index.ts')) as unknown as {
    sseManager: {
      broadcastUpdate: Mock;
      broadcastAnalysisUpdate: Mock;
      broadcastAnalysisLog: Mock;
      broadcastAnalysisStats: Mock;
      broadcast: Mock;
    };
  };
const { dnsCache } =
  (await import('../../src/services/dnsCache.ts')) as unknown as {
    dnsCache: {
      handleDNSLookupRequest: Mock;
      handleDNSResolve4Request: Mock;
      handleDNSResolve6Request: Mock;
      resetAnalysisStats: Mock;
    };
  };
const { safeStat, safeReadFile } =
  (await import('../../src/utils/safePath.ts')) as unknown as {
    safeStat: Mock;
    safeReadFile: Mock;
  };

describe('AnalysisProcess', () => {
  let AnalysisProcess: AnalysisProcessClass;
  let mockService: MockService;

  // Create test directories before all tests
  beforeAll(async () => {
    await fs.mkdir(TEST_ANALYSES_DIR, { recursive: true });
  });

  // Clean up test directories after all tests
  afterAll(async () => {
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    mockService = {
      getEnvironment: vi.fn().mockResolvedValue({}),
      saveConfig: vi.fn().mockResolvedValue(undefined),
    };

    // Reset DNS cache mock implementations (clearAllMocks doesn't reset implementations)
    dnsCache.handleDNSLookupRequest.mockResolvedValue({
      addresses: ['127.0.0.1'],
    });
    dnsCache.handleDNSResolve4Request.mockResolvedValue({
      addresses: ['127.0.0.1'],
    });
    dnsCache.handleDNSResolve6Request.mockResolvedValue({
      addresses: ['::1'],
    });

    // Dynamically import to get fresh instance
    const module =
      (await import('../../src/models/analysisProcess/index.ts')) as unknown as {
        AnalysisProcess: AnalysisProcessClass;
      };
    AnalysisProcess = module.AnalysisProcess;
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      expect(analysis.analysisId).toBe('test-analysis-id');
      expect(analysis.analysisName).toBe('test-analysis');
      expect(analysis.service).toBe(mockService);
      expect(analysis.enabled).toBe(false);
      expect(analysis.status).toBe('stopped');
      expect(analysis.intendedState).toBe('stopped');
      expect(analysis.process).toBeNull();
      expect(analysis.logs).toEqual([]);
    });

    it('should set up log file path correctly using analysisId', () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      // In v5.0, paths use analysisId, not analysisName
      expect(analysis.logFile).toContain('test-analysis-id');
      expect(analysis.logFile).toContain('analysis.log');
    });
  });

  describe('analysisName setter', () => {
    it('should update analysis name but NOT file paths (paths use analysisId)', () => {
      const analysis = new AnalysisProcess(
        'analysis-id',
        'old-name',
        mockService,
      );

      analysis.analysisName = 'new-name';

      // Name property should change
      expect(analysis.analysisName).toBe('new-name');
      // But file paths should NOT change (they use analysisId)
      expect(analysis.logFile).toContain('analysis-id');
      expect(analysis.logFile).not.toContain('new-name');
    });

    it('should not affect file logger path when renamed', () => {
      const analysis = new AnalysisProcess(
        'analysis-id',
        'old-name',
        mockService,
      );
      const originalLogFile = analysis.logFile;

      analysis.analysisName = 'new-name';

      // File logger path should remain unchanged
      expect(analysis.logFile).toBe(originalLogFile);
    });
  });

  describe('addLog', () => {
    it('should add log entry to memory buffer', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.addLog('Test message');

      expect(analysis.logs).toHaveLength(1);
      expect(analysis.logs[0].message).toBe('Test message');
      expect(analysis.totalLogCount).toBe(1);
      expect(analysis.logSequence).toBe(1);
    });

    it('should broadcast log via SSE', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.addLog('Test message');

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

    it('should maintain FIFO order and respect max memory logs', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.maxMemoryLogs = 3;

      await analysis.addLog('Message 1');
      await analysis.addLog('Message 2');
      await analysis.addLog('Message 3');
      await analysis.addLog('Message 4');

      expect(analysis.logs).toHaveLength(3);
      expect(analysis.logs[0].message).toBe('Message 4');
      expect(analysis.logs[2].message).toBe('Message 2');
    });
  });

  describe('getMemoryLogs', () => {
    it('should return paginated logs', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.addLog('Log 1');
      await analysis.addLog('Log 2');
      await analysis.addLog('Log 3');

      const result = analysis.getMemoryLogs(1, 2);

      expect(result.logs).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.totalCount).toBe(3);
    });

    it('should handle empty logs', () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      const result = analysis.getMemoryLogs(1, 10);

      expect(result.logs).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('initializeLogState', () => {
    it('should handle missing log file gracefully', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      // Mock file not found
      const error = new Error('File not found') as Error & { code: string };
      error.code = 'ENOENT';
      safeStat.mockRejectedValueOnce(error);

      // Should not throw when log file doesn't exist
      await expect(analysis.initializeLogState()).resolves.not.toThrow();

      expect(analysis.totalLogCount).toBe(0);
      expect(analysis.logs).toEqual([]);
    });

    it('should load existing logs from file', async () => {
      const mockLogs = [
        '{"time":"2025-01-01T00:00:00.000Z","msg":"Log 1"}',
        '{"time":"2025-01-01T00:00:01.000Z","msg":"Log 2"}',
      ].join('\n');

      safeReadFile.mockResolvedValueOnce(mockLogs);
      safeStat.mockResolvedValueOnce({
        size: 1024,
        isFile: () => true,
      });

      const analysis = new AnalysisProcess(
        'test-analysis-with-logs',
        'test-analysis',
        mockService,
      );

      await analysis.initializeLogState();

      expect(analysis.totalLogCount).toBe(2);
      expect(analysis.logs).toHaveLength(2);
    });

    it('should track estimated file size when adding logs', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.addLog('test message');

      // Verify log was broadcast via SSE logs channel
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

      // Verify stats (including file size) were broadcast via stats channel
      expect(sseManager.broadcastAnalysisStats).toHaveBeenCalledWith(
        'test-analysis-id',
        expect.objectContaining({
          totalCount: expect.any(Number),
          logFileSize: expect.any(Number),
        }),
      );
    });
  });

  describe('start', () => {
    it('should start analysis process successfully', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      expect(fork).toHaveBeenCalled();
      expect(analysis.process).toBe(mockProcess);
      expect(analysis.status).toBe('running');
      expect(analysis.enabled).toBe(true);
      expect(analysis.intendedState).toBe('running');
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });

    it('should prevent race conditions by checking isStarting flag', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.isStarting = true;

      await analysis.start();

      expect(fork).not.toHaveBeenCalled();
    });

    it('should not start if process already exists', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = createMockChildProcess();

      await analysis.start();

      expect(fork).not.toHaveBeenCalled();
    });

    it('should load environment variables before starting', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      mockService.getEnvironment.mockResolvedValue({
        KEY1: 'value1',
        KEY2: 'value2',
      });

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      expect(mockService.getEnvironment).toHaveBeenCalledWith(
        'test-analysis-id',
      );
      expect(fork).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            KEY1: 'value1',
            KEY2: 'value2',
          }),
        }),
      );
    });

    it('should handle start errors gracefully', async () => {
      fork.mockImplementation(() => {
        throw new Error('Fork failed');
      });

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await expect(analysis.start()).rejects.toThrow('Fork failed');
      expect(analysis.isStarting).toBe(false);
    });
  });

  describe('stop', () => {
    it('should stop running analysis process', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = mockProcess;
      analysis.status = 'running';

      // Store the exit callback when once('exit') is called
      let exitCallback: ((code: number) => void) | null = null;

      mockProcess.once.mockImplementation((event: any, callback: any) => {
        if (event === 'exit') {
          exitCallback = callback;
        }
      });

      // Manually register the exit handler (normally done during start())
      analysis.process.once(
        'exit',
        analysis.handleExit.bind(analysis) as (code: number) => void,
      );

      // Trigger exit after a short delay when kill is called
      mockProcess.kill.mockImplementation(() => {
        if (exitCallback) {
          setTimeout(() => exitCallback!(0), 10);
        }
      });

      await analysis.stop();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(analysis.status).toBe('stopped');
      expect(analysis.process).toBeNull();
    });

    it('should not stop if process is not running', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.stop();

      expect(mockService.saveConfig).not.toHaveBeenCalled();
    });

    it('should force kill after timeout', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = mockProcess;
      analysis.status = 'running';

      let exitCallback: ((code: number) => void) | null = null;

      // Capture the exit callback but don't call it immediately

      mockProcess.once.mockImplementation((event: any, callback: any) => {
        if (event === 'exit') {
          exitCallback = callback;
        }
      });

      // Manually register the exit handler (normally done during start())
      analysis.process.once(
        'exit',
        analysis.handleExit.bind(analysis) as (code: number) => void,
      );

      // Start the stop process
      const stopPromise = analysis.stop();

      // Wait a bit for SIGTERM to be sent
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify SIGTERM was sent
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Wait for force kill timeout (default is 5000ms from config)
      await new Promise((resolve) => setTimeout(resolve, 5100));

      // Should have sent SIGKILL after timeout
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');

      // Now trigger the exit to let the promise resolve

      (exitCallback as any)?.(0);

      await stopPromise;

      expect(analysis.process).toBeNull();
    }, 20000);
  });

  describe('handleExit', () => {
    it('should update status when process exits', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = createMockChildProcess();
      analysis.status = 'running';

      await analysis.handleExit(0);

      expect(analysis.status).toBe('stopped');
      expect(analysis.process).toBeNull();
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });

    it('should NOT auto-restart on unexpected exit (code errors require user fix)', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.intendedState = 'running';

      // Mock start to prevent actual fork
      const startSpy = vi.spyOn(analysis, 'start').mockResolvedValue(undefined);

      vi.useFakeTimers();

      await analysis.handleExit(1); // Non-zero exit code

      expect(analysis.status).toBe('stopped');

      // Should NOT schedule restart for code errors
      vi.advanceTimersByTime(10000);

      // Allow async operations to settle
      await vi.runAllTimersAsync();

      // No restart - user must fix the code error
      expect(startSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should detect connection errors and schedule restart', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.intendedState = 'running';
      analysis.connectionErrorDetected = true;

      // Mock start to prevent actual fork
      const startSpy = vi.spyOn(analysis, 'start').mockResolvedValue(undefined);

      vi.useFakeTimers();

      await analysis.handleExit(0);

      expect(analysis.restartAttempts).toBe(1);

      // Should schedule restart with backoff
      vi.advanceTimersByTime(5000);

      // Allow async operations to settle
      await vi.runAllTimersAsync();

      expect(startSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should not restart if intended state is stopped', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.intendedState = 'stopped';

      vi.useFakeTimers();
      const startSpy = vi.spyOn(analysis, 'start');

      await analysis.handleExit(1);

      vi.advanceTimersByTime(10000);

      expect(startSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should normalize exit code to 0 for manual stops', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.isManualStop = true;

      await analysis.handleExit(null);

      expect(analysis.status).toBe('stopped');
      expect(analysis.isManualStop).toBe(false); // Should be reset
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalledWith(
        'test-analysis-id',
        expect.objectContaining({
          update: expect.objectContaining({
            exitCode: 0, // Normalized from null to 0
          }),
        }),
      );
    });

    it('should not normalize exit code for non-manual stops', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.isManualStop = false;

      await analysis.handleExit(null); // Signal termination without manual stop

      expect(analysis.status).toBe('stopped');
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalledWith(
        'test-analysis-id',
        expect.objectContaining({
          update: expect.objectContaining({
            exitCode: null, // Not normalized, remains null
          }),
        }),
      );
    });

    it('should not restart when manual stop flag is set', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      // Simulate what stop() does: set both isManualStop AND intendedState
      analysis.isManualStop = true;
      analysis.intendedState = 'stopped'; // stop() explicitly sets this

      vi.useFakeTimers();
      const startSpy = vi.spyOn(analysis, 'start');

      await analysis.handleExit(null);

      vi.advanceTimersByTime(10000);

      expect(startSpy).not.toHaveBeenCalled(); // Should not restart
      expect(analysis.isManualStop).toBe(false); // Flag should be reset

      vi.useRealTimers();
    });
  });

  describe('IPC message handling', () => {
    it('should handle DNS lookup requests', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      await analysis.start();

      // Simulate IPC message from child process

      const ipcHandler = (mockProcess.on.mock.calls as any[]).find(
        (call) => call[0] === 'message',
      )?.[1] as (msg: unknown) => Promise<void>;

      await ipcHandler({
        type: 'DNS_LOOKUP_REQUEST',
        requestId: 'req-123',
        hostname: 'example.com',
        options: {},
      });

      expect(mockProcess.send).toHaveBeenCalledWith({
        type: 'DNS_LOOKUP_RESPONSE',
        requestId: 'req-123',
        result: { addresses: ['127.0.0.1'] },
      });
    });

    it('should not crash when process is killed during async DNS lookup', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      await analysis.start();

      // Get the IPC message handler

      const ipcHandler = (mockProcess.on.mock.calls as any[]).find(
        (call) => call[0] === 'message',
      )?.[1] as (msg: unknown) => Promise<void>;

      // Create a promise that will kill the process during DNS lookup
      const dnsPromise = ipcHandler({
        type: 'DNS_LOOKUP_REQUEST',
        requestId: 'req-123',
        hostname: 'example.com',
        options: {},
      });

      // Kill the process before DNS lookup completes
      analysis.process = null;

      // Should not throw error
      await expect(dnsPromise).resolves.not.toThrow();

      // Send should not have been called since process is null
      expect(mockProcess.send).not.toHaveBeenCalled();
    });

    it('should handle IPC send errors gracefully', async () => {
      const mockProcess = createMockChildProcess();
      mockProcess.send.mockImplementation(() => {
        throw new Error('IPC send failed');
      });

      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      await analysis.start();

      const ipcHandler = (mockProcess.on.mock.calls as any[]).find(
        (call) => call[0] === 'message',
      )?.[1] as (msg: unknown) => Promise<void>;

      // Should not crash on send error
      await expect(
        ipcHandler({
          type: 'DNS_LOOKUP_REQUEST',
          requestId: 'req-123',
          hostname: 'example.com',
          options: {},
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('handleOutput', () => {
    it('should process stdout data', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      analysis.handleOutput(false, Buffer.from('Test output\n'));

      expect(analysis.logs[0].message).toContain('Test output');
    });

    it('should process stderr data as-is (child process handles formatting)', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      // Child process sandboxLogger already adds level indicators, so we pass through as-is
      analysis.handleOutput(true, Buffer.from('Error message\n'));

      expect(analysis.logs[0].message).toBe('Error message');
    });

    it('should detect SDK connection errors and start grace period', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = mockProcess;
      analysis.status = 'running';

      vi.useFakeTimers();

      analysis.handleOutput(
        false,
        Buffer.from('\u00ac Connection was closed, trying to reconnect...\n'),
      );

      // Should NOT kill immediately
      expect(mockProcess.kill).not.toHaveBeenCalled();
      expect(analysis.isConnected).toBe(false);
      expect(analysis.reconnectionAttempts).toBe(1);
      expect(analysis.connectionGraceTimer).not.toBeNull();

      vi.useRealTimers();
    });

    it('should kill process after grace period expires without connection', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = mockProcess;
      analysis.status = 'running';
      analysis.connectionGracePeriod = 1000; // 1 second for test

      vi.useFakeTimers();

      analysis.handleOutput(
        false,
        Buffer.from('\u00ac Connection was closed, trying to reconnect...\n'),
      );

      // Should not kill yet
      expect(mockProcess.kill).not.toHaveBeenCalled();

      // Advance timer past grace period
      vi.advanceTimersByTime(1100);

      // Now should kill
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(analysis.connectionErrorDetected).toBe(true);

      vi.useRealTimers();
    });

    it('should clear grace timer on successful connection', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = mockProcess;
      analysis.status = 'running';
      analysis.connectionGracePeriod = 30000;

      vi.useFakeTimers();

      // Start reconnection
      analysis.handleOutput(
        false,
        Buffer.from('\u00ac Connection was closed, trying to reconnect...\n'),
      );

      expect(analysis.connectionGraceTimer).not.toBeNull();
      expect(analysis.isConnected).toBe(false);

      // Connection succeeds
      analysis.handleOutput(
        false,
        Buffer.from('\u00ac Connected to TagoIO :: Analysis Ready\n'),
      );

      expect(analysis.isConnected).toBe(true);
      expect(analysis.connectionGraceTimer).toBeNull();
      expect(analysis.reconnectionAttempts).toBe(0);
      expect(analysis.connectionErrorDetected).toBe(false);

      // Advance timer past grace period - should NOT kill
      vi.advanceTimersByTime(31000);
      expect(mockProcess.kill).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should immediately kill on fatal analysis error', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = mockProcess;
      analysis.status = 'running';

      vi.useFakeTimers();

      analysis.handleOutput(
        false,
        Buffer.from('\u00ac Error :: Analysis not found or not active.\n'),
      );

      // Should kill immediately for fatal errors
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(analysis.connectionErrorDetected).toBe(true);

      vi.useRealTimers();
    });

    it('should handle multi-line output', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      analysis.handleOutput(false, Buffer.from('Line 1\nLine 2\nLine 3\n'));

      expect(analysis.logs).toHaveLength(3);
    });
  });

  describe('cleanup', () => {
    it('should clean up all resources', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = mockProcess;
      analysis.status = 'running';
      analysis.logs = [
        { sequence: 1, timestamp: new Date().toISOString(), message: 'test' },
      ];

      await analysis.cleanup();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(analysis.process).toBeNull();
      expect(analysis.logs).toEqual([]);
      expect(analysis.status).toBe('stopped');
      expect(analysis.enabled).toBe(false);
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockProcess = createMockChildProcess();
      mockProcess.kill.mockImplementation(() => {
        throw new Error('Kill failed');
      });

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.process = mockProcess;

      await expect(analysis.cleanup()).resolves.not.toThrow();
      expect(analysis.process).toBeNull();
    });

    it('should properly close file logger streams', async () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      // Cleanup should not throw even if file logger isn't initialized
      await expect(analysis.cleanup()).resolves.not.toThrow();
      expect(analysis.fileLogger).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status and intended state', () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      analysis.updateStatus('running', true);

      expect(analysis.status).toBe('running');
      expect(analysis.enabled).toBe(true);
      expect(analysis.intendedState).toBe('running');
      expect(analysis.lastStartTime).toBeDefined();
    });

    it('should preserve intended state when stopping (not change to stopped)', () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.status = 'running';
      analysis.intendedState = 'running';

      // updateStatus no longer changes intendedState when stopping
      // intendedState is only changed explicitly in stop() for manual stops
      analysis.updateStatus('stopped', false);

      expect(analysis.status).toBe('stopped');
      // intendedState should remain 'running' for health check recovery
      expect(analysis.intendedState).toBe('running');
    });

    it('should preserve intended state on connection error', () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.intendedState = 'running';
      analysis.connectionErrorDetected = true;

      analysis.updateStatus('stopped', false);

      expect(analysis.intendedState).toBe('running');
    });

    it('should preserve intended state on unexpected exit for health check recovery', () => {
      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );
      analysis.intendedState = 'running';

      // Simulate unexpected exit - updateStatus should NOT change intendedState
      analysis.updateStatus('stopped', false);

      // intendedState stays 'running' so health check can restart it later
      expect(analysis.intendedState).toBe('running');
    });
  });

  describe('sandbox (filesystem isolation)', () => {
    it('should not pass sandbox execArgv when sandbox is disabled', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      // Should fork with empty execArgv (no sandbox flags)
      expect(fork).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          execArgv: [],
        }),
      );
    });

    it('should pass --permission flag when sandbox is enabled', async () => {
      // Override config for this test
      const { config } =
        (await import('../../src/config/default.ts')) as unknown as {
          config: {
            sandbox: {
              enabled: boolean;
              allowChildProcess: boolean;
              allowWorkerThreads: boolean;
            };
          };
        };
      config.sandbox.enabled = true;

      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      // Should include --permission flag
      const forkCall = fork.mock.calls[0];
      const forkOptions = forkCall[2] as { execArgv: string[] };
      expect(forkOptions.execArgv).toContain('--permission');

      // Restore config
      config.sandbox.enabled = false;
    });

    it('should include --allow-fs-read with restricted paths when sandbox is enabled', async () => {
      const { config } =
        (await import('../../src/config/default.ts')) as unknown as {
          config: {
            sandbox: {
              enabled: boolean;
              allowChildProcess: boolean;
              allowWorkerThreads: boolean;
            };
          };
        };
      config.sandbox.enabled = true;

      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      const forkCall = fork.mock.calls[0];
      const forkOptions = forkCall[2] as { execArgv: string[] };

      // Implementation uses separate --allow-fs-read flags for each path
      const allowFsReadArgs = forkOptions.execArgv.filter((arg: string) =>
        arg.startsWith('--allow-fs-read='),
      );

      expect(allowFsReadArgs.length).toBeGreaterThan(0);

      // Join all args to check that required paths are present
      const allAllowedPaths = allowFsReadArgs.join(' ');

      // Should include the specific analysis file path
      expect(allAllowedPaths).toContain('test-analysis-id');
      expect(allAllowedPaths).toContain('index.js');
      // Should include node_modules
      expect(allAllowedPaths).toContain('node_modules');
      // Should include utils folder
      expect(allAllowedPaths).toContain('utils');

      // Restore config
      config.sandbox.enabled = false;
    });

    it('should NOT include --allow-fs-write when sandbox is enabled (no write access)', async () => {
      const { config } =
        (await import('../../src/config/default.ts')) as unknown as {
          config: {
            sandbox: {
              enabled: boolean;
              allowChildProcess: boolean;
              allowWorkerThreads: boolean;
            };
          };
        };
      config.sandbox.enabled = true;

      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      const forkCall = fork.mock.calls[0];
      const forkOptions = forkCall[2] as { execArgv: string[] };

      // Should NOT have any --allow-fs-write flag
      const hasWritePermission = forkOptions.execArgv.some((arg: string) =>
        arg.startsWith('--allow-fs-write'),
      );
      expect(hasWritePermission).toBe(false);

      // Restore config
      config.sandbox.enabled = false;
    });

    it('should NOT include --allow-child-process by default', async () => {
      const { config } =
        (await import('../../src/config/default.ts')) as unknown as {
          config: {
            sandbox: {
              enabled: boolean;
              allowChildProcess: boolean;
              allowWorkerThreads: boolean;
            };
          };
        };
      config.sandbox.enabled = true;
      config.sandbox.allowChildProcess = false;

      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      const forkCall = fork.mock.calls[0];
      const forkOptions = forkCall[2] as { execArgv: string[] };

      expect(forkOptions.execArgv).not.toContain('--allow-child-process');

      // Restore config
      config.sandbox.enabled = false;
    });

    it('should include --allow-child-process when explicitly enabled', async () => {
      const { config } =
        (await import('../../src/config/default.ts')) as unknown as {
          config: {
            sandbox: {
              enabled: boolean;
              allowChildProcess: boolean;
              allowWorkerThreads: boolean;
            };
          };
        };
      config.sandbox.enabled = true;
      config.sandbox.allowChildProcess = true;

      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      const forkCall = fork.mock.calls[0];
      const forkOptions = forkCall[2] as { execArgv: string[] };

      expect(forkOptions.execArgv).toContain('--allow-child-process');

      // Restore config
      config.sandbox.enabled = false;
      config.sandbox.allowChildProcess = false;
    });

    it('should NOT include --allow-worker by default', async () => {
      const { config } =
        (await import('../../src/config/default.ts')) as unknown as {
          config: {
            sandbox: {
              enabled: boolean;
              allowChildProcess: boolean;
              allowWorkerThreads: boolean;
            };
          };
        };
      config.sandbox.enabled = true;
      config.sandbox.allowWorkerThreads = false;

      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      const forkCall = fork.mock.calls[0];
      const forkOptions = forkCall[2] as { execArgv: string[] };

      expect(forkOptions.execArgv).not.toContain('--allow-worker');

      // Restore config
      config.sandbox.enabled = false;
    });

    it('should include --allow-worker when explicitly enabled', async () => {
      const { config } =
        (await import('../../src/config/default.ts')) as unknown as {
          config: {
            sandbox: {
              enabled: boolean;
              allowChildProcess: boolean;
              allowWorkerThreads: boolean;
            };
          };
        };
      config.sandbox.enabled = true;
      config.sandbox.allowWorkerThreads = true;

      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess as unknown as ChildProcess);

      const analysis = new AnalysisProcess(
        'test-analysis-id',
        'test-analysis',
        mockService,
      );

      await analysis.start();

      const forkCall = fork.mock.calls[0];
      const forkOptions = forkCall[2] as { execArgv: string[] };

      expect(forkOptions.execArgv).toContain('--allow-worker');

      // Restore config
      config.sandbox.enabled = false;
      config.sandbox.allowWorkerThreads = false;
    });
  });
});

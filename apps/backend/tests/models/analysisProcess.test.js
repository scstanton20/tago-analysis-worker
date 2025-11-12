import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockChildProcess } from '../utils/testHelpers.js';

// Mock dependencies
vi.mock('child_process', () => ({
  fork: vi.fn(),
}));

vi.mock('../../src/utils/safePath.js', () => ({
  safeMkdir: vi.fn().mockResolvedValue(undefined),
  safeStat: vi.fn().mockResolvedValue({
    size: 1024,
    isFile: () => true,
  }),
  safeUnlink: vi.fn().mockResolvedValue(undefined),
  safeReadFile: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../src/utils/sse.js', () => ({
  sseManager: {
    broadcastUpdate: vi.fn(),
    broadcastAnalysisUpdate: vi.fn(),
  },
}));

vi.mock('../../src/config/default.js', () => ({
  default: {
    paths: {
      analysis: '/tmp/analyses',
    },
    analysis: {
      maxLogsInMemory: 100,
      forceKillTimeout: 5000,
      autoRestartDelay: 5000,
    },
    storage: {
      base: '/tmp',
    },
    process: {
      env: {},
    },
  },
}));

vi.mock('../../src/services/dnsCache.js', () => ({
  default: {
    handleDNSLookupRequest: vi
      .fn()
      .mockResolvedValue({ addresses: ['127.0.0.1'] }),
    handleDNSResolve4Request: vi
      .fn()
      .mockResolvedValue({ addresses: ['127.0.0.1'] }),
    handleDNSResolve6Request: vi.fn().mockResolvedValue({ addresses: ['::1'] }),
  },
}));

vi.mock('../../src/constants.js', () => ({
  ANALYSIS_PROCESS: {
    MAX_MEMORY_LOGS_FALLBACK: 100,
    INITIAL_RESTART_DELAY_MS: 5000,
    MAX_RESTART_DELAY_MS: 60000,
    MAX_LOG_FILE_SIZE_BYTES: 50 * 1024 * 1024,
  },
}));

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    flush: vi.fn(),
  })),
  destination: vi.fn(() => ({})),
}));

const { fork } = await import('child_process');
const { sseManager } = await import('../../src/utils/sse.js');
const { safeStat, safeReadFile, safeUnlink } = await import(
  '../../src/utils/safePath.js'
);

describe('AnalysisProcess', () => {
  let AnalysisProcess;
  let mockService;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockService = {
      getEnvironment: vi.fn().mockResolvedValue({}),
      saveConfig: vi.fn().mockResolvedValue(undefined),
    };

    // Dynamically import to get fresh instance
    const module = await import('../../src/models/analysisProcess.js');
    AnalysisProcess = module.default;
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      expect(analysis.analysisName).toBe('test-analysis');
      expect(analysis.service).toBe(mockService);
      expect(analysis.enabled).toBe(false);
      expect(analysis.status).toBe('stopped');
      expect(analysis.intendedState).toBe('stopped');
      expect(analysis.process).toBeNull();
      expect(analysis.logs).toEqual([]);
    });

    it('should set up log file path correctly', () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      expect(analysis.logFile).toContain('test-analysis');
      expect(analysis.logFile).toContain('analysis.log');
    });
  });

  describe('analysisName setter', () => {
    it('should update analysis name and log file path', () => {
      const analysis = new AnalysisProcess('old-name', mockService);

      analysis.analysisName = 'new-name';

      expect(analysis.analysisName).toBe('new-name');
      expect(analysis.logFile).toContain('new-name');
    });

    it('should reinitialize file logger with new path', () => {
      const analysis = new AnalysisProcess('old-name', mockService);

      analysis.analysisName = 'new-name';

      // File logger should be reinitialized
      expect(analysis.fileLogger).toBeDefined();
    });
  });

  describe('addLog', () => {
    it('should add log entry to memory buffer', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      await analysis.addLog('Test message');

      expect(analysis.logs).toHaveLength(1);
      expect(analysis.logs[0].message).toBe('Test message');
      expect(analysis.totalLogCount).toBe(1);
      expect(analysis.logSequence).toBe(1);
    });

    it('should broadcast log via SSE', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      await analysis.addLog('Test message');

      expect(sseManager.broadcastUpdate).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          fileName: 'test-analysis',
          analysis: 'test-analysis',
        }),
      );
    });

    it('should maintain FIFO order and respect max memory logs', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
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
      const analysis = new AnalysisProcess('test-analysis', mockService);

      await analysis.addLog('Log 1');
      await analysis.addLog('Log 2');
      await analysis.addLog('Log 3');

      const result = analysis.getMemoryLogs(1, 2);

      expect(result.logs).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.totalCount).toBe(3);
    });

    it('should handle empty logs', () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      const result = analysis.getMemoryLogs(1, 10);

      expect(result.logs).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('initializeLogState', () => {
    it('should load existing logs from file', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      const mockLogs = [
        '{"time":"2025-01-01T00:00:00.000Z","msg":"Log 1"}',
        '{"time":"2025-01-01T00:00:01.000Z","msg":"Log 2"}',
      ].join('\n');

      safeReadFile.mockResolvedValue(mockLogs);
      safeStat.mockResolvedValue({
        size: 1024,
        isFile: () => true,
      });

      await analysis.initializeLogState();

      expect(analysis.totalLogCount).toBe(2);
      expect(analysis.logs).toHaveLength(2);
    });

    it('should handle missing log file', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      const error = new Error('File not found');
      error.code = 'ENOENT';
      safeStat.mockRejectedValue(error);

      await analysis.initializeLogState();

      expect(analysis.totalLogCount).toBe(0);
      expect(analysis.logs).toEqual([]);
    });

    it('should delete oversized log files', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      safeStat.mockResolvedValue({
        size: 60 * 1024 * 1024, // 60MB
        isFile: () => true,
      });

      await analysis.initializeLogState();

      expect(safeUnlink).toHaveBeenCalled();
      expect(analysis.totalLogCount).toBe(1); // After adding "cleared" message
    });
  });

  describe('start', () => {
    it('should start analysis process successfully', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess);

      const analysis = new AnalysisProcess('test-analysis', mockService);

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
      fork.mockReturnValue(mockProcess);

      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.isStarting = true;

      await analysis.start();

      expect(fork).not.toHaveBeenCalled();
    });

    it('should not start if process already exists', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = createMockChildProcess();

      await analysis.start();

      expect(fork).not.toHaveBeenCalled();
    });

    it('should load environment variables before starting', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess);

      mockService.getEnvironment.mockResolvedValue({
        KEY1: 'value1',
        KEY2: 'value2',
      });

      const analysis = new AnalysisProcess('test-analysis', mockService);

      await analysis.start();

      expect(mockService.getEnvironment).toHaveBeenCalledWith('test-analysis');
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

      const analysis = new AnalysisProcess('test-analysis', mockService);

      await expect(analysis.start()).rejects.toThrow('Fork failed');
      expect(analysis.isStarting).toBe(false);
    });
  });

  describe('stop', () => {
    it('should stop running analysis process', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = mockProcess;
      analysis.status = 'running';

      // Simulate process exit
      mockProcess.once.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 10);
        }
      });

      await analysis.stop();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(analysis.status).toBe('stopped');
      expect(analysis.process).toBeNull();
    });

    it('should not stop if process is not running', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      await analysis.stop();

      expect(mockService.saveConfig).not.toHaveBeenCalled();
    });

    it('should force kill after timeout', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = mockProcess;
      analysis.status = 'running';

      let exitCallback = null;

      // Capture the exit callback but don't call it immediately
      mockProcess.once.mockImplementation((event, callback) => {
        if (event === 'exit') {
          exitCallback = callback;
        }
      });

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
      if (exitCallback) {
        exitCallback(0);
      }

      await stopPromise;

      expect(analysis.process).toBeNull();
    }, 20000);
  });

  describe('handleExit', () => {
    it('should update status when process exits', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = createMockChildProcess();
      analysis.status = 'running';

      await analysis.handleExit(0);

      expect(analysis.status).toBe('stopped');
      expect(analysis.process).toBeNull();
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });

    it('should auto-restart on unexpected exit', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.intendedState = 'running';

      vi.useFakeTimers();

      await analysis.handleExit(1); // Non-zero exit code

      expect(analysis.status).toBe('stopped');

      // Should schedule restart
      vi.advanceTimersByTime(5000);

      vi.useRealTimers();
    });

    it('should detect connection errors and schedule restart', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.intendedState = 'running';
      analysis.connectionErrorDetected = true;

      vi.useFakeTimers();

      await analysis.handleExit(0);

      expect(analysis.restartAttempts).toBe(1);

      // Should schedule restart with backoff
      vi.advanceTimersByTime(5000);

      vi.useRealTimers();
    });

    it('should not restart if intended state is stopped', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
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
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.isManualStop = true;

      await analysis.handleExit(null); // Signal termination (null code)

      expect(analysis.status).toBe('stopped');
      expect(analysis.isManualStop).toBe(false); // Should be reset
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalledWith(
        'test-analysis',
        expect.objectContaining({
          update: expect.objectContaining({
            exitCode: 0, // Normalized from null to 0
          }),
        }),
      );
    });

    it('should not normalize exit code for non-manual stops', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.isManualStop = false;

      await analysis.handleExit(null); // Signal termination without manual stop

      expect(analysis.status).toBe('stopped');
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalledWith(
        'test-analysis',
        expect.objectContaining({
          update: expect.objectContaining({
            exitCode: null, // Not normalized, remains null
          }),
        }),
      );
    });

    it('should not restart when manual stop flag is set', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = createMockChildProcess();
      analysis.status = 'running';
      analysis.intendedState = 'running';
      analysis.isManualStop = true;

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
      fork.mockReturnValue(mockProcess);

      const analysis = new AnalysisProcess('test-analysis', mockService);
      await analysis.start();

      // Simulate IPC message from child process
      const ipcHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'message',
      )[1];

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
      fork.mockReturnValue(mockProcess);

      const analysis = new AnalysisProcess('test-analysis', mockService);
      await analysis.start();

      // Get the IPC message handler
      const ipcHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'message',
      )[1];

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

    it('should not crash when process is killed during DNS resolve4', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess);

      const analysis = new AnalysisProcess('test-analysis', mockService);
      await analysis.start();

      const ipcHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'message',
      )[1];

      const dnsPromise = ipcHandler({
        type: 'DNS_RESOLVE4_REQUEST',
        requestId: 'req-456',
        hostname: 'example.com',
      });

      // Kill the process
      analysis.process = null;

      await expect(dnsPromise).resolves.not.toThrow();
      expect(mockProcess.send).not.toHaveBeenCalled();
    });

    it('should not crash when process is killed during DNS resolve6', async () => {
      const mockProcess = createMockChildProcess();
      fork.mockReturnValue(mockProcess);

      const analysis = new AnalysisProcess('test-analysis', mockService);
      await analysis.start();

      const ipcHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'message',
      )[1];

      const dnsPromise = ipcHandler({
        type: 'DNS_RESOLVE6_REQUEST',
        requestId: 'req-789',
        hostname: 'example.com',
      });

      // Kill the process
      analysis.process = null;

      await expect(dnsPromise).resolves.not.toThrow();
      expect(mockProcess.send).not.toHaveBeenCalled();
    });

    it('should handle IPC send errors gracefully', async () => {
      const mockProcess = createMockChildProcess();
      mockProcess.send.mockImplementation(() => {
        throw new Error('IPC send failed');
      });

      fork.mockReturnValue(mockProcess);

      const analysis = new AnalysisProcess('test-analysis', mockService);
      await analysis.start();

      const ipcHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'message',
      )[1];

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
      const analysis = new AnalysisProcess('test-analysis', mockService);

      analysis.handleOutput(false, Buffer.from('Test output\n'));

      expect(analysis.logs[0].message).toContain('Test output');
    });

    it('should process stderr data with ERROR prefix', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      analysis.handleOutput(true, Buffer.from('Error message\n'));

      expect(analysis.logs[0].message).toContain('ERROR: Error message');
    });

    it('should detect SDK connection errors and start grace period', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = mockProcess;
      analysis.status = 'running';

      vi.useFakeTimers();

      analysis.handleOutput(
        false,
        Buffer.from('¬ Connection was closed, trying to reconnect...\n'),
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
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = mockProcess;
      analysis.status = 'running';
      analysis.connectionGracePeriod = 1000; // 1 second for test

      vi.useFakeTimers();

      analysis.handleOutput(
        false,
        Buffer.from('¬ Connection was closed, trying to reconnect...\n'),
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
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = mockProcess;
      analysis.status = 'running';
      analysis.connectionGracePeriod = 30000;

      vi.useFakeTimers();

      // Start reconnection
      analysis.handleOutput(
        false,
        Buffer.from('¬ Connection was closed, trying to reconnect...\n'),
      );

      expect(analysis.connectionGraceTimer).not.toBeNull();
      expect(analysis.isConnected).toBe(false);

      // Connection succeeds
      analysis.handleOutput(
        false,
        Buffer.from('¬ Connected to TagoIO :: Analysis Ready\n'),
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
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = mockProcess;
      analysis.status = 'running';

      vi.useFakeTimers();

      analysis.handleOutput(
        false,
        Buffer.from('¬ Error :: Analysis not found or not active.\n'),
      );

      // Should kill immediately for fatal errors
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(analysis.connectionErrorDetected).toBe(true);

      vi.useRealTimers();
    });

    it('should handle multi-line output', async () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      analysis.handleOutput(false, Buffer.from('Line 1\nLine 2\nLine 3\n'));

      expect(analysis.logs).toHaveLength(3);
    });
  });

  describe('cleanup', () => {
    it('should clean up all resources', async () => {
      const mockProcess = createMockChildProcess();
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = mockProcess;
      analysis.status = 'running';
      analysis.logs = [{ message: 'test' }];

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

      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.process = mockProcess;

      await expect(analysis.cleanup()).resolves.not.toThrow();
      expect(analysis.process).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status and intended state', () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);

      analysis.updateStatus('running', true);

      expect(analysis.status).toBe('running');
      expect(analysis.enabled).toBe(true);
      expect(analysis.intendedState).toBe('running');
      expect(analysis.lastStartTime).toBeDefined();
    });

    it('should set intended state to stopped when manually stopped', () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.status = 'running';

      analysis.updateStatus('stopped', false);

      expect(analysis.status).toBe('stopped');
      expect(analysis.intendedState).toBe('stopped');
    });

    it('should preserve intended state on connection error', () => {
      const analysis = new AnalysisProcess('test-analysis', mockService);
      analysis.intendedState = 'running';
      analysis.connectionErrorDetected = true;

      analysis.updateStatus('stopped', false);

      expect(analysis.intendedState).toBe('running');
    });
  });
});

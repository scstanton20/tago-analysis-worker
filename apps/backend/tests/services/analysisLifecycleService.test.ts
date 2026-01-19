/**
 * Analysis Lifecycle Service Tests
 *
 * Tests the analysis lifecycle management including initialization, starting,
 * stopping, health checks, and intended state verification.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import type { AnalysisProcess } from '../../src/models/analysisProcess/index.ts';
import {
  createTempStorage,
  type TempStorage,
} from '../fixtures/tempStorage.ts';

// Create hoisted mocks
const {
  mockConfigService,
  mockLogService,
  mockTeamService,
  mockLogger,
  mockSafeReaddir,
  mockSafeStat,
  mockConfig,
  mockCollectChildProcessMetrics,
  mockAnalysisProcessInstance,
} = vi.hoisted(() => {
  const mockAnalysisProcessInstance = {
    analysisId: '',
    analysisName: '',
    status: 'stopped' as const,
    intendedState: 'stopped' as const,
    enabled: false,
    teamId: null,
    lastStartTime: null,
    logs: [],
    logSequence: 0,
    totalLogCount: 0,
    process: null,
    isConnected: false,
    connectionErrorDetected: false,
    restartAttempts: 0,
    start: vi.fn(),
    stop: vi.fn(),
    initializeLogState: vi.fn().mockResolvedValue(undefined),
  };

  return {
    mockConfigService: {
      getConfig: vi.fn(),
      saveConfig: vi.fn(),
      setAnalysis: vi.fn(),
      getAnalysisProcess: vi.fn(),
      getAllAnalysisProcesses: vi.fn(),
    },
    mockLogService: {
      addLog: vi.fn(),
    },
    mockTeamService: {
      initialize: vi.fn(),
    },
    mockLogger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    mockSafeReaddir: vi.fn(),
    mockSafeStat: vi.fn(),
    mockConfig: {
      paths: {
        analysis: '/tmp/test-analyses',
      },
      analysis: {
        maxLogsInMemory: 100,
      },
    } as { paths: { analysis: string }; analysis: { maxLogsInMemory: number } },
    mockCollectChildProcessMetrics: vi.fn(),
    mockAnalysisProcessInstance,
  };
});

// Mock dependencies
vi.mock('../../src/config/default.ts', () => ({
  config: mockConfig,
}));

vi.mock('../../src/utils/safePath.ts', () => ({
  safeReaddir: mockSafeReaddir,
  safeStat: mockSafeStat,
}));

vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../src/services/teamService.ts', () => ({
  teamService: mockTeamService,
}));

vi.mock('../../src/utils/metrics-enhanced.ts', () => ({
  collectChildProcessMetrics: mockCollectChildProcessMetrics,
}));

vi.mock('../../src/constants.ts', () => ({
  ANALYSIS_SERVICE: {
    HEALTH_CHECK_INTERVAL_MS: 5 * 60 * 1000,
    METRICS_COLLECTION_INTERVAL_MS: 1000,
    BATCH_SIZE_DEFAULT: 5,
    BATCH_DELAY_MS: 100,
    CONNECTION_CHECK_INTERVAL_MS: 100,
    CONNECTION_TIMEOUT_MS: 1000,
  },
  ANALYSIS_PROCESS: {
    MAX_MEMORY_LOGS_DEFAULT: 100,
    MAX_MEMORY_LOGS_FALLBACK: 1000,
    MAX_LOG_FILE_SIZE_BYTES: 50 * 1024 * 1024,
    INITIAL_RESTART_DELAY_MS: 5000,
    MAX_RESTART_DELAY_MS: 60000,
    FORCE_KILL_TIMEOUT_MS: 3000,
    CONNECTION_GRACE_PERIOD_MS: 30000,
    DEFAULT_LOG_PAGINATION_LIMIT: 100,
  },
}));

// Note: We cannot easily mock the AnalysisProcess class because vitest doesn't
// properly intercept the module with the .ts extension. The tests for initializeAnalysis
// will use the real AnalysisProcess, which is actually a better integration test.
// The remaining tests use createMockAnalysisProcess for unit testing.

// Import after mocks
import {
  AnalysisLifecycleService,
  createAnalysisLifecycleService,
} from '../../src/services/analysis/AnalysisLifecycleService.ts';
import type {
  IAnalysisConfigService,
  IAnalysisLogService,
} from '../../src/services/analysis/types.ts';

// ============================================================================
// SHARED GLOBAL TEST FIXTURE
// ============================================================================
// This creates a reusable test analysis environment for testing the full
// application lifecycle. It's set up once and shared across all tests that
// need real filesystem operations.

let globalTestStorage: TempStorage | null = null;
let originalAnalysisPath: string | null = null;

/**
 * Get or create the shared test storage.
 * Creates a temp storage with pre-configured test analyses.
 */
function getTestStorage(): TempStorage {
  if (!globalTestStorage) {
    globalTestStorage = createTempStorage('global-analysis-test-');

    // Pre-create standard test analyses for reuse across tests
    globalTestStorage.createAnalysis(
      'standard-test-analysis',
      `const { Analysis } = require('@tago-io/sdk');
module.exports = new Analysis(() => console.log('Standard test analysis'));`,
    );

    globalTestStorage.createAnalysis(
      'test-with-team',
      `const { Analysis } = require('@tago-io/sdk');
module.exports = new Analysis(() => console.log('Team analysis'));`,
    );

    // Create an analysis with existing logs for log state tests
    globalTestStorage.createAnalysis('analysis-with-history');
    globalTestStorage.writeLogs(
      'analysis-with-history',
      JSON.stringify({
        sequence: 1,
        timestamp: '2025-01-01T00:00:00Z',
        message: 'Historical log 1',
      }) +
        '\n' +
        JSON.stringify({
          sequence: 2,
          timestamp: '2025-01-01T00:01:00Z',
          message: 'Historical log 2',
        }) +
        '\n',
      'analysis.log',
    );
  }
  return globalTestStorage;
}

/**
 * Setup the test environment to use the shared test storage.
 * Call this in beforeEach when you need real filesystem operations.
 */
function setupTestStorageConfig(): void {
  if (originalAnalysisPath === null) {
    originalAnalysisPath = mockConfig.paths.analysis;
  }
  mockConfig.paths.analysis = getTestStorage().analysesPath;
}

/**
 * Restore the original config after tests.
 * Call this in afterAll at the end of the test file.
 */
function teardownTestStorageConfig(): void {
  if (originalAnalysisPath !== null) {
    mockConfig.paths.analysis = originalAnalysisPath;
    originalAnalysisPath = null;
  }
  if (globalTestStorage) {
    globalTestStorage.cleanup();
    globalTestStorage = null;
  }
}

// Mock analysis type that allows both AnalysisProcess usage and mock function access
type MockAnalysis = AnalysisProcess & {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  initializeLogState: ReturnType<typeof vi.fn>;
};

// Helper to create mock AnalysisProcess - uses loose typing to allow mock objects
function createMockAnalysisProcess(
  overrides: Record<string, unknown> = {},
): MockAnalysis {
  return {
    analysisId: 'test-analysis-id',
    analysisName: 'Test Analysis',
    status: 'stopped' as const,
    intendedState: 'stopped' as const,
    enabled: false,
    teamId: null,
    lastStartTime: null,
    logs: [],
    logSequence: 0,
    totalLogCount: 0,
    process: null,
    isConnected: false,
    connectionErrorDetected: false,
    restartAttempts: 0,
    start: vi.fn(),
    stop: vi.fn(),
    initializeLogState: vi.fn(),
    ...overrides,
  } as unknown as MockAnalysis;
}

describe('AnalysisLifecycleService', () => {
  let service: AnalysisLifecycleService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset the mock AnalysisProcess instance state
    mockAnalysisProcessInstance.analysisId = '';
    mockAnalysisProcessInstance.analysisName = '';
    mockAnalysisProcessInstance.status = 'stopped';
    mockAnalysisProcessInstance.intendedState = 'stopped';
    mockAnalysisProcessInstance.enabled = false;
    mockAnalysisProcessInstance.teamId = null;
    mockAnalysisProcessInstance.lastStartTime = null;
    mockAnalysisProcessInstance.logs = [];
    mockAnalysisProcessInstance.logSequence = 0;
    mockAnalysisProcessInstance.totalLogCount = 0;
    mockAnalysisProcessInstance.process = null;
    mockAnalysisProcessInstance.isConnected = false;
    mockAnalysisProcessInstance.connectionErrorDetected = false;
    mockAnalysisProcessInstance.restartAttempts = 0;
    mockAnalysisProcessInstance.initializeLogState.mockResolvedValue(undefined);

    service = new AnalysisLifecycleService(
      mockConfigService as unknown as IAnalysisConfigService,
      mockLogService as unknown as IAnalysisLogService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    service.stopHealthCheck();
  });

  describe('constructor and factory', () => {
    it('should create service via factory function', () => {
      const factoryService = createAnalysisLifecycleService(
        mockConfigService as unknown as IAnalysisConfigService,
        mockLogService as unknown as IAnalysisLogService,
      );
      expect(factoryService).toBeInstanceOf(AnalysisLifecycleService);
    });

    it('should initialize with null environment service', () => {
      expect(service).toBeDefined();
    });
  });

  describe('setEnvironmentService', () => {
    it('should set environment service', () => {
      const mockEnvService = {
        getEnvironment: vi.fn().mockResolvedValue({}),
      };

      service.setEnvironmentService(mockEnvService as any);
      expect(service).toBeDefined();
    });
  });

  describe('createServiceAdapter', () => {
    it('should return empty env when environment service not set', async () => {
      const adapter = (service as any).createServiceAdapter();

      const env = await adapter.getEnvironment('test-id');
      expect(env).toEqual({});
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Environment service not set, returning empty env',
      );
    });

    it('should get environment from service when set', async () => {
      const mockEnvService = {
        getEnvironment: vi.fn().mockResolvedValue({ VAR1: 'value1' }),
      };
      service.setEnvironmentService(mockEnvService as any);

      const adapter = (service as any).createServiceAdapter();
      const env = await adapter.getEnvironment('test-id');

      expect(env).toEqual({ VAR1: 'value1' });
      expect(mockEnvService.getEnvironment).toHaveBeenCalledWith('test-id');
    });

    it('should call saveConfig when adapter saveConfig is called', async () => {
      const adapter = (service as any).createServiceAdapter();

      await adapter.saveConfig();
      expect(mockConfigService.saveConfig).toHaveBeenCalled();
    });
  });

  describe('initialize()', () => {
    it('should initialize with empty config', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        version: '1.0',
        analyses: {},
        teamStructure: {},
      });
      mockSafeReaddir.mockResolvedValue([]);

      await service.initialize();

      expect(mockConfigService.getConfig).toHaveBeenCalled();
      expect(mockTeamService.initialize).toHaveBeenCalled();
      expect(mockSafeReaddir).toHaveBeenCalledWith('/tmp/test-analyses');
      expect(mockConfigService.saveConfig).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          configVersion: '1.0',
          configAnalysesCount: 0,
        }),
        'Config loaded for initialization',
      );
    });

    it('should initialize with analyses in config', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        version: '1.0',
        analyses: {
          'analysis-1': { id: 'analysis-1', name: 'Analysis 1', enabled: true },
          'analysis-2': {
            id: 'analysis-2',
            name: 'Analysis 2',
            enabled: false,
          },
        },
        teamStructure: {},
      });
      mockSafeReaddir.mockResolvedValue(['analysis-1', 'analysis-2']);
      mockSafeStat.mockResolvedValue({ isFile: () => true });
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      // Mock initializeAnalysis
      service.initializeAnalysis = vi.fn().mockResolvedValue(undefined);

      await service.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          configAnalysesCount: 2,
        }),
        'Config loaded for initialization',
      );
      expect(service.initializeAnalysis).toHaveBeenCalledTimes(2);
    });

    it('should handle missing index.js file gracefully', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        version: '1.0',
        analyses: {},
        teamStructure: {},
      });
      mockSafeReaddir.mockResolvedValue(['analysis-1']);
      // Return isFile: false to simulate missing index.js
      mockSafeStat.mockResolvedValue({ isFile: () => false });

      // Spy on initializeAnalysis before calling initialize
      const initializeAnalysisSpy = vi.spyOn(service, 'initializeAnalysis');

      await service.initialize();

      // Should not have called initializeAnalysis since index.js doesn't exist
      expect(initializeAnalysisSpy).not.toHaveBeenCalled();
      // But should have called safeStat to check the file
      expect(mockSafeStat).toHaveBeenCalledWith(
        '/tmp/test-analyses/analysis-1/index.js',
        '/tmp/test-analyses',
      );
    });

    it('should handle errors during analysis discovery', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        version: '1.0',
        analyses: {},
        teamStructure: {},
      });
      mockSafeReaddir.mockResolvedValue(['analysis-1', 'analysis-2']);
      mockSafeStat.mockRejectedValueOnce(new Error('File not found'));
      mockSafeStat.mockResolvedValueOnce({ isFile: () => true });

      service.initializeAnalysis = vi.fn().mockResolvedValue(undefined);

      await service.initialize();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          analysisId: 'analysis-1',
        }),
        'Error loading analysis',
      );
    });

    it('should start health check after initialization', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        version: '1.0',
        analyses: {},
        teamStructure: {},
      });
      mockSafeReaddir.mockResolvedValue([]);

      await service.initialize();

      expect(service.getHealthCheckInterval()).not.toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Started periodic health check for analyses (5 minute interval)',
      );
    });
  });

  describe('initializeAnalysis() - with real fixtures', () => {
    // These tests use the shared global test storage with pre-configured analyses
    // to verify the actual behavior of initializeAnalysis

    beforeEach(() => {
      setupTestStorageConfig();
    });

    it('should initialize analysis with full config and correct properties', async () => {
      // Uses pre-created 'standard-test-analysis' from global fixture
      const fullConfig = {
        id: 'standard-test-analysis',
        name: 'My Test Analysis',
        enabled: true,
        intendedState: 'running' as const,
        lastStartTime: '2025-01-01T00:00:00.000Z',
        teamId: 'team-123',
      };

      await service.initializeAnalysis('standard-test-analysis', fullConfig);

      // Verify setAnalysis was called with a real AnalysisProcess instance
      expect(mockConfigService.setAnalysis).toHaveBeenCalledWith(
        'standard-test-analysis',
        expect.objectContaining({
          analysisId: 'standard-test-analysis',
          analysisName: 'My Test Analysis',
          enabled: true,
          intendedState: 'running',
          lastStartTime: '2025-01-01T00:00:00.000Z',
          teamId: 'team-123',
          status: 'stopped',
        }),
      );
    });

    it('should use analysisId as name when name is missing in config', async () => {
      // Uses pre-created 'test-with-team' analysis without providing a name
      await service.initializeAnalysis('test-with-team', {
        enabled: false,
      });

      // Verify it used analysisId as the name
      expect(mockConfigService.setAnalysis).toHaveBeenCalledWith(
        'test-with-team',
        expect.objectContaining({
          analysisId: 'test-with-team',
          analysisName: 'test-with-team',
        }),
      );

      // Verify warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          analysisId: 'test-with-team',
          hasAnalysisConfig: true,
        }),
        'Analysis name not found in config, using analysisId as name',
      );
    });

    it('should initialize log state from pre-existing log file', async () => {
      // Uses pre-created 'analysis-with-history' which has existing logs
      await service.initializeAnalysis('analysis-with-history', {
        name: 'Analysis With History',
      });

      // Verify setAnalysis was called with correct properties
      expect(mockConfigService.setAnalysis).toHaveBeenCalledWith(
        'analysis-with-history',
        expect.objectContaining({
          analysisId: 'analysis-with-history',
          analysisName: 'Analysis With History',
        }),
      );

      // The AnalysisProcess should have its log manager initialized
      // We can verify by checking the instance passed to setAnalysis has the expected structure
      const setAnalysisCall = mockConfigService.setAnalysis.mock.calls.find(
        (call: unknown[]) => call[0] === 'analysis-with-history',
      );
      expect(setAnalysisCall).toBeDefined();
      const analysisProcess = setAnalysisCall![1];

      // Verify the analysis process has a log manager (indicates initialization completed)
      expect(analysisProcess.logManager).toBeDefined();
      expect(analysisProcess.logFile).toContain('analysis-with-history');
    });

    it('should handle partial config with correct defaults', async () => {
      // Uses pre-created analysis with minimal config
      await service.initializeAnalysis('standard-test-analysis', {});

      // Verify defaults were applied
      expect(mockConfigService.setAnalysis).toHaveBeenCalledWith(
        'standard-test-analysis',
        expect.objectContaining({
          analysisId: 'standard-test-analysis',
          analysisName: 'standard-test-analysis', // Falls back to ID
          enabled: false, // Default
          intendedState: 'stopped', // Default
          lastStartTime: null, // Default
          teamId: null, // Default
          status: 'stopped', // Always starts stopped
        }),
      );
    });

    it('should handle empty config (default parameter) with all defaults', async () => {
      // Initialize without passing second argument - uses default empty object {}
      await service.initializeAnalysis('test-with-team');

      // Verify all defaults were applied
      expect(mockConfigService.setAnalysis).toHaveBeenCalledWith(
        'test-with-team',
        expect.objectContaining({
          analysisId: 'test-with-team',
          analysisName: 'test-with-team',
          enabled: false,
          intendedState: 'stopped',
          lastStartTime: null,
          teamId: null,
        }),
      );

      // Verify warning about missing name
      // Note: hasAnalysisConfig is true because the default parameter is {} (not undefined)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          analysisId: 'test-with-team',
          hasAnalysisConfig: true, // Default param {} is truthy
          configKeys: [],
        }),
        'Analysis name not found in config, using analysisId as name',
      );
    });

    it('should create AnalysisProcess with correct service adapter', async () => {
      const fullConfig = {
        name: 'Service Adapter Test',
        enabled: true,
      };

      await service.initializeAnalysis('standard-test-analysis', fullConfig);

      // Get the created AnalysisProcess
      const setAnalysisCall = mockConfigService.setAnalysis.mock.calls[0];
      const analysisProcess = setAnalysisCall[1];

      // Verify the AnalysisProcess has a service property (the adapter)
      expect(analysisProcess.service).toBeDefined();
      expect(typeof analysisProcess.service.getEnvironment).toBe('function');
      expect(typeof analysisProcess.service.saveConfig).toBe('function');
    });
  });

  describe('runAnalysis()', () => {
    it('should throw error when analysis not found', async () => {
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      await expect(service.runAnalysis('nonexistent-id')).rejects.toThrow(
        'Analysis nonexistent-id not found',
      );
    });

    it('should return early if analysis is already running', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        status: 'running',
        process: { pid: 123, killed: false },
        logs: [{ message: 'log' }],
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const result = await service.runAnalysis('analysis-1');

      expect(result).toEqual({
        success: true,
        status: 'running',
        logs: mockAnalysis.logs,
        alreadyRunning: true,
      });
      expect(mockAnalysis.start).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'runAnalysis' }),
        'Analysis is already running',
      );
    });

    it('should start analysis and save config', async () => {
      const mockAnalysis = createMockAnalysisProcess({ status: 'stopped' });
      mockAnalysis.start.mockResolvedValue(undefined);
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const result = await service.runAnalysis('analysis-1');

      expect(mockAnalysis.start).toHaveBeenCalled();
      expect(mockConfigService.saveConfig).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'runAnalysis',
          analysisId: 'analysis-1',
        }),
        'Analysis started successfully',
      );
    });

    it('should handle start errors', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      const startError = new Error('Start failed');
      mockAnalysis.start.mockRejectedValue(startError);
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      await expect(service.runAnalysis('analysis-1')).rejects.toThrow(
        'Start failed',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'runAnalysis',
          analysisId: 'analysis-1',
          error: startError,
        }),
        'Failed to start analysis',
      );
    });

    it('should prevent concurrent starts for same analysis', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      let resolveStart: (() => void) | undefined;
      mockAnalysis.start.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveStart = resolve;
          }),
      );
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      // Start first run
      const promise1 = service.runAnalysis('analysis-1');

      // Attempt second run while first is in progress
      expect(service.isStartInProgress('analysis-1')).toBe(true);

      const promise2 = service.runAnalysis('analysis-1');

      // Complete the first operation
      resolveStart!();
      await vi.waitFor(() => !service.isStartInProgress('analysis-1'));

      // Both should return the same result
      const results = await Promise.all([promise1, promise2]);
      expect(results[0]).toEqual(results[1]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'runAnalysis',
          analysisId: 'analysis-1',
        }),
        'Start operation already in progress, waiting for completion',
      );
    }, 15000);

    it('should clean up locks after successful start', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      mockAnalysis.start.mockResolvedValue(undefined);
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      await service.runAnalysis('analysis-1');

      expect(service.isStartInProgress('analysis-1')).toBe(false);
      expect(service.getStartLocks().size).toBe(0);
    });

    it('should clean up locks after failed start', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      mockAnalysis.start.mockRejectedValue(new Error('Start failed'));
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      try {
        await service.runAnalysis('analysis-1');
      } catch {
        // Expected error
      }

      expect(service.isStartInProgress('analysis-1')).toBe(false);
      expect(service.getStartLocks().size).toBe(0);
    });

    it('should handle concurrent start errors', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      mockAnalysis.start.mockRejectedValue(new Error('Start failed'));
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      // Start first run
      const promise1 = service.runAnalysis('analysis-1');

      // Attempt second run while first is in progress
      const promise2 = service.runAnalysis('analysis-1');

      // Both should reject
      await expect(promise1).rejects.toThrow('Start failed');
      await expect(promise2).rejects.toThrow('Start failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'runAnalysis',
          analysisId: 'analysis-1',
        }),
        'Concurrent start operation failed',
      );
    });
  });

  describe('stopAnalysis()', () => {
    it('should throw error when analysis not found', async () => {
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      await expect(service.stopAnalysis('nonexistent-id')).rejects.toThrow(
        'Analysis not found',
      );
    });

    it('should set intended state to stopped and stop process', async () => {
      const mockAnalysis = createMockAnalysisProcess({ status: 'running' });
      mockAnalysis.stop.mockResolvedValue(undefined);
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const result = await service.stopAnalysis('analysis-1');

      expect(mockAnalysis.intendedState).toBe('stopped');
      expect(mockAnalysis.stop).toHaveBeenCalled();
      expect(mockConfigService.saveConfig).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'stopAnalysis',
          analysisId: 'analysis-1',
        }),
        'Analysis stopped',
      );
    });

    it('should use custom logger if provided', async () => {
      const customLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as any;
      const mockAnalysis = createMockAnalysisProcess();
      mockAnalysis.stop.mockResolvedValue(undefined);
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      await service.stopAnalysis('analysis-1', customLogger);

      expect(customLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'stopAnalysis',
          analysisId: 'analysis-1',
        }),
        'Stopping analysis',
      );
    });
  });

  describe('isStartInProgress', () => {
    it('should return false when no start operations in progress', () => {
      expect(service.isStartInProgress('analysis-1')).toBe(false);
    });

    it('should return true when start operation is in progress', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      let resolveStart: (() => void) | undefined;
      mockAnalysis.start.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveStart = resolve;
          }),
      );
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const promise = service.runAnalysis('analysis-1');

      expect(service.isStartInProgress('analysis-1')).toBe(true);

      resolveStart!();
      await vi.waitFor(() => !service.isStartInProgress('analysis-1'));
      await promise;

      expect(service.isStartInProgress('analysis-1')).toBe(false);
    }, 15000);
  });

  describe('getStartOperationsInProgress', () => {
    it('should return empty array when no operations in progress', () => {
      expect(service.getStartOperationsInProgress()).toEqual([]);
    });

    it('should return array of analysis IDs with operations in progress', async () => {
      const mockAnalysis1 = createMockAnalysisProcess();
      let resolveStart1: (() => void) | undefined;
      mockAnalysis1.start.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveStart1 = resolve;
          }),
      );
      const mockAnalysis2 = createMockAnalysisProcess();
      let resolveStart2: (() => void) | undefined;
      mockAnalysis2.start.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveStart2 = resolve;
          }),
      );

      mockConfigService.getAnalysisProcess.mockImplementation((id) => {
        return id === 'analysis-1' ? mockAnalysis1 : mockAnalysis2;
      });

      const promise1 = service.runAnalysis('analysis-1');
      const promise2 = service.runAnalysis('analysis-2');

      const operationsInProgress = service.getStartOperationsInProgress();
      expect(operationsInProgress).toContain('analysis-1');
      expect(operationsInProgress).toContain('analysis-2');

      resolveStart1!();
      resolveStart2!();

      await Promise.all([promise1, promise2]);
    }, 15000);
  });

  describe('startHealthCheck', () => {
    it('should start health check interval', () => {
      service.startHealthCheck();

      expect(service.getHealthCheckInterval()).not.toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Started periodic health check for analyses (5 minute interval)',
      );
    });

    it('should clear existing interval before starting new one', () => {
      service.startHealthCheck();
      const firstInterval = service.getHealthCheckInterval();

      service.startHealthCheck();
      const secondInterval = service.getHealthCheckInterval();

      expect(firstInterval).not.toBe(secondInterval);
    });

    it('should start metrics collection', () => {
      service.startHealthCheck();

      expect(service.getMetricsInterval()).not.toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Started process metrics collection (1 second interval)',
      );
    });

    it('should run health check periodically', async () => {
      vi.useRealTimers();
      const mockRunHealthCheck = vi
        .spyOn(service, 'runHealthCheck' as any)
        .mockResolvedValue(undefined);

      service.startHealthCheck();

      // Wait for first interval execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      mockRunHealthCheck.mockRestore();
      service.stopHealthCheck();
      vi.useFakeTimers();
    });

    it('should handle health check errors', async () => {
      vi.useRealTimers();
      const error = new Error('Health check error');
      const mockRunHealthCheck = vi
        .spyOn(service, 'runHealthCheck' as any)
        .mockRejectedValue(error);

      service.startHealthCheck();

      await new Promise((resolve) => setTimeout(resolve, 100));

      mockRunHealthCheck.mockRestore();
      service.stopHealthCheck();
      vi.useFakeTimers();
    });
  });

  describe('runHealthCheck', () => {
    it('should restart enabled analyses that should be running but are not', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        enabled: true,
        intendedState: 'running',
        status: 'stopped',
      });
      mockAnalysis.start.mockResolvedValue(undefined);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([['analysis-1', mockAnalysis]]),
      );

      await (service as any).runHealthCheck();

      expect(mockAnalysis.start).toHaveBeenCalled();
      expect(mockLogService.addLog).toHaveBeenCalledWith(
        'analysis-1',
        'Restarted by periodic health check',
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Health check: analysis-1 should be running but is stopped. Attempting restart.',
      );
    });

    it('should not restart disabled analyses', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        enabled: false,
        intendedState: 'running',
        status: 'stopped',
      });
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([['analysis-1', mockAnalysis]]),
      );

      await (service as any).runHealthCheck();

      expect(mockAnalysis.start).not.toHaveBeenCalled();
    });

    it('should skip already running analyses', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        enabled: true,
        intendedState: 'running',
        status: 'running',
      });
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([['analysis-1', mockAnalysis]]),
      );

      await (service as any).runHealthCheck();

      expect(mockAnalysis.start).not.toHaveBeenCalled();
    });

    it('should reset connection error flags on successful restart', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        enabled: true,
        intendedState: 'running',
        status: 'stopped',
        connectionErrorDetected: true,
        restartAttempts: 3,
      });
      mockAnalysis.start.mockResolvedValue(undefined);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([['analysis-1', mockAnalysis]]),
      );

      await (service as any).runHealthCheck();

      expect(mockAnalysis.connectionErrorDetected).toBe(false);
      expect(mockAnalysis.restartAttempts).toBe(0);
    });

    it('should handle restart errors gracefully', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        enabled: true,
        intendedState: 'running',
        status: 'stopped',
      });
      const error = new Error('Restart failed');
      mockAnalysis.start.mockRejectedValue(error);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([['analysis-1', mockAnalysis]]),
      );

      await (service as any).runHealthCheck();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: error,
          analysisId: 'analysis-1',
        }),
        'Health check: Failed to restart analysis',
      );
    });

    it('should process multiple analyses', async () => {
      const mockAnalysis1 = createMockAnalysisProcess({
        enabled: true,
        intendedState: 'running',
        status: 'stopped',
      });
      mockAnalysis1.start.mockResolvedValue(undefined);

      const mockAnalysis2 = createMockAnalysisProcess({
        enabled: true,
        intendedState: 'running',
        status: 'stopped',
      });
      mockAnalysis2.start.mockResolvedValue(undefined);

      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([
          ['analysis-1', mockAnalysis1],
          ['analysis-2', mockAnalysis2],
        ]),
      );

      await (service as any).runHealthCheck();

      expect(mockAnalysis1.start).toHaveBeenCalled();
      expect(mockAnalysis2.start).toHaveBeenCalled();
    });
  });

  describe('stopHealthCheck', () => {
    it('should stop health check interval', () => {
      service.startHealthCheck();
      expect(service.getHealthCheckInterval()).not.toBeNull();

      service.stopHealthCheck();

      expect(service.getHealthCheckInterval()).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Stopped periodic health check',
      );
    });

    it('should stop metrics interval', () => {
      service.startHealthCheck();
      expect(service.getMetricsInterval()).not.toBeNull();

      service.stopHealthCheck();

      expect(service.getMetricsInterval()).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Stopped metrics collection',
      );
    });

    it('should handle stopping when not started', () => {
      service.stopHealthCheck();

      expect(service.getHealthCheckInterval()).toBeNull();
      expect(service.getMetricsInterval()).toBeNull();
    });
  });

  describe('startMetricsCollection', () => {
    it('should start metrics collection interval', () => {
      service.startMetricsCollection();

      expect(service.getMetricsInterval()).not.toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Started process metrics collection (1 second interval)',
      );
    });

    it('should collect metrics periodically', async () => {
      // Use fake timers for this test
      const mockAnalysisMap = new Map([
        ['analysis-1', createMockAnalysisProcess()],
      ]);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        mockAnalysisMap,
      );
      mockCollectChildProcessMetrics.mockResolvedValue(undefined);

      service.startMetricsCollection();

      // Advance time past the metrics interval (1000ms)
      await vi.advanceTimersByTimeAsync(1100);

      service.stopHealthCheck();

      expect(mockCollectChildProcessMetrics).toHaveBeenCalledWith(
        mockAnalysisMap,
      );
    });

    it('should handle metrics collection errors', async () => {
      vi.useRealTimers();
      const error = new Error('Metrics collection failed');
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(new Map());
      mockCollectChildProcessMetrics.mockRejectedValue(error);

      service.startMetricsCollection();

      await new Promise((resolve) => setTimeout(resolve, 100));

      service.stopHealthCheck();
      vi.useFakeTimers();
    });

    it('should clear existing interval before starting new one', () => {
      service.startMetricsCollection();
      const firstInterval = service.getMetricsInterval();

      service.startMetricsCollection();
      const secondInterval = service.getMetricsInterval();

      expect(firstInterval).not.toBe(secondInterval);
    });
  });

  describe('getProcessStatus', () => {
    it('should return analysis status when found', () => {
      const mockAnalysis = createMockAnalysisProcess({ status: 'running' });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const status = service.getProcessStatus('analysis-1');

      expect(status).toBe('running');
    });

    it('should return stopped when analysis not found', () => {
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      const status = service.getProcessStatus('nonexistent-id');

      expect(status).toBe('stopped');
    });
  });

  describe('getRunningAnalysesCount', () => {
    it('should return 0 when no analyses are running', () => {
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([
          ['analysis-1', createMockAnalysisProcess({ status: 'stopped' })],
          ['analysis-2', createMockAnalysisProcess({ status: 'stopped' })],
        ]),
      );

      const count = service.getRunningAnalysesCount();

      expect(count).toBe(0);
    });

    it('should count running analyses', () => {
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([
          ['analysis-1', createMockAnalysisProcess({ status: 'running' })],
          ['analysis-2', createMockAnalysisProcess({ status: 'stopped' })],
          ['analysis-3', createMockAnalysisProcess({ status: 'running' })],
        ]),
      );

      const count = service.getRunningAnalysesCount();

      expect(count).toBe(2);
    });

    it('should handle empty map', () => {
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(new Map());

      const count = service.getRunningAnalysesCount();

      expect(count).toBe(0);
    });
  });

  describe('waitForAnalysisConnection', () => {
    it('should resolve immediately if already connected', async () => {
      const mockAnalysis = createMockAnalysisProcess({ isConnected: true });

      const connected = await service.waitForAnalysisConnection(mockAnalysis);

      expect(connected).toBe(true);
    });

    it('should resolve true when connection established', async () => {
      vi.useRealTimers();
      const mockAnalysis = createMockAnalysisProcess({ isConnected: false });

      const promise = service.waitForAnalysisConnection(mockAnalysis, 1000);

      // Simulate connection
      setTimeout(() => {
        mockAnalysis.isConnected = true;
      }, 200);

      const connected = await promise;
      expect(connected).toBe(true);
      vi.useFakeTimers();
    }, 15000);

    it('should resolve false when timeout exceeded', async () => {
      vi.useRealTimers();
      const mockAnalysis = createMockAnalysisProcess({ isConnected: false });

      const promise = service.waitForAnalysisConnection(mockAnalysis, 300);

      const connected = await promise;
      expect(connected).toBe(false);
      vi.useFakeTimers();
    }, 15000);

    it('should use custom timeout', async () => {
      vi.useRealTimers();
      const mockAnalysis = createMockAnalysisProcess({ isConnected: false });

      const promise = service.waitForAnalysisConnection(mockAnalysis, 200);

      const connected = await promise;
      expect(connected).toBe(false);
      vi.useFakeTimers();
    }, 15000);
  });

  describe('verifyIntendedState', () => {
    it('should return empty results when no analyses should be running', async () => {
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(new Map());
      service.getAnalysesThatShouldBeRunning = vi.fn().mockReturnValue([]);

      const results = await service.verifyIntendedState();

      expect(results).toEqual({
        shouldBeRunning: 0,
        attempted: [],
        succeeded: [],
        failed: [],
        alreadyRunning: [],
        connected: [],
        connectionTimeouts: [],
      });
      expect(mockLogger.info).toHaveBeenCalledWith('No analyses need starting');
    });

    it('should start analyses in batches', async () => {
      // Use real timers for this test since it involves batch delays
      vi.useRealTimers();

      // Create 12 mock analyses - this will test batching (default batch size is 5)
      const mockAnalyses = Array.from({ length: 12 }, (_, i) => {
        const analysis = createMockAnalysisProcess({
          analysisId: `analysis-${i}`,
          isConnected: true, // Make them instantly connected
        });
        analysis.start.mockResolvedValue(undefined);
        return analysis;
      });

      const analysisMap = new Map(
        mockAnalyses.map((a, i) => [`analysis-${i}`, a] as [string, typeof a]),
      );
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(analysisMap);
      mockConfigService.getAnalysisProcess.mockImplementation((id: string) =>
        analysisMap.get(id),
      );

      const shouldBeRunningIds = Array.from(
        { length: 12 },
        (_, i) => `analysis-${i}`,
      );
      service.getAnalysesThatShouldBeRunning = vi
        .fn()
        .mockReturnValue(shouldBeRunningIds);
      // Mock waitForAnalysisConnection to return immediately
      service.waitForAnalysisConnection = vi.fn().mockResolvedValue(true);

      const results = await service.verifyIntendedState();

      // Restore fake timers
      vi.useFakeTimers();

      expect(results.shouldBeRunning).toBe(12);
      expect(results.attempted).toHaveLength(12);
      expect(results.succeeded).toHaveLength(12);
      // Verify batch logging occurred (3 batches for 12 analyses with batch size 5)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting 3 batches of up to 5 analyses each',
      );
    });

    it('should handle connection timeouts', async () => {
      const mockAnalysis = createMockAnalysisProcess({ isConnected: false });
      mockAnalysis.start.mockResolvedValue(undefined);

      const analysisMap = new Map([['analysis-1', mockAnalysis]] as [
        string,
        typeof mockAnalysis,
      ][]);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(analysisMap);
      mockConfigService.getAnalysisProcess.mockImplementation((id: string) =>
        analysisMap.get(id),
      );

      service.getAnalysesThatShouldBeRunning = vi
        .fn()
        .mockReturnValue(['analysis-1']);
      // Mock waitForAnalysisConnection to return false (timeout)
      service.waitForAnalysisConnection = vi.fn().mockResolvedValue(false);

      const results = await service.verifyIntendedState();

      expect(results.connectionTimeouts).toContain('analysis-1');
      expect(results.succeeded).toContain('analysis-1');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'analysis-1 connection timeout (proceeding anyway)',
      );
    });

    it('should handle start failures', async () => {
      const mockAnalysis = createMockAnalysisProcess();
      const error = new Error('Start failed');
      mockAnalysis.start.mockRejectedValue(error);

      const analysisMap = new Map([['analysis-1', mockAnalysis]] as [
        string,
        typeof mockAnalysis,
      ][]);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(analysisMap);
      mockConfigService.getAnalysisProcess.mockImplementation((id: string) =>
        analysisMap.get(id),
      );

      service.getAnalysesThatShouldBeRunning = vi
        .fn()
        .mockReturnValue(['analysis-1']);

      const results = await service.verifyIntendedState();

      expect(results.failed).toHaveLength(1);
      expect(results.failed[0]).toEqual({
        analysisId: 'analysis-1',
        error: 'Start failed',
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: error,
          analysisId: 'analysis-1',
        }),
        'Failed to start analysis',
      );
    });

    it('should skip analyses that are already running', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        status: 'running',
        process: { pid: 123, killed: false },
      });

      const analysisMap = new Map([['analysis-1', mockAnalysis]] as [
        string,
        typeof mockAnalysis,
      ][]);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(analysisMap);
      mockConfigService.getAnalysisProcess.mockImplementation((id: string) =>
        analysisMap.get(id),
      );

      service.getAnalysesThatShouldBeRunning = vi
        .fn()
        .mockReturnValue(['analysis-1']);

      const results = await service.verifyIntendedState();

      expect(results.alreadyRunning).toContain('analysis-1');
      expect(results.attempted).toContain('analysis-1');
      expect(mockAnalysis.start).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'analysis-1 is already running with PID 123',
      );
    });

    it('should reset status for dead processes', async () => {
      const mockAnalysis = createMockAnalysisProcess({
        status: 'running',
        process: { pid: 123, killed: true },
        isConnected: true,
      });
      mockAnalysis.start.mockResolvedValue(undefined);

      const analysisMap = new Map([['analysis-1', mockAnalysis]] as [
        string,
        typeof mockAnalysis,
      ][]);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(analysisMap);
      mockConfigService.getAnalysisProcess.mockImplementation((id: string) =>
        analysisMap.get(id),
      );

      service.getAnalysesThatShouldBeRunning = vi
        .fn()
        .mockReturnValue(['analysis-1']);

      await service.verifyIntendedState();

      // Should have reset status and process before attempting start
      expect(mockAnalysis.status).toBe('stopped');
      expect(mockAnalysis.process).toBeNull();
      expect(mockAnalysis.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'analysis-1 status shows running but no live process found - resetting status and restarting',
      );
    });

    it('should add log for successful restarts', async () => {
      const mockAnalysis = createMockAnalysisProcess({ isConnected: true });
      mockAnalysis.start.mockResolvedValue(undefined);

      const analysisMap = new Map([['analysis-1', mockAnalysis]] as [
        string,
        typeof mockAnalysis,
      ][]);
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(analysisMap);
      mockConfigService.getAnalysisProcess.mockImplementation((id: string) =>
        analysisMap.get(id),
      );

      service.getAnalysesThatShouldBeRunning = vi
        .fn()
        .mockReturnValue(['analysis-1']);

      await service.verifyIntendedState();

      expect(mockLogService.addLog).toHaveBeenCalledWith(
        'analysis-1',
        'Restarted during intended state verification',
      );
    });

    it('should use batch size from environment variable', async () => {
      // Use real timers for this test since it involves batch delays
      vi.useRealTimers();
      process.env.ANALYSIS_BATCH_SIZE = '3';

      const mockAnalyses = Array.from({ length: 10 }, (_, i) => {
        const analysis = createMockAnalysisProcess({
          analysisId: `analysis-${i}`,
          isConnected: true,
        });
        analysis.start.mockResolvedValue(undefined);
        return analysis;
      });

      const analysisMap = new Map(
        mockAnalyses.map((a, i) => [`analysis-${i}`, a] as [string, typeof a]),
      );
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(analysisMap);
      mockConfigService.getAnalysisProcess.mockImplementation((id: string) =>
        analysisMap.get(id),
      );

      const shouldBeRunningIds = Array.from(
        { length: 10 },
        (_, i) => `analysis-${i}`,
      );
      service.getAnalysesThatShouldBeRunning = vi
        .fn()
        .mockReturnValue(shouldBeRunningIds);
      // Mock waitForAnalysisConnection to return immediately
      service.waitForAnalysisConnection = vi.fn().mockResolvedValue(true);

      const results = await service.verifyIntendedState();

      // Restore fake timers and clean up env
      vi.useFakeTimers();
      delete process.env.ANALYSIS_BATCH_SIZE;

      expect(results.attempted).toHaveLength(10);
      expect(results.succeeded).toHaveLength(10);
      // With batch size of 3, 10 analyses should result in 4 batches
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting 4 batches of up to 3 analyses each',
      );
    });
  });

  describe('getAnalysesThatShouldBeRunning', () => {
    it('should return empty array when no analyses should be running', () => {
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([
          [
            'analysis-1',
            createMockAnalysisProcess({ intendedState: 'stopped' }),
          ],
          [
            'analysis-2',
            createMockAnalysisProcess({ intendedState: 'stopped' }),
          ],
        ]),
      );

      const result = service.getAnalysesThatShouldBeRunning();

      expect(result).toEqual([]);
    });

    it('should return analyses with intendedState running', () => {
      mockConfigService.getAllAnalysisProcesses.mockReturnValue(
        new Map([
          [
            'analysis-1',
            createMockAnalysisProcess({ intendedState: 'running' }),
          ],
          [
            'analysis-2',
            createMockAnalysisProcess({ intendedState: 'stopped' }),
          ],
          [
            'analysis-3',
            createMockAnalysisProcess({ intendedState: 'running' }),
          ],
        ]),
      );

      const result = service.getAnalysesThatShouldBeRunning();

      expect(result).toEqual(['analysis-1', 'analysis-3']);
    });
  });

  describe('collectAnalysesToStart', () => {
    it('should skip already running analyses with live process', () => {
      const mockAnalysis = createMockAnalysisProcess({
        status: 'running',
        process: { pid: 123, killed: false },
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const results = {
        shouldBeRunning: 1,
        attempted: [],
        succeeded: [],
        failed: [],
        alreadyRunning: [],
        connected: [],
        connectionTimeouts: [],
      };

      const toStart = service.collectAnalysesToStart(['analysis-1'], results);

      expect(toStart).toEqual([]);
      expect(results.alreadyRunning).toContain('analysis-1');
      expect(results.attempted).toContain('analysis-1');
    });

    it('should include analyses not running', () => {
      const mockAnalysis = createMockAnalysisProcess({ status: 'stopped' });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const results = {
        shouldBeRunning: 1,
        attempted: [],
        succeeded: [],
        failed: [],
        alreadyRunning: [],
        connected: [],
        connectionTimeouts: [],
      };

      const toStart = service.collectAnalysesToStart(['analysis-1'], results);

      expect(toStart).toHaveLength(1);
      expect(toStart[0]).toEqual({
        analysisId: 'analysis-1',
        analysis: mockAnalysis,
      });
    });

    it('should reset status for dead processes marked as running', () => {
      const mockAnalysis = createMockAnalysisProcess({
        status: 'running',
        process: { pid: 123, killed: true },
      });
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      const results = {
        shouldBeRunning: 1,
        attempted: [],
        succeeded: [],
        failed: [],
        alreadyRunning: [],
        connected: [],
        connectionTimeouts: [],
      };

      const toStart = service.collectAnalysesToStart(['analysis-1'], results);

      expect(mockAnalysis.status).toBe('stopped');
      expect(mockAnalysis.process).toBeNull();
      expect(toStart).toHaveLength(1);
    });

    it('should skip non-existent analyses', () => {
      mockConfigService.getAnalysisProcess.mockReturnValue(null);

      const results = {
        shouldBeRunning: 1,
        attempted: [],
        succeeded: [],
        failed: [],
        alreadyRunning: [],
        connected: [],
        connectionTimeouts: [],
      };

      const toStart = service.collectAnalysesToStart(['analysis-1'], results);

      expect(toStart).toEqual([]);
      expect(results.attempted).toEqual([]);
    });
  });

  describe('createAnalysisBatches', () => {
    it('should create single batch when below batch size', () => {
      const items = Array.from({ length: 3 }, (_, i) => ({
        analysisId: `analysis-${i}`,
        analysis: createMockAnalysisProcess(),
      }));

      const batches = service.createAnalysisBatches(items, 5);

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
    });

    it('should create multiple batches', () => {
      const items = Array.from({ length: 13 }, (_, i) => ({
        analysisId: `analysis-${i}`,
        analysis: createMockAnalysisProcess(),
      }));

      const batches = service.createAnalysisBatches(items, 5);

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(5);
      expect(batches[1]).toHaveLength(5);
      expect(batches[2]).toHaveLength(3);
    });

    it('should handle empty array', () => {
      const batches = service.createAnalysisBatches([], 5);

      expect(batches).toEqual([]);
    });
  });

  describe('test helpers', () => {
    it('should reset start locks', () => {
      const mockAnalysis = createMockAnalysisProcess();
      mockAnalysis.start.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      void service.runAnalysis('analysis-1');
      expect(service.getStartLocks().size).toBe(1);

      service.resetStartLocks();
      expect(service.getStartLocks().size).toBe(0);
    });

    it('should get start locks', () => {
      const mockAnalysis = createMockAnalysisProcess();
      mockAnalysis.start.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );
      mockConfigService.getAnalysisProcess.mockReturnValue(mockAnalysis);

      void service.runAnalysis('analysis-1');

      const locks = service.getStartLocks();
      expect(locks).toBeInstanceOf(Map);
      expect(locks.has('analysis-1')).toBe(true);
    });
  });

  // Cleanup global test storage after all tests complete
  afterAll(() => {
    teardownTestStorageConfig();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockAnalysisProcess,
  createMockFile,
} from '../utils/testHelpers.js';

// Mock dependencies
vi.mock('../../src/models/analysisProcess.js', () => ({
  default: class MockAnalysisProcess {
    constructor(name, service) {
      this.analysisName = name;
      this.service = service;
      this.enabled = false;
      this.status = 'stopped';
      this.intendedState = 'stopped';
      this.lastStartTime = null;
      this.teamId = null;
      this.logs = [];
      this.logSequence = 0;
      this.totalLogCount = 0;
    }
    async start() {}
    async stop() {}
    async cleanup() {}
    async addLog() {}
    async initializeLogState() {}
  },
}));

vi.mock('../../src/utils/safePath.js', () => ({
  safeMkdir: vi.fn().mockResolvedValue(undefined),
  safeWriteFile: vi.fn().mockResolvedValue(undefined),
  safeReadFile: vi.fn().mockResolvedValue('{}'),
  safeReaddir: vi.fn().mockResolvedValue([]),
  safeStat: vi.fn().mockResolvedValue({
    isFile: () => true,
    size: 1024,
    birthtime: new Date(),
  }),
  safeRename: vi.fn().mockResolvedValue(undefined),
  safeUnlink: vi.fn().mockResolvedValue(undefined),
  getAnalysisPath: vi.fn((name) => `/tmp/analyses/${name}`),
  isAnalysisNameSafe: vi.fn(() => true),
  sanitizeAndValidateFilename: vi.fn((filename) => filename),
}));

vi.mock('../../src/utils/cryptoUtils.js', () => ({
  encrypt: vi.fn((value) => `encrypted_${value}`),
  decrypt: vi.fn((value) => value.replace('encrypted_', '')),
}));

const mockGetAllTeams = vi
  .fn()
  .mockResolvedValue([{ id: 'uncategorized', name: 'Uncategorized' }]);

vi.mock('../../src/services/teamService.js', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(undefined),
    addItemToTeamStructure: vi.fn().mockResolvedValue(undefined),
    ensureAnalysisHasTeam: vi.fn().mockResolvedValue(undefined),
    getAllTeams: mockGetAllTeams,
    getTeam: vi.fn().mockResolvedValue({ id: 'team-1', name: 'Team 1' }),
  },
}));

vi.mock('../../src/config/default.js', () => {
  const storageBase = '/tmp/test-analyses-storage';

  // Build config object like production does - derive paths from storage.base
  const mockConfig = {
    env: 'test',
    secretKey: 'test-secret-key-for-testing-purposes-only-32-chars',
    storage: {
      base: storageBase,
      createDirs: true,
    },
    analysis: {
      maxLogsInMemory: 100,
      forceKillTimeout: 5000,
      autoRestartDelay: 5000,
    },
  };

  // Derive paths from storage.base (matches production behavior in default.js)
  mockConfig.paths = {
    analysis: `${mockConfig.storage.base}/analyses`,
    config: `${mockConfig.storage.base}/config`,
  };

  // Derive files from paths (matches production behavior in default.js)
  mockConfig.files = {
    config: `${mockConfig.paths.config}/analyses-config.json`,
  };

  return { default: mockConfig };
});

vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

const { safeMkdir, safeWriteFile, safeReadFile, safeReaddir } = await import(
  '../../src/utils/safePath.js'
);
const teamService = (await import('../../src/services/teamService.js')).default;

// Export the mock function so we can reset it in tests
export { mockGetAllTeams };

describe('AnalysisService', () => {
  let analysisService;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import to get fresh instance
    const module = await import('../../src/services/analysisService.js');
    analysisService = module.analysisService;
    // Reset the service state
    analysisService.analyses = new Map();
    analysisService.configCache = null;
    analysisService.startLocks = new Map();
  });

  describe('initialization', () => {
    it('should initialize storage and load configuration', async () => {
      safeReadFile.mockResolvedValue(
        JSON.stringify({
          version: '4.1',
          analyses: {},
          teamStructure: {},
        }),
      );
      safeReaddir.mockResolvedValue([]);

      await analysisService.initialize();

      expect(safeReadFile).toHaveBeenCalled();
      expect(teamService.initialize).toHaveBeenCalled();
    });

    it('should create default config if none exists', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      await analysisService.loadConfig();

      expect(safeWriteFile).toHaveBeenCalled();
      expect(analysisService.configCache).toEqual({
        version: '4.1',
        analyses: {},
        teamStructure: {},
      });
    });
  });

  describe('uploadAnalysis', () => {
    it('should upload and register a new analysis', async () => {
      const mockFile = createMockFile();
      const teamId = 'team-123';
      const targetFolderId = 'folder-123';

      safeMkdir.mockResolvedValue(undefined);
      safeWriteFile.mockResolvedValue(undefined);
      // Mock file reading for initializeVersionManagement
      safeReadFile.mockResolvedValue('console.log("test analysis");');

      const result = await analysisService.uploadAnalysis(
        mockFile,
        teamId,
        targetFolderId,
      );

      expect(result).toEqual({ analysisName: 'test-analysis' });
      expect(mockFile.mv).toHaveBeenCalled();
      expect(analysisService.analyses.has('test-analysis')).toBe(true);
      expect(teamService.addItemToTeamStructure).toHaveBeenCalledWith(
        teamId,
        expect.objectContaining({
          type: 'analysis',
          analysisName: 'test-analysis',
        }),
        targetFolderId,
      );
    });

    it('should assign to Uncategorized team if no team specified', async () => {
      const mockFile = createMockFile();
      // Mock file reading for initializeVersionManagement
      safeReadFile.mockResolvedValue('console.log("test analysis");');
      // Reset and configure getAllTeams mock
      mockGetAllTeams.mockResolvedValueOnce([
        { id: 'uncategorized', name: 'Uncategorized' },
      ]);

      const result = await analysisService.uploadAnalysis(mockFile, null, null);

      expect(result).toEqual({ analysisName: 'test-analysis' });
      const analysis = analysisService.analyses.get('test-analysis');
      expect(analysis.teamId).toBe('uncategorized');
    });

    it('should throw error for unsafe analysis names', async () => {
      const mockFile = createMockFile({
        name: '../../../etc/passwd.js',
      });

      const { isAnalysisNameSafe } = await import(
        '../../src/utils/safePath.js'
      );
      isAnalysisNameSafe.mockReturnValue(false);

      await expect(
        analysisService.uploadAnalysis(mockFile, 'team-123', null),
      ).rejects.toThrow('Invalid analysis name');
    });
  });

  describe('runAnalysis', () => {
    it('should start an analysis successfully', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.runAnalysis('test-analysis');

      expect(analysis.start).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should prevent concurrent start operations', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Start analysis twice concurrently
      const promise1 = analysisService.runAnalysis('test-analysis');
      const promise2 = analysisService.runAnalysis('test-analysis');

      await Promise.all([promise1, promise2]);

      // Should only call start once
      expect(analysis.start).toHaveBeenCalledTimes(1);
    });

    it('should throw error if analysis not found', async () => {
      await expect(analysisService.runAnalysis('nonexistent')).rejects.toThrow(
        'Analysis nonexistent not found',
      );
    });

    it('should return early if analysis already running', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'running',
        process: { pid: 12345 },
      });
      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.runAnalysis('test-analysis');

      expect(result.alreadyRunning).toBe(true);
      expect(analysis.start).not.toHaveBeenCalled();
    });
  });

  describe('stopAnalysis', () => {
    it('should stop a running analysis', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'running',
      });
      analysisService.analyses.set('test-analysis', analysis);

      await analysisService.stopAnalysis('test-analysis');

      expect(analysis.stop).toHaveBeenCalled();
      expect(analysis.intendedState).toBe('stopped');
    });

    it('should throw error if analysis not found', async () => {
      await expect(analysisService.stopAnalysis('nonexistent')).rejects.toThrow(
        'Analysis not found',
      );
    });
  });

  describe('deleteAnalysis', () => {
    it('should delete analysis and cleanup resources', async () => {
      const analysis = createMockAnalysisProcess({
        teamId: 'team-123',
      });
      analysisService.analyses.set('test-analysis', analysis);
      analysisService.configCache = {
        version: '4.1',
        analyses: { 'test-analysis': {} },
        teamStructure: {
          'team-123': {
            items: [
              { id: '1', type: 'analysis', analysisName: 'test-analysis' },
            ],
          },
        },
      };

      const { promises: fs } = await import('fs');

      await analysisService.deleteAnalysis('test-analysis');

      expect(analysis.stop).toHaveBeenCalled();
      expect(analysis.cleanup).toHaveBeenCalled();
      expect(fs.rm).toHaveBeenCalled();
      expect(analysisService.analyses.has('test-analysis')).toBe(false);
    });

    it('should remove analysis from team structure', async () => {
      const analysis = createMockAnalysisProcess({
        teamId: 'team-123',
      });
      analysisService.analyses.set('test-analysis', analysis);
      analysisService.configCache = {
        version: '4.1',
        analyses: { 'test-analysis': {} },
        teamStructure: {
          'team-123': {
            items: [
              { id: '1', type: 'analysis', analysisName: 'test-analysis' },
              { id: '2', type: 'analysis', analysisName: 'other-analysis' },
            ],
          },
        },
      };

      await analysisService.deleteAnalysis('test-analysis');

      const teamItems =
        analysisService.configCache.teamStructure['team-123'].items;
      expect(teamItems).toHaveLength(1);
      expect(teamItems[0].analysisName).toBe('other-analysis');
    });
  });

  describe('renameAnalysis', () => {
    it('should rename analysis successfully', async () => {
      const analysis = createMockAnalysisProcess({
        analysisName: 'old-name',
        status: 'stopped',
      });
      analysisService.analyses.set('old-name', analysis);

      const { safeRename } = await import('../../src/utils/safePath.js');
      const { promises: fs } = await import('fs');
      const error = new Error('Not found');
      error.code = 'ENOENT';
      fs.access.mockRejectedValueOnce(error);

      const result = await analysisService.renameAnalysis(
        'old-name',
        'new-name',
      );

      expect(result.success).toBe(true);
      expect(safeRename).toHaveBeenCalled();
      expect(analysisService.analyses.has('old-name')).toBe(false);
      expect(analysisService.analyses.has('new-name')).toBe(true);
    });

    it('should throw error if target name already exists', async () => {
      const analysis = createMockAnalysisProcess({
        analysisName: 'old-name',
      });
      analysisService.analyses.set('old-name', analysis);

      const { promises: fs } = await import('fs');
      fs.access.mockResolvedValue(undefined);

      await expect(
        analysisService.renameAnalysis('old-name', 'existing-name'),
      ).rejects.toThrow("target 'existing-name' already exists");
    });

    it('should restart analysis if it was running', async () => {
      const analysis = createMockAnalysisProcess({
        analysisName: 'old-name',
        status: 'running',
      });
      analysisService.analyses.set('old-name', analysis);

      const { promises: fs } = await import('fs');
      const error = new Error('Not found');
      error.code = 'ENOENT';
      fs.access.mockRejectedValueOnce(error);

      const result = await analysisService.renameAnalysis(
        'old-name',
        'new-name',
      );

      expect(result.restarted).toBe(true);
      expect(analysis.stop).toHaveBeenCalled();
      expect(analysis.start).toHaveBeenCalled();
    });
  });

  describe('updateAnalysis', () => {
    it('should update analysis content', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock file reading for version management (returns file content as string)
      safeReadFile.mockImplementation((path) => {
        if (path.includes('metadata.json')) {
          return Promise.resolve(
            JSON.stringify({
              versions: [{ version: 1, timestamp: '2025-01-01', size: 100 }],
              nextVersionNumber: 2,
              currentVersion: 1,
            }),
          );
        }
        return Promise.resolve('old content');
      });

      const result = await analysisService.updateAnalysis('test-analysis', {
        content: 'new content',
      });

      expect(result.success).toBe(true);
      expect(safeWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        'new content',
        expect.any(String),
        'utf8',
      );
    });

    it('should save version before updating', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock existing version metadata and file content
      safeReadFile.mockImplementation((path) => {
        if (path.includes('metadata.json')) {
          return Promise.resolve(
            JSON.stringify({
              versions: [],
              nextVersionNumber: 1,
              currentVersion: 0,
            }),
          );
        }
        return Promise.resolve('old content');
      });

      await analysisService.updateAnalysis('test-analysis', {
        content: 'new content',
      });

      // Should save: version file + metadata + new content + updated metadata
      expect(safeWriteFile).toHaveBeenCalledTimes(4);
    });

    it('should restart analysis if it was running', async () => {
      const stopFn = vi.fn().mockResolvedValue(undefined);
      const startFn = vi.fn().mockResolvedValue(undefined);

      const analysis = createMockAnalysisProcess({
        status: 'running',
        stop: stopFn,
        start: startFn,
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock file reading for version management
      safeReadFile.mockImplementation((path) => {
        if (path.includes('metadata.json')) {
          return Promise.resolve(
            JSON.stringify({
              versions: [{ version: 1, timestamp: '2025-01-01', size: 100 }],
              nextVersionNumber: 2,
              currentVersion: 1,
            }),
          );
        }
        return Promise.resolve('old content');
      });

      const result = await analysisService.updateAnalysis('test-analysis', {
        content: 'new content',
      });

      // restarted is truthy when content was updated and analysis was running
      // (actual implementation returns the content string, not boolean true)
      expect(result.restarted).toBeTruthy();
      expect(stopFn).toHaveBeenCalled();
      expect(startFn).toHaveBeenCalled();
    });

    it('should throw error if analysis not found', async () => {
      await expect(
        analysisService.updateAnalysis('nonexistent', { content: 'new' }),
      ).rejects.toThrow('Analysis nonexistent not found');
    });
  });

  describe('environment management', () => {
    it('should update environment variables', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.updateEnvironment('test-analysis', {
        KEY1: 'value1',
        KEY2: 'value2',
      });

      expect(result.success).toBe(true);
      expect(safeWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('encrypted'),
        expect.any(String),
        'utf8',
      );
    });

    it('should get decrypted environment variables', async () => {
      analysisService.analyses.set(
        'test-analysis',
        createMockAnalysisProcess(),
      );

      safeReadFile.mockResolvedValue(
        'KEY1=encrypted_value1\nKEY2=encrypted_value2',
      );

      const env = await analysisService.getEnvironment('test-analysis');

      expect(env).toEqual({
        KEY1: 'value1',
        KEY2: 'value2',
      });
    });

    it('should return empty object if env file does not exist', async () => {
      analysisService.analyses.set(
        'test-analysis',
        createMockAnalysisProcess(),
      );

      const error = new Error('File not found');
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      const env = await analysisService.getEnvironment('test-analysis');

      expect(env).toEqual({});
    });
  });

  describe('version management', () => {
    it('should get versions list', async () => {
      const v2Content = 'version 2 content';

      // Mock metadata and current file reading
      safeReadFile.mockImplementation((path) => {
        if (path.includes('metadata.json')) {
          return Promise.resolve(
            JSON.stringify({
              versions: [
                { version: 1, timestamp: '2025-01-01', size: 100 },
                { version: 2, timestamp: '2025-01-02', size: 150 },
              ],
              nextVersionNumber: 3,
              currentVersion: 2,
            }),
          );
        }
        if (path.includes('v2.js')) {
          return Promise.resolve(v2Content);
        }
        if (path.includes('index.js')) {
          // Current file matches v2
          return Promise.resolve(v2Content);
        }
        return Promise.resolve('some other content');
      });

      const versions = await analysisService.getVersions('test-analysis');

      expect(versions.versions).toHaveLength(2);
      expect(versions.currentVersion).toBe(2);
    });

    it('should return empty versions if metadata does not exist', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      const versions = await analysisService.getVersions('test-analysis');

      expect(versions).toEqual({
        versions: [],
        nextVersionNumber: 2,
        currentVersion: 1,
      });
    });

    it('should rollback to specific version', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      const { promises: fs } = await import('fs');
      fs.access.mockResolvedValue(undefined);

      safeReadFile.mockImplementation((path) => {
        if (path.includes('v1.js')) {
          return Promise.resolve('version 1 content');
        }
        if (path.includes('metadata.json')) {
          return Promise.resolve(
            JSON.stringify({
              versions: [{ version: 1, timestamp: '2025-01-01', size: 100 }],
              nextVersionNumber: 2,
              currentVersion: 1,
            }),
          );
        }
        return Promise.resolve('current content');
      });

      const result = await analysisService.rollbackToVersion(
        'test-analysis',
        1,
      );

      expect(result.success).toBe(true);
      expect(result.version).toBe(1);
      expect(safeWriteFile).toHaveBeenCalled();
    });

    it('should throw error if version does not exist', async () => {
      const analysis = createMockAnalysisProcess();
      analysisService.analyses.set('test-analysis', analysis);

      const { promises: fs } = await import('fs');
      const error = new Error('Not found');
      error.code = 'ENOENT';
      fs.access.mockRejectedValue(error);

      await expect(
        analysisService.rollbackToVersion('test-analysis', 99),
      ).rejects.toThrow('Version 99 not found');
    });
  });

  describe('log management', () => {
    it('should get paginated logs', async () => {
      const analysis = createMockAnalysisProcess();
      analysis.getMemoryLogs.mockReturnValue({
        logs: [{ message: 'test log' }],
        hasMore: false,
        totalCount: 1,
        totalInMemory: 1,
      });
      analysisService.analyses.set('test-analysis', analysis);

      const logs = await analysisService.getLogs('test-analysis', 1, 100);

      expect(logs.logs).toHaveLength(1);
      expect(logs.source).toBe('memory');
    });

    it('should clear logs successfully', async () => {
      const analysis = createMockAnalysisProcess();
      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.clearLogs('test-analysis');

      expect(result.success).toBe(true);
      expect(safeWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('analysis.log'),
        '',
        expect.any(String),
        'utf8',
      );
    });

    it('should throw error if analysis not found when clearing logs', async () => {
      await expect(analysisService.clearLogs('nonexistent')).rejects.toThrow(
        'Analysis not found',
      );
    });
  });

  describe('config management', () => {
    it('should save configuration', async () => {
      const analysis = createMockAnalysisProcess({
        enabled: true,
        status: 'running',
        teamId: 'team-123',
      });
      analysisService.analyses.set('test-analysis', analysis);
      analysisService.configCache = {
        version: '4.1',
        teamStructure: {},
      };

      await analysisService.saveConfig();

      // Check that safeWriteFile was called with config content
      expect(safeWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('analyses-config.json'),
        expect.stringContaining('"version"'),
        expect.any(String),
      );
    });

    it('should update configuration', async () => {
      // Import the mocked AnalysisProcess class
      const AnalysisProcess = (
        await import('../../src/models/analysisProcess.js')
      ).default;

      // Create an instance using the mocked class
      const analysis = new AnalysisProcess('test-analysis', analysisService);
      analysis.enabled = false;
      analysis.status = 'stopped';
      analysis.intendedState = 'stopped';
      analysis.lastStartTime = null;
      analysis.teamId = 'test-team-id';

      analysisService.analyses.set('test-analysis', analysis);

      const newConfig = {
        version: '4.1',
        analyses: {
          'test-analysis': {
            enabled: true,
            status: 'running',
            intendedState: 'running',
            lastStartTime: null,
            teamId: 'team-123',
          },
        },
        teamStructure: {},
      };

      await analysisService.updateConfig(newConfig);

      // updateConfig merges config by updating the existing object properties
      expect(analysis.enabled).toBe(true);
      expect(analysis.status).toBe('running');
      expect(analysis.teamId).toBe('team-123');
    });
  });

  describe('health check', () => {
    it('should start health check interval', () => {
      analysisService.startHealthCheck();

      expect(analysisService.healthCheckInterval).toBeDefined();
    });

    it('should stop health check interval', () => {
      analysisService.startHealthCheck();
      analysisService.stopHealthCheck();

      expect(analysisService.healthCheckInterval).toBeNull();
      expect(analysisService.metricsInterval).toBeNull();
    });
  });

  describe('lock management', () => {
    it('should check if start is in progress', () => {
      analysisService.startLocks.set('test-analysis', Promise.resolve());

      expect(analysisService.isStartInProgress('test-analysis')).toBe(true);
      expect(analysisService.isStartInProgress('other')).toBe(false);
    });

    it('should get all start operations in progress', () => {
      analysisService.startLocks.set('analysis-1', Promise.resolve());
      analysisService.startLocks.set('analysis-2', Promise.resolve());

      const inProgress = analysisService.getStartOperationsInProgress();

      expect(inProgress).toHaveLength(2);
      expect(inProgress).toContain('analysis-1');
      expect(inProgress).toContain('analysis-2');
    });
  });

  describe('validateTimeRange', () => {
    it('should validate 1h time range', () => {
      expect(analysisService.validateTimeRange('1h')).toBe(true);
    });

    it('should validate 24h time range', () => {
      expect(analysisService.validateTimeRange('24h')).toBe(true);
    });

    it('should validate 7d time range', () => {
      expect(analysisService.validateTimeRange('7d')).toBe(true);
    });

    it('should validate 30d time range', () => {
      expect(analysisService.validateTimeRange('30d')).toBe(true);
    });

    it('should validate all time range', () => {
      expect(analysisService.validateTimeRange('all')).toBe(true);
    });

    it('should reject invalid time ranges', () => {
      expect(analysisService.validateTimeRange('invalid')).toBe(false);
      expect(analysisService.validateTimeRange('2h')).toBe(false);
      expect(analysisService.validateTimeRange('60d')).toBe(false);
      expect(analysisService.validateTimeRange('')).toBe(false);
    });
  });

  describe('getInitialLogs', () => {
    it('should return logs with default limit of 50', async () => {
      const analysis = createMockAnalysisProcess();
      analysis.getMemoryLogs.mockReturnValue({
        logs: Array.from({ length: 50 }, (_, i) => ({ message: `log ${i}` })),
        totalCount: 100,
      });
      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.getInitialLogs('test-analysis');

      expect(result.logs).toHaveLength(50);
      expect(result.totalCount).toBe(100);
      expect(analysis.getMemoryLogs).toHaveBeenCalledWith(1, 50);
    });

    it('should respect custom limit parameter', async () => {
      const analysis = createMockAnalysisProcess();
      analysis.getMemoryLogs.mockReturnValue({
        logs: Array.from({ length: 25 }, (_, i) => ({ message: `log ${i}` })),
        totalCount: 100,
      });
      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.getInitialLogs('test-analysis', 25);

      expect(result.logs).toHaveLength(25);
      expect(analysis.getMemoryLogs).toHaveBeenCalledWith(1, 25);
    });

    it('should return empty logs for non-existent analysis', async () => {
      const result = await analysisService.getInitialLogs('nonexistent');

      expect(result).toEqual({
        logs: [],
        totalCount: 0,
      });
    });

    it('should handle analysis with no logs', async () => {
      const analysis = createMockAnalysisProcess();
      analysis.getMemoryLogs.mockReturnValue({
        logs: [],
        totalCount: 0,
      });
      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.getInitialLogs('test-analysis');

      expect(result.logs).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('getAnalysisContent', () => {
    it('should return analysis file content', async () => {
      analysisService.analyses.set(
        'test-analysis',
        createMockAnalysisProcess(),
      );

      safeReadFile.mockResolvedValue('console.log("analysis code");');

      const content = await analysisService.getAnalysisContent('test-analysis');

      expect(content).toBe('console.log("analysis code");');
      expect(safeReadFile).toHaveBeenCalledWith(
        expect.stringContaining('index.js'),
        expect.any(String),
        'utf8',
      );
    });

    it('should throw error if file read fails', async () => {
      analysisService.analyses.set(
        'test-analysis',
        createMockAnalysisProcess(),
      );

      const error = new Error('File read failed');
      safeReadFile.mockRejectedValue(error);

      await expect(
        analysisService.getAnalysisContent('test-analysis'),
      ).rejects.toThrow('Failed to get analysis content');
    });

    it('should handle ENOENT errors', async () => {
      analysisService.analyses.set(
        'test-analysis',
        createMockAnalysisProcess(),
      );

      const error = new Error('File not found');
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      await expect(
        analysisService.getAnalysisContent('test-analysis'),
      ).rejects.toThrow('Failed to get analysis content');
    });
  });

  describe('getVersionContent', () => {
    it('should return current version when version is 0', async () => {
      safeReadFile.mockResolvedValue('current content');

      const content = await analysisService.getVersionContent(
        'test-analysis',
        0,
      );

      expect(content).toBe('current content');
      expect(safeReadFile).toHaveBeenCalledWith(
        expect.stringContaining('index.js'),
        expect.any(String),
        'utf8',
      );
    });

    it('should return specific version content', async () => {
      safeReadFile.mockResolvedValue('version 2 content');

      const content = await analysisService.getVersionContent(
        'test-analysis',
        2,
      );

      expect(content).toBe('version 2 content');
      expect(safeReadFile).toHaveBeenCalledWith(
        expect.stringContaining('v2.js'),
        expect.any(String),
        'utf8',
      );
    });

    it('should throw error if version not found', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      await expect(
        analysisService.getVersionContent('test-analysis', 99),
      ).rejects.toThrow('Version 99 not found');
    });

    it('should handle read errors for non-ENOENT errors', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      safeReadFile.mockRejectedValue(error);

      await expect(
        analysisService.getVersionContent('test-analysis', 1),
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('getAllAnalyses with permission filtering', () => {
    it('should return all analyses when no filter provided', async () => {
      const { safeStat } = await import('../../src/utils/safePath.js');
      safeReaddir.mockResolvedValue(['analysis1', 'analysis2']);
      safeStat.mockResolvedValue({
        isFile: () => true,
        size: 1024,
        birthtime: new Date(),
      });

      const analysis1 = createMockAnalysisProcess({ teamId: 'team-1' });
      const analysis2 = createMockAnalysisProcess({ teamId: 'team-2' });

      analysisService.analyses.set('analysis1', analysis1);
      analysisService.analyses.set('analysis2', analysis2);

      const result = await analysisService.getAllAnalyses(null);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['analysis1']).toBeDefined();
      expect(result['analysis2']).toBeDefined();
    });

    it('should filter analyses by allowed team IDs', async () => {
      const { safeStat } = await import('../../src/utils/safePath.js');
      safeReaddir.mockResolvedValue(['analysis1', 'analysis2', 'analysis3']);
      safeStat.mockResolvedValue({
        isFile: () => true,
        size: 1024,
        birthtime: new Date(),
      });

      const analysis1 = createMockAnalysisProcess({ teamId: 'team-1' });
      const analysis2 = createMockAnalysisProcess({ teamId: 'team-2' });
      const analysis3 = createMockAnalysisProcess({ teamId: 'team-3' });

      analysisService.analyses.set('analysis1', analysis1);
      analysisService.analyses.set('analysis2', analysis2);
      analysisService.analyses.set('analysis3', analysis3);

      const result = await analysisService.getAllAnalyses(['team-1', 'team-2']);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['analysis1']).toBeDefined();
      expect(result['analysis2']).toBeDefined();
      expect(result['analysis3']).toBeUndefined();
    });

    it('should return empty object when no analyses match filter', async () => {
      const { safeStat } = await import('../../src/utils/safePath.js');
      safeReaddir.mockResolvedValue(['analysis1', 'analysis2']);
      safeStat.mockResolvedValue({
        isFile: () => true,
        size: 1024,
        birthtime: new Date(),
      });

      const analysis1 = createMockAnalysisProcess({ teamId: 'team-1' });
      const analysis2 = createMockAnalysisProcess({ teamId: 'team-2' });

      analysisService.analyses.set('analysis1', analysis1);
      analysisService.analyses.set('analysis2', analysis2);

      const result = await analysisService.getAllAnalyses(['team-3']);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle analyses without teamId', async () => {
      const { safeStat } = await import('../../src/utils/safePath.js');
      safeReaddir.mockResolvedValue(['analysis1']);
      safeStat.mockResolvedValue({
        isFile: () => true,
        size: 1024,
        birthtime: new Date(),
      });

      const analysis1 = createMockAnalysisProcess({ teamId: null });
      analysisService.analyses.set('analysis1', analysis1);

      const result = await analysisService.getAllAnalyses(['team-1']);

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('getProcessStatus', () => {
    it('should return status from existing analysis', () => {
      const analysis = createMockAnalysisProcess({ status: 'running' });
      analysisService.analyses.set('test-analysis', analysis);

      const status = analysisService.getProcessStatus('test-analysis');

      expect(status).toBe('running');
    });

    it('should return stopped for non-existent analysis', () => {
      const status = analysisService.getProcessStatus('nonexistent');

      expect(status).toBe('stopped');
    });

    it('should return correct status for stopped analysis', () => {
      const analysis = createMockAnalysisProcess({ status: 'stopped' });
      analysisService.analyses.set('test-analysis', analysis);

      const status = analysisService.getProcessStatus('test-analysis');

      expect(status).toBe('stopped');
    });

    it('should return correct status for error state', () => {
      const analysis = createMockAnalysisProcess({ status: 'error' });
      analysisService.analyses.set('test-analysis', analysis);

      const status = analysisService.getProcessStatus('test-analysis');

      expect(status).toBe('error');
    });
  });

  describe('getAnalysesThatShouldBeRunning', () => {
    it('should return analyses with intendedState running', () => {
      const analysis1 = createMockAnalysisProcess({ intendedState: 'running' });
      const analysis2 = createMockAnalysisProcess({ intendedState: 'stopped' });
      const analysis3 = createMockAnalysisProcess({ intendedState: 'running' });

      analysisService.analyses.set('analysis1', analysis1);
      analysisService.analyses.set('analysis2', analysis2);
      analysisService.analyses.set('analysis3', analysis3);

      const result = analysisService.getAnalysesThatShouldBeRunning();

      expect(result).toHaveLength(2);
      expect(result).toContain('analysis1');
      expect(result).toContain('analysis3');
    });

    it('should return empty array when no analyses should be running', () => {
      const analysis1 = createMockAnalysisProcess({ intendedState: 'stopped' });
      const analysis2 = createMockAnalysisProcess({ intendedState: 'stopped' });

      analysisService.analyses.set('analysis1', analysis1);
      analysisService.analyses.set('analysis2', analysis2);

      const result = analysisService.getAnalysesThatShouldBeRunning();

      expect(result).toHaveLength(0);
    });

    it('should return empty array when no analyses exist', () => {
      const result = analysisService.getAnalysesThatShouldBeRunning();

      expect(result).toHaveLength(0);
    });
  });

  describe('verifyIntendedState', () => {
    it('should start analyses with intendedState running', async () => {
      const analysis1 = createMockAnalysisProcess({
        intendedState: 'running',
        status: 'stopped',
      });
      const analysis2 = createMockAnalysisProcess({
        intendedState: 'running',
        status: 'stopped',
      });

      analysisService.analyses.set('analysis1', analysis1);
      analysisService.analyses.set('analysis2', analysis2);

      const result = await analysisService.verifyIntendedState();

      expect(result.shouldBeRunning).toBe(2);
      expect(result.attempted).toHaveLength(2);
      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(analysis1.start).toHaveBeenCalled();
      expect(analysis2.start).toHaveBeenCalled();
    });

    it('should skip already running analyses with live process', async () => {
      const analysis = createMockAnalysisProcess({
        intendedState: 'running',
        status: 'running',
        process: { pid: 12345, killed: false },
      });

      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.verifyIntendedState();

      expect(result.alreadyRunning).toHaveLength(1);
      expect(result.succeeded).toHaveLength(0);
      expect(analysis.start).not.toHaveBeenCalled();
    });

    it('should restart analyses showing running but no live process', async () => {
      const analysis = createMockAnalysisProcess({
        intendedState: 'running',
        status: 'running',
        process: null, // No live process
      });

      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.verifyIntendedState();

      expect(result.succeeded).toHaveLength(1);
      expect(analysis.start).toHaveBeenCalled();
      expect(analysis.status).toBe('stopped'); // Reset before restart
    });

    it('should handle start failures gracefully', async () => {
      const analysis = createMockAnalysisProcess({
        intendedState: 'running',
        status: 'stopped',
      });
      analysis.start.mockRejectedValue(new Error('Start failed'));

      analysisService.analyses.set('test-analysis', analysis);

      const result = await analysisService.verifyIntendedState();

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({
        name: 'test-analysis',
        error: 'Start failed',
      });
    });

    it('should return summary with all counts', async () => {
      const analysis1 = createMockAnalysisProcess({
        intendedState: 'running',
        status: 'stopped',
      });
      const analysis2 = createMockAnalysisProcess({
        intendedState: 'running',
        status: 'running',
        process: { pid: 12345, killed: false },
      });
      const analysis3 = createMockAnalysisProcess({
        intendedState: 'running',
        status: 'stopped',
      });
      analysis3.start.mockRejectedValue(new Error('Failed'));

      analysisService.analyses.set('analysis1', analysis1);
      analysisService.analyses.set('analysis2', analysis2);
      analysisService.analyses.set('analysis3', analysis3);

      const result = await analysisService.verifyIntendedState();

      expect(result.shouldBeRunning).toBe(3);
      expect(result.attempted).toHaveLength(3);
      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.alreadyRunning).toHaveLength(1);
    });
  });

  describe('migrateConfigToV4_0', () => {
    it('should migrate pre-v4.0 config to v4.0', async () => {
      const oldConfig = {
        version: '3.0',
        analyses: {
          analysis1: { enabled: true, teamId: 'team-1' },
          analysis2: { enabled: false, teamId: 'team-2' },
        },
      };

      const migrated = await analysisService.migrateConfigToV4_0(oldConfig);

      expect(migrated).toBe(true);
      expect(oldConfig.version).toBe('4.0');
      expect(oldConfig.teamStructure).toBeDefined();
      expect(oldConfig.teamStructure['team-1']).toBeDefined();
      expect(oldConfig.teamStructure['team-2']).toBeDefined();
    });

    it('should create teamStructure with items', async () => {
      const oldConfig = {
        version: '3.0',
        analyses: {
          analysis1: { enabled: true, teamId: 'team-1' },
          analysis2: { enabled: false, teamId: 'team-1' },
        },
      };

      await analysisService.migrateConfigToV4_0(oldConfig);

      expect(oldConfig.teamStructure['team-1'].items).toHaveLength(2);
      expect(oldConfig.teamStructure['team-1'].items[0].type).toBe('analysis');
      expect(oldConfig.teamStructure['team-1'].items[0].analysisName).toBe(
        'analysis1',
      );
    });

    it('should handle analyses without teamId', async () => {
      const oldConfig = {
        version: '3.0',
        analyses: {
          analysis1: { enabled: true },
        },
      };

      await analysisService.migrateConfigToV4_0(oldConfig);

      expect(oldConfig.teamStructure['uncategorized']).toBeDefined();
      expect(
        oldConfig.teamStructure['uncategorized'].items[0].analysisName,
      ).toBe('analysis1');
    });

    it('should not migrate if already v4.0 or higher', async () => {
      const config = {
        version: '4.0',
        analyses: {},
        teamStructure: { 'team-1': { items: [] } },
      };

      const migrated = await analysisService.migrateConfigToV4_0(config);

      expect(migrated).toBe(false);
    });

    it('should not migrate if no analyses exist', async () => {
      const config = {
        version: '3.0',
        analyses: {},
      };

      const migrated = await analysisService.migrateConfigToV4_0(config);

      expect(migrated).toBe(false);
    });

    it('should save config after migration', async () => {
      const oldConfig = {
        version: '3.0',
        analyses: {
          analysis1: { enabled: true, teamId: 'team-1' },
        },
      };

      await analysisService.migrateConfigToV4_0(oldConfig);

      expect(safeWriteFile).toHaveBeenCalled();
    });
  });

  describe('migrateConfigToV4_1', () => {
    it('should migrate v4.0 config to v4.1', async () => {
      const config = {
        version: '4.0',
        analyses: {
          analysis1: { enabled: true, type: 'deprecated' },
          analysis2: { enabled: false, type: 'deprecated' },
        },
      };

      const migrated = await analysisService.migrateConfigToV4_1(config);

      expect(migrated).toBe(true);
      expect(config.version).toBe('4.1');
      expect(config.analyses['analysis1'].type).toBeUndefined();
      expect(config.analyses['analysis2'].type).toBeUndefined();
    });

    it('should not migrate if not v4.0', async () => {
      const config = {
        version: '4.1',
        analyses: {},
      };

      const migrated = await analysisService.migrateConfigToV4_1(config);

      expect(migrated).toBe(false);
    });

    it('should handle analyses without type field', async () => {
      const config = {
        version: '4.0',
        analyses: {
          analysis1: { enabled: true },
          analysis2: { enabled: false, type: 'deprecated' },
        },
      };

      const migrated = await analysisService.migrateConfigToV4_1(config);

      expect(migrated).toBe(true);
      expect(config.analyses['analysis1'].type).toBeUndefined();
      expect(config.analyses['analysis2'].type).toBeUndefined();
    });

    it('should save config after migration', async () => {
      const config = {
        version: '4.0',
        analyses: {
          analysis1: { enabled: true, type: 'deprecated' },
        },
      };

      await analysisService.migrateConfigToV4_1(config);

      expect(safeWriteFile).toHaveBeenCalled();
    });

    it('should count removed type fields', async () => {
      const config = {
        version: '4.0',
        analyses: {
          analysis1: { enabled: true, type: 'deprecated' },
          analysis2: { enabled: false, type: 'deprecated' },
          analysis3: { enabled: true },
        },
      };

      // The function doesn't return the count, but we can verify migration happened
      const migrated = await analysisService.migrateConfigToV4_1(config);

      expect(migrated).toBe(true);
      expect(config.analyses['analysis1'].type).toBeUndefined();
      expect(config.analyses['analysis2'].type).toBeUndefined();
    });
  });
});

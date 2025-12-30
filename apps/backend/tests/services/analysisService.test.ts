import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createMockAnalysisProcess,
  createMockFile,
  type MockAnalysisProcess,
} from '../utils/testHelpers.ts';

// Mock dependencies - must match import path in analysisService.ts
vi.mock('../../src/models/analysisProcess/index.ts', () => ({
  AnalysisProcess: class MockAnalysisProcess {
    analysisId: string;
    analysisName: string;
    service: unknown;
    enabled: boolean;
    status: string;
    intendedState: string;
    lastStartTime: string | null;
    teamId: string | null;
    logs: unknown[];
    logSequence: number;
    totalLogCount: number;

    constructor(analysisId: string, analysisName: string, service: unknown) {
      this.analysisId = analysisId;
      this.analysisName = analysisName;
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
    async start(): Promise<void> {}
    async stop(): Promise<void> {}
    async cleanup(): Promise<void> {}
    async addLog(): Promise<void> {}
    async initializeLogState(): Promise<void> {}
  },
}));

vi.mock('../../src/utils/safePath.ts', () => ({
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
  getAnalysisPath: vi.fn((name: string) => `/tmp/analyses/${name}`),
}));

// Use real validation functions - they are pure functions with no side effects
// Note: cryptoUtils is NOT mocked - we use the real encrypt/decrypt functions
// The config mock provides a valid 32-char secret key for encryption to work

vi.mock('../../src/services/teamService.ts', () => ({
  teamService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    addItemToTeamStructure: vi.fn().mockResolvedValue(undefined),
    ensureAnalysisHasTeam: vi.fn().mockResolvedValue(undefined),
    getAllTeams: vi
      .fn()
      .mockResolvedValue([{ id: 'uncategorized', name: 'Uncategorized' }]),
    getTeam: vi.fn().mockResolvedValue({ id: 'team-1', name: 'Team 1' }),
  },
}));

vi.mock('../../src/config/default.ts', () => {
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
    },
    paths: {} as Record<string, string>,
    files: {} as Record<string, string>,
  };

  // Derive paths from storage.base (matches production behavior in default.ts)
  mockConfig.paths = {
    analysis: `${mockConfig.storage.base}/analyses`,
    config: `${mockConfig.storage.base}/config`,
  };

  // Derive files from paths (matches production behavior in default.ts)
  mockConfig.files = {
    config: `${mockConfig.paths.config}/analyses-config.json`,
  };

  return { config: mockConfig };
});

vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

interface SafePathMock {
  safeMkdir: Mock;
  safeWriteFile: Mock;
  safeReadFile: Mock;
  safeReaddir: Mock;
  safeStat: Mock;
}

interface TeamServiceMock {
  initialize: Mock;
  addItemToTeamStructure: Mock;
  ensureAnalysisHasTeam: Mock;
  getAllTeams: Mock;
  getTeam: Mock;
}

interface AnalysisServiceType {
  analyses: Map<string, MockAnalysisProcess>;
  configCache: unknown;
  startLocks: Map<string, Promise<unknown>>;
  healthCheckInterval: NodeJS.Timeout | null;
  metricsInterval: NodeJS.Timeout | null;
  initialize: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  uploadAnalysis: (
    file: unknown,
    teamId: string | null,
    targetFolderId: string | null,
  ) => Promise<{ analysisName: string; analysisId: string }>;
  runAnalysis: (
    analysisId: string,
  ) => Promise<{ success: boolean; alreadyRunning?: boolean }>;
  stopAnalysis: (analysisId: string) => Promise<void>;
  deleteAnalysis: (analysisId: string) => Promise<void>;
  renameAnalysis: (
    analysisId: string,
    newName: string,
  ) => Promise<{
    success: boolean;
    oldName: string;
    newName: string;
    restarted?: boolean;
  }>;
  updateAnalysis: (
    analysisId: string,
    data: { content?: string; teamId?: string },
  ) => Promise<{
    success: boolean;
    restarted?: boolean;
    savedVersion?: number | null;
  }>;
  updateEnvironment: (
    analysisId: string,
    env: Record<string, string>,
  ) => Promise<{ success: boolean }>;
  getEnvironment: (analysisId: string) => Promise<Record<string, string>>;
  getVersions: (
    analysisId: string,
    options?: { page?: number; limit?: number },
  ) => Promise<{
    versions: Array<{ version: number; timestamp: string; size: number }>;
    currentVersion: number;
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
    nextVersionNumber: number;
  }>;
  rollbackToVersion: (
    analysisId: string,
    version: number,
  ) => Promise<{ success: boolean; version: number }>;
  getLogs: (
    analysisId: string,
    page: number,
    limit: number,
  ) => Promise<{ logs: unknown[]; source: string }>;
  clearLogs: (analysisId: string) => Promise<{ success: boolean }>;
  updateConfig: (config: unknown) => Promise<void>;
  getConfig: () => Promise<unknown>;
  startHealthCheck: () => void;
  stopHealthCheck: () => void;
  isStartInProgress: (analysisId: string) => boolean;
  getStartOperationsInProgress: () => string[];
  waitForAnalysisConnection: (
    analysis: MockAnalysisProcess,
    timeout: number,
  ) => Promise<boolean>;
  verifyIntendedState: () => Promise<{
    shouldBeRunning: number;
    attempted: string[];
    succeeded: string[];
    failed: Array<{ analysisId: string; error: string }>;
    alreadyRunning: string[];
    connected: string[];
    connectionTimeouts: string[];
  }>;
  validateTimeRange: (range: string) => boolean;
  getInitialLogs: (
    analysisId: string,
    limit?: number,
  ) => Promise<{ logs: unknown[]; totalCount: number }>;
  getAnalysisContent: (analysisId: string) => Promise<string>;
  getVersionContent: (analysisId: string, version: number) => Promise<string>;
  getAllAnalyses: (options: {
    allowedTeamIds?: string[];
    teamId?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => Promise<
    | Record<string, unknown>
    | {
        analyses: Record<string, unknown>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasMore: boolean;
        };
      }
  >;
  getProcessStatus: (analysisId: string) => string;
  getAnalysesThatShouldBeRunning: () => string[];
}

const { safeMkdir, safeWriteFile, safeReadFile, safeReaddir } = (await import(
  '../../src/utils/safePath.ts'
)) as unknown as SafePathMock;
const { teamService } = (await import(
  '../../src/services/teamService.ts'
)) as unknown as { teamService: TeamServiceMock };

describe('AnalysisService', () => {
  let analysisService: AnalysisServiceType;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import to get fresh instance
    const module = await import('../../src/services/analysisService.ts');
    analysisService = module.analysisService as unknown as AnalysisServiceType;
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
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      await analysisService.loadConfig();

      expect(safeWriteFile).toHaveBeenCalled();
      expect(analysisService.configCache).toEqual({
        version: '5.0',
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

      expect(result.analysisName).toBe('test-analysis');
      expect(result.analysisId).toBeDefined();
      expect(typeof result.analysisId).toBe('string');
      expect(mockFile.mv).toHaveBeenCalled();
      expect(analysisService.analyses.has(result.analysisId)).toBe(true);
      expect(teamService.addItemToTeamStructure).toHaveBeenCalledWith(
        teamId,
        expect.objectContaining({
          id: result.analysisId,
          type: 'analysis',
        }),
        targetFolderId,
      );
    });

    it('should assign to Uncategorized team if no team specified', async () => {
      const mockFile = createMockFile();
      // Mock file reading for initializeVersionManagement
      safeReadFile.mockResolvedValue('console.log("test analysis");');
      // Reset and configure getAllTeams mock
      teamService.getAllTeams.mockResolvedValueOnce([
        { id: 'uncategorized', name: 'Uncategorized' },
      ]);

      const result = await analysisService.uploadAnalysis(mockFile, null, null);

      expect(result.analysisName).toBe('test-analysis');
      expect(result.analysisId).toBeDefined();
      const analysis = analysisService.analyses.get(result.analysisId);
      expect(analysis?.teamId).toBe('uncategorized');
    });

    it('should handle filenames with special characters safely (v5.0 uses UUID for paths)', async () => {
      // In v5.0, directories are created using UUID, not analysisName
      // This makes path traversal via filename impossible
      const mockFile = createMockFile({
        name: '../../../etc/passwd.js', // Would be dangerous if used for path
      });
      // Mock file reading for initializeVersionManagement
      safeReadFile.mockResolvedValue('console.log("test analysis");');
      teamService.getAllTeams.mockResolvedValueOnce([
        { id: 'uncategorized', name: 'Uncategorized' },
      ]);

      const result = await analysisService.uploadAnalysis(
        mockFile,
        'team-123',
        null,
      );

      expect(result.analysisId).toBeDefined();
      // path.parse().name strips directory parts, leaving just 'passwd'
      expect(result.analysisName).toBe('passwd');
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
        process: { pid: 12345 } as MockAnalysisProcess['process'],
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
      const analysisId = 'test-analysis-uuid-123';
      const analysis = createMockAnalysisProcess({
        analysisId,
        analysisName: 'test-analysis',
        teamId: 'team-123',
      } as Partial<MockAnalysisProcess>);
      analysisService.analyses.set(analysisId, analysis);
      analysisService.configCache = {
        version: '5.0',
        analyses: { [analysisId]: { id: analysisId, name: 'test-analysis' } },
        teamStructure: {
          'team-123': {
            items: [{ id: analysisId, type: 'analysis' }],
          },
        },
      };

      const { promises: fs } = await import('fs');

      await analysisService.deleteAnalysis(analysisId);

      expect(analysis.stop).toHaveBeenCalled();
      expect(analysis.cleanup).toHaveBeenCalled();
      expect(fs.rm).toHaveBeenCalled();
      expect(analysisService.analyses.has(analysisId)).toBe(false);
    });

    it('should remove analysis from team structure', async () => {
      const testAnalysisId = 'test-analysis-uuid-123';
      const otherAnalysisId = 'other-analysis-uuid-456';

      const analysis = createMockAnalysisProcess({
        analysisId: testAnalysisId,
        analysisName: 'test-analysis',
        teamId: 'team-123',
      } as Partial<MockAnalysisProcess>);
      analysisService.analyses.set(testAnalysisId, analysis);
      analysisService.configCache = {
        version: '5.0',
        analyses: {
          [testAnalysisId]: { id: testAnalysisId, name: 'test-analysis' },
          [otherAnalysisId]: { id: otherAnalysisId, name: 'other-analysis' },
        },
        teamStructure: {
          'team-123': {
            items: [
              { id: testAnalysisId, type: 'analysis' },
              { id: otherAnalysisId, type: 'analysis' },
            ],
          },
        },
      };

      await analysisService.deleteAnalysis(testAnalysisId);

      const teamItems = (
        analysisService.configCache as {
          teamStructure: { 'team-123': { items: Array<{ id: string }> } };
        }
      ).teamStructure['team-123'].items;
      expect(teamItems).toHaveLength(1);
      expect(teamItems[0].id).toBe(otherAnalysisId);
    });
  });

  describe('renameAnalysis', () => {
    it('should rename analysis successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';

      const analysis = createMockAnalysisProcess({
        analysisId,
        analysisName: 'old-name',
        status: 'stopped',
      } as Partial<MockAnalysisProcess>);
      analysisService.analyses.set(analysisId, analysis);

      // Set up config cache for getConfig() call in renameAnalysis
      analysisService.configCache = {
        version: '5.0',
        analyses: {
          [analysisId]: {
            id: analysisId,
            name: 'old-name',
            enabled: false,
            teamId: 'team1',
          },
        },
        teamStructure: {
          team1: {
            items: [{ id: analysisId, type: 'analysis' }],
          },
        },
      };

      const result = await analysisService.renameAnalysis(
        analysisId,
        'new-name',
      );

      expect(result.success).toBe(true);
      expect(result.oldName).toBe('old-name');
      expect(result.newName).toBe('new-name');
      // In v5.0, the analysis stays keyed by ID, only name property changes
      expect(analysisService.analyses.has(analysisId)).toBe(true);
      expect(analysis.analysisName).toBe('new-name');
    });

    it('should throw error if analysis not found', async () => {
      analysisService.configCache = {
        version: '5.0',
        analyses: {},
        teamStructure: {},
      };

      await expect(
        analysisService.renameAnalysis('nonexistent-uuid', 'new-name'),
      ).rejects.toThrow("Analysis 'nonexistent-uuid' not found");
    });

    it('should restart analysis if it was running', async () => {
      const analysisId = 'test-analysis-uuid-123';

      const analysis = createMockAnalysisProcess({
        analysisId,
        analysisName: 'old-name',
        status: 'running',
      } as Partial<MockAnalysisProcess>);
      analysisService.analyses.set(analysisId, analysis);

      // Set up config cache for getConfig() call in renameAnalysis (v5.0)
      analysisService.configCache = {
        version: '5.0',
        analyses: {
          [analysisId]: {
            id: analysisId,
            name: 'old-name',
            enabled: false,
            teamId: 'team1',
          },
        },
        teamStructure: {
          team1: {
            items: [{ id: analysisId, type: 'analysis' }],
          },
        },
      };

      const result = await analysisService.renameAnalysis(
        analysisId,
        'new-name',
      );

      expect(result.restarted).toBe(true);
      expect(analysis.stop).toHaveBeenCalled();
      expect(analysis.start).toHaveBeenCalled();
    });

    // No longer need to update team structure when renaming - tests for that removed
  });

  describe('updateAnalysis', () => {
    it('should update analysis content', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock file reading for version management (returns file content as string)
      safeReadFile.mockImplementation((path: string) => {
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
        expect.stringContaining('index.js'),
        'new content',
        expect.any(String),
      );
    });

    it('should save version before updating', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock existing version metadata and file content
      safeReadFile.mockImplementation((path: string) => {
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
      safeReadFile.mockImplementation((path: string) => {
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

    it('should update teamId when provided', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock team lookup to succeed
      teamService.getTeam.mockResolvedValue({
        id: 'new-team',
        name: 'New Team',
      });

      const result = await analysisService.updateAnalysis('test-analysis', {
        teamId: 'new-team',
      });

      expect(result.success).toBe(true);
      expect(teamService.getTeam).toHaveBeenCalledWith('new-team');
    });

    it('should throw error if team not found when updating teamId', async () => {
      const analysis = createMockAnalysisProcess({
        status: 'stopped',
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock team lookup to return null
      teamService.getTeam.mockResolvedValue(null);

      await expect(
        analysisService.updateAnalysis('test-analysis', {
          teamId: 'nonexistent-team',
        }),
      ).rejects.toThrow('Team nonexistent-team not found');
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
      // Real encryption produces hex strings with colon separators (iv:authTag:encrypted:key)
      expect(safeWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringMatching(/KEY1=[a-f0-9]+:[a-f0-9]+:[a-f0-9]+:[a-f0-9]+/),
        expect.any(String),
      );
    });

    it('should get decrypted environment variables', async () => {
      const { encrypt } = await import('../../src/utils/cryptoUtils.ts');

      analysisService.analyses.set(
        'test-analysis',
        createMockAnalysisProcess(),
      );

      // Use real encryption to create properly encrypted values
      const encryptedValue1 = encrypt('value1');
      const encryptedValue2 = encrypt('value2');

      safeReadFile.mockResolvedValue(
        `KEY1=${encryptedValue1}\nKEY2=${encryptedValue2}`,
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

      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      const env = await analysisService.getEnvironment('test-analysis');

      expect(env).toEqual({});
    });
  });

  describe('version management', () => {
    it('should get versions list with pagination metadata', async () => {
      const v2Content = 'version 2 content';

      // Mock metadata and current file reading
      safeReadFile.mockImplementation((path: string) => {
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

      const result = await analysisService.getVersions('test-analysis');

      // Check pagination metadata
      expect(result.versions).toHaveLength(2);
      expect(result.currentVersion).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalCount).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.hasMore).toBe(false);
      // Versions should be sorted in descending order (newest first)
      expect(result.versions[0].version).toBe(2);
      expect(result.versions[1].version).toBe(1);
    });

    it('should paginate versions correctly', async () => {
      const versions = Array.from({ length: 25 }, (_, i) => ({
        version: i + 1,
        timestamp: `2025-01-${String(i + 1).padStart(2, '0')}`,
        size: 100 + i * 10,
      }));

      safeReadFile.mockImplementation((path: string) => {
        if (path.includes('metadata.json')) {
          return Promise.resolve(
            JSON.stringify({
              versions,
              nextVersionNumber: 26,
              currentVersion: 25,
            }),
          );
        }
        if (path.includes('index.js')) {
          return Promise.resolve('current content');
        }
        return Promise.resolve('some other content');
      });

      // Test page 1
      const page1 = await analysisService.getVersions('test-analysis', {
        page: 1,
        limit: 10,
      });
      expect(page1.versions).toHaveLength(10);
      expect(page1.page).toBe(1);
      expect(page1.totalCount).toBe(25);
      expect(page1.totalPages).toBe(3);
      expect(page1.hasMore).toBe(true);
      // First page should have versions 25-16 (descending)
      expect(page1.versions[0].version).toBe(25);
      expect(page1.versions[9].version).toBe(16);

      // Test page 2
      const page2 = await analysisService.getVersions('test-analysis', {
        page: 2,
        limit: 10,
      });
      expect(page2.versions).toHaveLength(10);
      expect(page2.page).toBe(2);
      expect(page2.hasMore).toBe(true);
      // Second page should have versions 15-6
      expect(page2.versions[0].version).toBe(15);
      expect(page2.versions[9].version).toBe(6);

      // Test page 3 (last page with 5 items)
      const page3 = await analysisService.getVersions('test-analysis', {
        page: 3,
        limit: 10,
      });
      expect(page3.versions).toHaveLength(5);
      expect(page3.page).toBe(3);
      expect(page3.hasMore).toBe(false);
      // Third page should have versions 5-1
      expect(page3.versions[0].version).toBe(5);
      expect(page3.versions[4].version).toBe(1);
    });

    it('should use default pagination values', async () => {
      safeReadFile.mockImplementation((path: string) => {
        if (path.includes('metadata.json')) {
          return Promise.resolve(
            JSON.stringify({
              versions: [{ version: 1, timestamp: '2025-01-01', size: 100 }],
              nextVersionNumber: 2,
              currentVersion: 1,
            }),
          );
        }
        if (path.includes('index.js')) {
          return Promise.resolve('current content');
        }
        return Promise.resolve('some other content');
      });

      const result = await analysisService.getVersions('test-analysis');

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should return empty versions with pagination metadata if metadata does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      const result = await analysisService.getVersions('test-analysis');

      expect(result).toEqual({
        versions: [],
        page: 1,
        limit: 10,
        totalCount: 0,
        totalPages: 0,
        hasMore: false,
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
      (fs.access as Mock).mockResolvedValue(undefined);

      safeReadFile.mockImplementation((path: string) => {
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
      const error = new Error('Not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      (fs.access as Mock).mockRejectedValue(error);

      await expect(
        analysisService.rollbackToVersion('test-analysis', 99),
      ).rejects.toThrow('Version 99 not found');
    });
  });

  describe('log management', () => {
    it('should get paginated logs', async () => {
      const analysis = createMockAnalysisProcess();
      analysis.getMemoryLogs.mockReturnValue({
        logs: [
          {
            sequence: 1,
            timestamp: '2025-01-01T00:00:00.000Z',
            message: 'test log',
          },
        ],
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
      );
    });

    it('should throw error if analysis not found when getting logs', async () => {
      await expect(
        analysisService.getLogs('nonexistent', 1, 100),
      ).rejects.toThrow('Analysis not found');
    });

    it('should fall back to file when no memory logs available', async () => {
      const analysis = createMockAnalysisProcess();
      analysis.getMemoryLogs.mockReturnValue({
        logs: [],
        hasMore: false,
        totalCount: 0,
        totalInMemory: 0,
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock fs.access to throw ENOENT (file doesn't exist)
      const fsMock = await import('fs');
      vi.mocked(fsMock.promises.access).mockRejectedValue(
        Object.assign(new Error('File not found'), { code: 'ENOENT' }),
      );

      const logs = await analysisService.getLogs('test-analysis', 1, 100);

      expect(logs.logs).toHaveLength(0);
      expect(logs.source).toBe('file');
    });

    it('should use file for page 2+', async () => {
      const analysis = createMockAnalysisProcess();
      analysis.getMemoryLogs.mockReturnValue({
        logs: [],
        hasMore: false,
        totalCount: 0,
        totalInMemory: 0,
      });
      analysisService.analyses.set('test-analysis', analysis);

      // Mock fs.access to throw ENOENT (file doesn't exist)
      const fsMock = await import('fs');
      vi.mocked(fsMock.promises.access).mockRejectedValue(
        Object.assign(new Error('File not found'), { code: 'ENOENT' }),
      );

      const logs = await analysisService.getLogs('test-analysis', 2, 100);

      // Page 2+ always goes to file (even if file doesn't exist)
      expect(logs.logs).toHaveLength(0);
      expect(logs.source).toBe('file');
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
      const analysisId = 'test-analysis-uuid-123';

      // Import the mocked AnalysisProcess class - must use instanceof for updateConfig
      const { AnalysisProcess } = await import(
        '../../src/models/analysisProcess/index.ts'
      );

      // Create an instance using the mocked class
      const analysis = new AnalysisProcess(
        analysisId,
        'test-analysis',
        analysisService,
      ) as unknown as MockAnalysisProcess;
      analysis.enabled = false;
      analysis.status = 'stopped';
      analysis.intendedState = 'stopped';
      analysis.lastStartTime = null;
      analysis.teamId = 'test-team-id';

      analysisService.analyses.set(analysisId, analysis);

      const newConfig = {
        version: '5.0',
        analyses: {
          [analysisId]: {
            id: analysisId,
            name: 'test-analysis',
            enabled: true,
            // status is no longer persisted in config
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
      // Status should remain 'stopped' after config update
      // Only intendedState is persisted, status is runtime-only
      expect(analysis.status).toBe('stopped');
      expect(analysis.intendedState).toBe('running');
      expect(analysis.teamId).toBe('team-123');
    });

    it('should add new analyses from config', async () => {
      analysisService.analyses.clear();

      const newConfig = {
        version: '5.0',
        analyses: {
          'new-analysis-id': {
            id: 'new-analysis-id',
            name: 'new-analysis',
            enabled: true,
            intendedState: 'running',
            lastStartTime: null,
            teamId: 'team-1',
          },
        },
        teamStructure: {},
      };

      await analysisService.updateConfig(newConfig);

      expect(analysisService.analyses.has('new-analysis-id')).toBe(true);
      const newAnalysis = analysisService.analyses.get('new-analysis-id');
      expect(newAnalysis?.analysisName).toBe('new-analysis');
      expect(newAnalysis?.enabled).toBe(true);
      expect(newAnalysis?.intendedState).toBe('running');
    });

    it('should remove analyses that no longer exist in config', async () => {
      const { AnalysisProcess } = await import(
        '../../src/models/analysisProcess/index.ts'
      );

      const analysis = new AnalysisProcess(
        'analysis-to-remove',
        'old-analysis',
        analysisService,
      ) as unknown as MockAnalysisProcess;
      analysisService.analyses.set('analysis-to-remove', analysis);

      // Config without the analysis
      const newConfig = {
        version: '5.0',
        analyses: {},
        teamStructure: {},
      };

      await analysisService.updateConfig(newConfig);

      expect(analysisService.analyses.has('analysis-to-remove')).toBe(false);
    });

    it('should update analysis name when changed in config', async () => {
      const analysisId = 'test-analysis-rename';

      const { AnalysisProcess } = await import(
        '../../src/models/analysisProcess/index.ts'
      );

      const analysis = new AnalysisProcess(
        analysisId,
        'old-name',
        analysisService,
      ) as unknown as MockAnalysisProcess;
      analysisService.analyses.set(analysisId, analysis);

      const newConfig = {
        version: '5.0',
        analyses: {
          [analysisId]: {
            id: analysisId,
            name: 'new-name',
            enabled: true,
            intendedState: 'stopped',
            lastStartTime: null,
            teamId: null,
          },
        },
        teamStructure: {},
      };

      await analysisService.updateConfig(newConfig);

      expect(analysis.analysisName).toBe('new-name');
    });

    it('should default intendedState to stopped when not provided', async () => {
      analysisService.analyses.clear();

      const newConfig = {
        version: '5.0',
        analyses: {
          'test-analysis': {
            id: 'test-analysis',
            name: 'test',
            enabled: true,
            // intendedState not provided
            lastStartTime: null,
            teamId: null,
          },
        },
        teamStructure: {},
      };

      await analysisService.updateConfig(newConfig);

      const analysis = analysisService.analyses.get('test-analysis');
      expect(analysis?.intendedState).toBe('stopped');
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

  describe('batched startup', () => {
    describe('waitForAnalysisConnection', () => {
      it('should return true immediately if analysis is already connected', async () => {
        const analysis = createMockAnalysisProcess({
          isConnected: true,
        });

        const result = await analysisService.waitForAnalysisConnection(
          analysis,
          10000,
        );

        expect(result).toBe(true);
      });

      it('should return true when analysis connects within timeout', async () => {
        const analysis = createMockAnalysisProcess({
          isConnected: false,
        });

        // Simulate connection after 200ms
        setTimeout(() => {
          analysis.isConnected = true;
        }, 200);

        const result = await analysisService.waitForAnalysisConnection(
          analysis,
          1000,
        );

        expect(result).toBe(true);
      });

      it('should return false when connection times out', async () => {
        const analysis = createMockAnalysisProcess({
          isConnected: false,
        });

        // Never set isConnected to true
        const result = await analysisService.waitForAnalysisConnection(
          analysis,
          300,
        );

        expect(result).toBe(false);
      });
    });

    describe('verifyIntendedState with batching', () => {
      beforeEach(() => {
        // Mock analysis processes
        for (let i = 1; i <= 3; i++) {
          const analysis = createMockAnalysisProcess({
            analysisName: `analysis-${i}`,
            intendedState: 'running',
            status: 'stopped',
            process: null,
          });
          analysisService.analyses.set(`analysis-${i}`, analysis);
        }
      });

      it('should start analyses in batches with connection verification', async () => {
        // Override batch size for testing
        process.env.ANALYSIS_BATCH_SIZE = '2';

        const results = await analysisService.verifyIntendedState();

        expect(results.attempted).toHaveLength(3);
        expect(results.succeeded).toHaveLength(3);
        expect(results.connected).toBeDefined();
        expect(results.connectionTimeouts).toBeDefined();
      });

      it('should track connection successes and timeouts', async () => {
        // Set one analysis to be already connected
        const analysis1 = analysisService.analyses.get('analysis-1');
        if (analysis1) analysis1.isConnected = true;

        const results = await analysisService.verifyIntendedState();

        expect(results.attempted).toHaveLength(3);
        expect(
          results.connected.length + results.connectionTimeouts.length,
        ).toBe(results.succeeded.length);
      });

      it('should handle start failures gracefully', async () => {
        // Make one analysis fail to start
        const analysis2 = analysisService.analyses.get('analysis-2');
        if (analysis2) {
          analysis2.start = vi
            .fn()
            .mockRejectedValue(new Error('Start failed'));
        }

        const results = await analysisService.verifyIntendedState();

        expect(results.attempted).toHaveLength(3);
        expect(results.failed).toHaveLength(1);
        expect(results.failed[0].analysisId).toBe('analysis-2');
        expect(results.succeeded).toHaveLength(2);
      });

      it('should skip analyses that are already running', async () => {
        const analysis1 = analysisService.analyses.get('analysis-1');
        if (analysis1) {
          analysis1.status = 'running';
          analysis1.process = {
            killed: false,
            pid: 12345,
          } as MockAnalysisProcess['process'];
        }

        const results = await analysisService.verifyIntendedState();

        expect(results.attempted).toHaveLength(3);
        expect(results.alreadyRunning).toHaveLength(1);
        expect(results.alreadyRunning[0]).toBe('analysis-1');
        expect(results.succeeded).toHaveLength(2);
      });

      it('should return early if no analyses need starting', async () => {
        // Set all analyses to already running
        analysisService.analyses.forEach((analysis) => {
          analysis.status = 'running';
          analysis.process = {
            killed: false,
            pid: 12345,
          } as MockAnalysisProcess['process'];
        });

        const results = await analysisService.verifyIntendedState();

        expect(results.alreadyRunning).toHaveLength(3);
        expect(results.succeeded).toHaveLength(0);
      });
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
        logs: Array.from({ length: 50 }, (_, i) => ({
          sequence: i + 1,
          timestamp: '2025-01-01T00:00:00.000Z',
          message: `log ${i}`,
        })),
        totalCount: 100,
        hasMore: true,
        totalInMemory: 100,
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
        logs: Array.from({ length: 25 }, (_, i) => ({
          sequence: i + 1,
          timestamp: '2025-01-01T00:00:00.000Z',
          message: `log ${i}`,
        })),
        totalCount: 100,
        hasMore: true,
        totalInMemory: 100,
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
        hasMore: false,
        totalInMemory: 0,
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
        { encoding: 'utf8' },
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

      const error = new Error('File not found') as NodeJS.ErrnoException;
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
        { encoding: 'utf8' },
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
        { encoding: 'utf8' },
      );
    });

    it('should throw error if version not found', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      await expect(
        analysisService.getVersionContent('test-analysis', 99),
      ).rejects.toThrow('Version 99 not found');
    });

    it('should handle read errors for non-ENOENT errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      safeReadFile.mockRejectedValue(error);

      await expect(
        analysisService.getVersionContent('test-analysis', 1),
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('getAllAnalyses with permission filtering', () => {
    it('should return all analyses when no filter provided', async () => {
      const { safeStat } = (await import(
        '../../src/utils/safePath.ts'
      )) as unknown as SafePathMock;
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

      const result = await analysisService.getAllAnalyses({});

      expect(Object.keys(result)).toHaveLength(2);
      expect((result as Record<string, unknown>)['analysis1']).toBeDefined();
      expect((result as Record<string, unknown>)['analysis2']).toBeDefined();
    });

    it('should filter analyses by allowed team IDs', async () => {
      const { safeStat } = (await import(
        '../../src/utils/safePath.ts'
      )) as unknown as SafePathMock;
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

      const result = await analysisService.getAllAnalyses({
        allowedTeamIds: ['team-1', 'team-2'],
      });

      expect(Object.keys(result)).toHaveLength(2);
      expect((result as Record<string, unknown>)['analysis1']).toBeDefined();
      expect((result as Record<string, unknown>)['analysis2']).toBeDefined();
      expect((result as Record<string, unknown>)['analysis3']).toBeUndefined();
    });

    it('should return empty object when no analyses match filter', async () => {
      const { safeStat } = (await import(
        '../../src/utils/safePath.ts'
      )) as unknown as SafePathMock;
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

      const result = await analysisService.getAllAnalyses({
        allowedTeamIds: ['team-3'],
      });

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle analyses without teamId', async () => {
      const { safeStat } = (await import(
        '../../src/utils/safePath.ts'
      )) as unknown as SafePathMock;
      safeReaddir.mockResolvedValue(['analysis1']);
      safeStat.mockResolvedValue({
        isFile: () => true,
        size: 1024,
        birthtime: new Date(),
      });

      const analysis1 = createMockAnalysisProcess({
        teamId: null as unknown as string,
      });
      analysisService.analyses.set('analysis1', analysis1);

      const result = await analysisService.getAllAnalyses({
        allowedTeamIds: ['team-1'],
      });

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('getAllAnalyses with advanced filtering', () => {
    beforeEach(async () => {
      const { safeStat } = (await import(
        '../../src/utils/safePath.ts'
      )) as unknown as SafePathMock;
      safeReaddir.mockResolvedValue([
        'analysis1',
        'analysis2',
        'analysis3',
        'analysis4',
        'analysis5',
      ]);
      safeStat.mockResolvedValue({
        isFile: () => true,
        size: 1024,
        birthtime: new Date(),
      });

      // Set up test data with different names, statuses, and teams
      analysisService.analyses.set(
        'analysis1',
        createMockAnalysisProcess({
          analysisName: 'temperature-sensor',
          teamId: 'team-1',
          status: 'running',
        }),
      );
      analysisService.analyses.set(
        'analysis2',
        createMockAnalysisProcess({
          analysisName: 'humidity-monitor',
          teamId: 'team-1',
          status: 'stopped',
        }),
      );
      analysisService.analyses.set(
        'analysis3',
        createMockAnalysisProcess({
          analysisName: 'pressure-sensor',
          teamId: 'team-2',
          status: 'running',
        }),
      );
      analysisService.analyses.set(
        'analysis4',
        createMockAnalysisProcess({
          analysisName: 'temp-logger',
          teamId: 'team-2',
          status: 'error',
        }),
      );
      analysisService.analyses.set(
        'analysis5',
        createMockAnalysisProcess({
          analysisName: 'data-processor',
          teamId: 'team-3',
          status: 'stopped',
        }),
      );
    });

    describe('search filtering', () => {
      it('should filter analyses by name (case-insensitive)', async () => {
        const result = await analysisService.getAllAnalyses({
          search: 'temp',
        });

        expect(Object.keys(result)).toHaveLength(2);
        expect((result as Record<string, unknown>)['analysis1']).toBeDefined(); // temperature-sensor
        expect((result as Record<string, unknown>)['analysis4']).toBeDefined(); // temp-logger
      });

      it('should return all analyses when search is empty', async () => {
        const result = await analysisService.getAllAnalyses({
          search: '',
        });

        expect(Object.keys(result)).toHaveLength(5);
      });

      it('should return empty when no analyses match search', async () => {
        const result = await analysisService.getAllAnalyses({
          search: 'nonexistent',
        });

        expect(Object.keys(result)).toHaveLength(0);
      });
    });

    describe('status filtering', () => {
      it('should filter analyses by running status', async () => {
        const result = await analysisService.getAllAnalyses({
          status: 'running',
        });

        expect(Object.keys(result)).toHaveLength(2);
        expect((result as Record<string, unknown>)['analysis1']).toBeDefined();
        expect((result as Record<string, unknown>)['analysis3']).toBeDefined();
      });

      it('should filter analyses by stopped status', async () => {
        const result = await analysisService.getAllAnalyses({
          status: 'stopped',
        });

        expect(Object.keys(result)).toHaveLength(2);
        expect((result as Record<string, unknown>)['analysis2']).toBeDefined();
        expect((result as Record<string, unknown>)['analysis5']).toBeDefined();
      });

      it('should filter analyses by error status', async () => {
        const result = await analysisService.getAllAnalyses({
          status: 'error',
        });

        expect(Object.keys(result)).toHaveLength(1);
        expect((result as Record<string, unknown>)['analysis4']).toBeDefined();
      });
    });

    describe('teamId filtering', () => {
      it('should filter analyses by specific team', async () => {
        const result = await analysisService.getAllAnalyses({
          teamId: 'team-1',
        });

        expect(Object.keys(result)).toHaveLength(2);
        expect((result as Record<string, unknown>)['analysis1']).toBeDefined();
        expect((result as Record<string, unknown>)['analysis2']).toBeDefined();
      });

      it('should respect allowedTeamIds when teamId is specified', async () => {
        // User only has access to team-1, but requests team-2
        const result = await analysisService.getAllAnalyses({
          allowedTeamIds: ['team-1'],
          teamId: 'team-2',
        });

        // Should return empty - team-2 is not in allowed teams
        expect(Object.keys(result)).toHaveLength(0);
      });

      it('should allow teamId filter when within allowedTeamIds', async () => {
        const result = await analysisService.getAllAnalyses({
          allowedTeamIds: ['team-1', 'team-2'],
          teamId: 'team-1',
        });

        expect(Object.keys(result)).toHaveLength(2);
        expect((result as Record<string, unknown>)['analysis1']).toBeDefined();
        expect((result as Record<string, unknown>)['analysis2']).toBeDefined();
      });
    });

    describe('combined filtering', () => {
      it('should combine search and status filters', async () => {
        const result = await analysisService.getAllAnalyses({
          search: 'sensor',
          status: 'running',
        });

        expect(Object.keys(result)).toHaveLength(2);
        expect((result as Record<string, unknown>)['analysis1']).toBeDefined(); // temperature-sensor, running
        expect((result as Record<string, unknown>)['analysis3']).toBeDefined(); // pressure-sensor, running
      });

      it('should combine search and teamId filters', async () => {
        const result = await analysisService.getAllAnalyses({
          search: 'sensor',
          teamId: 'team-1',
        });

        expect(Object.keys(result)).toHaveLength(1);
        expect((result as Record<string, unknown>)['analysis1']).toBeDefined(); // temperature-sensor, team-1
      });

      it('should combine all filters', async () => {
        const result = await analysisService.getAllAnalyses({
          allowedTeamIds: ['team-1', 'team-2'],
          teamId: 'team-2',
          search: 'sensor',
          status: 'running',
        });

        expect(Object.keys(result)).toHaveLength(1);
        expect((result as Record<string, unknown>)['analysis3']).toBeDefined(); // pressure-sensor, team-2, running
      });
    });

    describe('pagination', () => {
      it('should return paginated results', async () => {
        const result = await analysisService.getAllAnalyses({
          page: 1,
          limit: 2,
        });

        type PaginatedResult = {
          analyses: Record<string, unknown>;
          pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasMore: boolean;
          };
        };
        const paginatedResult = result as PaginatedResult;

        expect(paginatedResult.analyses).toBeDefined();
        expect(Object.keys(paginatedResult.analyses)).toHaveLength(2);
        expect(paginatedResult.pagination).toBeDefined();
        expect(paginatedResult.pagination.page).toBe(1);
        expect(paginatedResult.pagination.limit).toBe(2);
        expect(paginatedResult.pagination.total).toBe(5);
        expect(paginatedResult.pagination.totalPages).toBe(3);
        expect(paginatedResult.pagination.hasMore).toBe(true);
      });

      it('should return second page of results', async () => {
        const result = await analysisService.getAllAnalyses({
          page: 2,
          limit: 2,
        });

        type PaginatedResult = {
          analyses: Record<string, unknown>;
          pagination: {
            page: number;
            hasMore: boolean;
          };
        };
        const paginatedResult = result as PaginatedResult;

        expect(Object.keys(paginatedResult.analyses)).toHaveLength(2);
        expect(paginatedResult.pagination.page).toBe(2);
        expect(paginatedResult.pagination.hasMore).toBe(true);
      });

      it('should return last page with fewer items', async () => {
        const result = await analysisService.getAllAnalyses({
          page: 3,
          limit: 2,
        });

        type PaginatedResult = {
          analyses: Record<string, unknown>;
          pagination: {
            page: number;
            hasMore: boolean;
          };
        };
        const paginatedResult = result as PaginatedResult;

        expect(Object.keys(paginatedResult.analyses)).toHaveLength(1);
        expect(paginatedResult.pagination.page).toBe(3);
        expect(paginatedResult.pagination.hasMore).toBe(false);
      });

      it('should combine pagination with filters', async () => {
        const result = await analysisService.getAllAnalyses({
          status: 'running',
          page: 1,
          limit: 1,
        });

        type PaginatedResult = {
          analyses: Record<string, unknown>;
          pagination: {
            total: number;
            totalPages: number;
          };
        };
        const paginatedResult = result as PaginatedResult;

        expect(Object.keys(paginatedResult.analyses)).toHaveLength(1);
        expect(paginatedResult.pagination.total).toBe(2); // 2 running analyses
        expect(paginatedResult.pagination.totalPages).toBe(2);
      });
    });

    describe('response format', () => {
      it('should return non-paginated format when no pagination params', async () => {
        const result = await analysisService.getAllAnalyses({
          search: 'temp',
        });

        // Should be flat object, not { analyses, pagination }
        expect((result as { analyses?: unknown }).analyses).toBeUndefined();
        expect((result as { pagination?: unknown }).pagination).toBeUndefined();
        expect(Object.keys(result)).toHaveLength(2);
      });

      it('should return all analyses when called with empty options', async () => {
        const result = await analysisService.getAllAnalyses({});

        expect(Object.keys(result)).toHaveLength(5);
      });
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
        process: {
          pid: 12345,
          killed: false,
        } as MockAnalysisProcess['process'],
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
        analysisId: 'test-analysis',
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
        process: {
          pid: 12345,
          killed: false,
        } as MockAnalysisProcess['process'],
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
});

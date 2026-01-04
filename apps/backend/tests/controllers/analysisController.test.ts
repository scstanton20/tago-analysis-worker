import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createControllerRequest,
  createControllerResponse,
  createMockFile,
  type MockRequest,
  type MockResponse,
} from '../utils/testHelpers.ts';
import type { AnalysesMap } from '@tago-analysis-worker/types';

// Mock dependencies before importing the controller
vi.mock('../../src/services/analysisService.ts', () => ({
  analysisService: {
    uploadAnalysis: vi.fn(),
    getAllAnalyses: vi.fn(),
    getAnalysisById: vi.fn(),
    runAnalysis: vi.fn(),
    stopAnalysis: vi.fn(),
    deleteAnalysis: vi.fn(),
    getAnalysisContent: vi.fn(),
    getVersionContent: vi.fn(),
    updateAnalysis: vi.fn(),
    renameAnalysis: vi.fn(),
    getLogs: vi.fn(),
    getLogsForDownload: vi.fn(),
    clearLogs: vi.fn(),
    downloadAnalysis: vi.fn(),
    getVersions: vi.fn(),
    rollbackToVersion: vi.fn(),
    updateEnvironment: vi.fn(),
    getEnvironment: vi.fn(),
    getConfig: vi.fn(),
  },
}));

vi.mock('../../src/utils/sse/index.ts', () => ({
  sseManager: {
    broadcastAnalysisUpdate: vi.fn(),
    broadcastToTeamUsers: vi.fn(),
  },
}));

// Use real validation functions from safePath, only mock file I/O operations
vi.mock('../../src/utils/safePath.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/utils/safePath.ts')>();
  return {
    ...actual,
    // Only mock file I/O operations
    safeWriteFile: vi.fn().mockResolvedValue(undefined),
    safeUnlink: vi.fn().mockResolvedValue(undefined),
    safeReadFile: vi.fn().mockResolvedValue(''),
    safeMkdir: vi.fn().mockResolvedValue(undefined),
    safeReaddir: vi.fn().mockResolvedValue([]),
    safeStat: vi.fn().mockResolvedValue({ isFile: () => true, size: 0 }),
  };
});

// Use real responseHelpers - they are pure functions
// Only mock broadcastTeamStructureUpdate which has side effects (SSE broadcasting)
vi.mock('../../src/utils/responseHelpers.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/utils/responseHelpers.ts')>();
  return {
    ...actual,
    broadcastTeamStructureUpdate: vi.fn(),
  };
});

vi.mock('../../src/config/default.ts', () => ({
  config: {
    paths: {
      analysis: '/tmp/test-analyses',
      config: '/tmp/test-config',
    },
  },
}));

vi.mock('../../src/services/analysisInfoService.ts', () => ({
  analysisInfoService: {
    getAnalysisMeta: vi.fn(),
    getAnalysisNotes: vi.fn(),
    updateAnalysisNotes: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/middleware/betterAuthMiddleware.ts', () => ({
  getUserTeamIds: vi.fn().mockReturnValue(['team-1', 'team-2']),
  authMiddleware: vi.fn(
    (_req: MockRequest, _res: MockResponse, next: () => void) => next(),
  ),
  extractAnalysisTeam: vi.fn(
    (_req: MockRequest, _res: MockResponse, next: () => void) => next(),
  ),
  requireTeamPermission: vi.fn(
    () => (_req: MockRequest, _res: MockResponse, next: () => void) => next(),
  ),
  requireAnyTeamPermission: vi.fn(
    () => (_req: MockRequest, _res: MockResponse, next: () => void) => next(),
  ),
}));

// Type definitions for mocked services
type MockAnalysisService = {
  uploadAnalysis: Mock;
  getAllAnalyses: Mock;
  getAnalysisById: Mock;
  runAnalysis: Mock;
  stopAnalysis: Mock;
  deleteAnalysis: Mock;
  getAnalysisContent: Mock;
  getVersionContent: Mock;
  updateAnalysis: Mock;
  renameAnalysis: Mock;
  getLogs: Mock;
  getLogsForDownload: Mock;
  clearLogs: Mock;
  downloadAnalysis: Mock;
  getVersions: Mock;
  rollbackToVersion: Mock;
  updateEnvironment: Mock;
  getEnvironment: Mock;
  getConfig: Mock;
};

type MockSSEManager = {
  broadcastAnalysisUpdate: Mock;
  broadcastToTeamUsers: Mock;
};

// Import after mocks
const { analysisService } = (await import(
  '../../src/services/analysisService.ts'
)) as unknown as { analysisService: MockAnalysisService };
const { sseManager } = (await import(
  '../../src/utils/sse/index.ts'
)) as unknown as {
  sseManager: MockSSEManager;
};
const { AnalysisController } = await import(
  '../../src/controllers/analysisController.ts'
);

describe('AnalysisController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadAnalysis', () => {
    it('should upload analysis successfully', async () => {
      const req = createControllerRequest({
        files: {
          analysis: createMockFile(),
        },
        body: {
          teamId: 'team-123',
          targetFolderId: 'folder-123',
        },
      });
      const res = createControllerResponse();

      analysisService.uploadAnalysis.mockResolvedValue({
        analysisId: 'analysis-uuid-123',
        analysisName: 'test-analysis',
      });

      analysisService.getAllAnalyses.mockResolvedValue({
        'analysis-uuid-123': {
          id: 'analysis-uuid-123',
          name: 'test-analysis',
          status: 'stopped',
          enabled: true,
          lastStartTime: null,
          teamId: 'team-123',
        },
      } as AnalysesMap);

      analysisService.getConfig.mockResolvedValue({
        teamStructure: {
          'team-123': {
            items: [],
          },
        },
      });

      await AnalysisController.uploadAnalysis(req, res);

      expect(analysisService.uploadAnalysis).toHaveBeenCalledWith(
        req.files.analysis,
        'team-123',
        'folder-123',
      );
      expect(res.json).toHaveBeenCalledWith({
        analysisId: 'analysis-uuid-123',
        analysisName: 'test-analysis',
      });
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });

    it('should return 400 if no file is uploaded', async () => {
      const req = createControllerRequest({
        files: {},
      });
      const res = createControllerResponse();

      await AnalysisController.uploadAnalysis(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });

    it('should return 413 if file size exceeds limit', async () => {
      const req = createControllerRequest({
        files: {
          analysis: createMockFile({
            size: 60 * 1024 * 1024, // 60MB
          }),
        },
        body: {
          teamId: 'team-123',
        },
      });
      const res = createControllerResponse();

      await AnalysisController.uploadAnalysis(req, res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'File size exceeds the maximum limit of 50MB',
        }),
      );
    });
  });

  describe('getAnalyses', () => {
    it('should return all analyses for admin users', async () => {
      const req = createControllerRequest({
        user: { id: 'admin-id', role: 'admin' },
        query: {},
      });
      const res = createControllerResponse();

      const mockAnalyses: AnalysesMap = {
        'uuid-analysis-1': {
          id: 'uuid-analysis-1',
          name: 'analysis-1',
          status: 'running',
          teamId: null,
          enabled: true,
          lastStartTime: null,
        },
        'uuid-analysis-2': {
          id: 'uuid-analysis-2',
          name: 'analysis-2',
          status: 'stopped',
          teamId: null,
          enabled: true,
          lastStartTime: null,
        },
      };

      analysisService.getAllAnalyses.mockResolvedValue(mockAnalyses);

      await AnalysisController.getAnalyses(req, res);

      expect(analysisService.getAllAnalyses).toHaveBeenCalledWith({
        search: '',
        teamId: undefined,
        status: undefined,
        page: undefined,
        limit: undefined,
      });
      expect(res.json).toHaveBeenCalledWith(mockAnalyses);
    });

    it('should return filtered analyses for regular users', async () => {
      const req = createControllerRequest({
        user: { id: 'user-id', role: 'user' },
        query: {},
      });
      const res = createControllerResponse();

      const mockAnalyses: AnalysesMap = {
        'uuid-analysis-1': {
          id: 'uuid-analysis-1',
          name: 'analysis-1',
          status: 'running',
          teamId: null,
          enabled: true,
          lastStartTime: null,
        },
      };

      analysisService.getAllAnalyses.mockResolvedValue(mockAnalyses);

      // betterAuthMiddleware is mocked at module level with getUserTeamIds returning ['team-1', 'team-2']
      await AnalysisController.getAnalyses(req, res);

      expect(res.json).toHaveBeenCalledWith(mockAnalyses);
    });

    it('should pass search query param to service', async () => {
      const req = createControllerRequest({
        user: { id: 'admin-id', role: 'admin' },
        query: { search: 'temperature' },
      });
      const res = createControllerResponse();

      const mockAnalyses: AnalysesMap = {
        'uuid-analysis-1': {
          id: 'uuid-analysis-1',
          name: 'temperature-sensor',
          status: 'running',
          teamId: null,
          enabled: true,
          lastStartTime: null,
        },
      };

      analysisService.getAllAnalyses.mockResolvedValue(mockAnalyses);

      await AnalysisController.getAnalyses(req, res);

      expect(analysisService.getAllAnalyses).toHaveBeenCalledWith({
        search: 'temperature',
        teamId: undefined,
        status: undefined,
        page: undefined,
        limit: undefined,
      });
    });

    it('should pass status query param to service', async () => {
      const req = createControllerRequest({
        user: { id: 'admin-id', role: 'admin' },
        query: { status: 'running' },
      });
      const res = createControllerResponse();

      analysisService.getAllAnalyses.mockResolvedValue({});

      await AnalysisController.getAnalyses(req, res);

      expect(analysisService.getAllAnalyses).toHaveBeenCalledWith({
        search: '',
        teamId: undefined,
        status: 'running',
        page: undefined,
        limit: undefined,
      });
    });

    it('should pass teamId query param to service', async () => {
      const req = createControllerRequest({
        user: { id: 'admin-id', role: 'admin' },
        query: { teamId: 'team-123' },
      });
      const res = createControllerResponse();

      analysisService.getAllAnalyses.mockResolvedValue({});

      await AnalysisController.getAnalyses(req, res);

      expect(analysisService.getAllAnalyses).toHaveBeenCalledWith({
        search: '',
        teamId: 'team-123',
        status: undefined,
        page: undefined,
        limit: undefined,
      });
    });

    it('should pass pagination params to service', async () => {
      const req = createControllerRequest({
        user: { id: 'admin-id', role: 'admin' },
        query: { page: '2', limit: '10' },
      });
      const res = createControllerResponse();

      const mockResult = {
        analyses: { 'analysis-1': { name: 'test', status: 'stopped' } },
        pagination: {
          page: 2,
          limit: 10,
          total: 15,
          totalPages: 2,
          hasMore: false,
        },
      };

      analysisService.getAllAnalyses.mockResolvedValue(mockResult);

      await AnalysisController.getAnalyses(req, res);

      expect(analysisService.getAllAnalyses).toHaveBeenCalledWith({
        search: '',
        teamId: undefined,
        status: undefined,
        page: 2,
        limit: 10,
      });
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should combine all query params', async () => {
      const req = createControllerRequest({
        user: { id: 'admin-id', role: 'admin' },
        query: {
          search: 'temp',
          teamId: 'team-1',
          status: 'running',
          page: '1',
          limit: '5',
        },
      });
      const res = createControllerResponse();

      analysisService.getAllAnalyses.mockResolvedValue({
        analyses: {},
        pagination: {
          page: 1,
          limit: 5,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
      });

      await AnalysisController.getAnalyses(req, res);

      expect(analysisService.getAllAnalyses).toHaveBeenCalledWith({
        search: 'temp',
        teamId: 'team-1',
        status: 'running',
        page: 1,
        limit: 5,
      });
    });
  });

  describe('runAnalysis', () => {
    it('should start analysis successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      analysisService.runAnalysis.mockResolvedValue({ success: true });

      await AnalysisController.runAnalysis(req, res);

      expect(analysisService.runAnalysis).toHaveBeenCalledWith(analysisId);
      expect(res.json).toHaveBeenCalledWith({ success: true });
      // No SSE broadcast expected here - the actual process lifecycle event
      // (analysisUpdate) will be sent from analysisProcess.js when the child process starts
    });
  });

  describe('stopAnalysis', () => {
    it('should stop analysis successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      analysisService.stopAnalysis.mockResolvedValue({ success: true });

      await AnalysisController.stopAnalysis(req, res);

      expect(analysisService.stopAnalysis).toHaveBeenCalledWith(analysisId);
      expect(res.json).toHaveBeenCalledWith({ success: true });
      // No SSE broadcast expected here - the actual process lifecycle event
      // (analysisUpdate) will be sent from analysisProcess.js when the child process exits
    });
  });

  describe('deleteAnalysis', () => {
    it('should delete analysis successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
        teamId: 'team-123',
      });

      analysisService.deleteAnalysis.mockResolvedValue({
        message: 'Deleted successfully',
      });

      analysisService.getConfig.mockResolvedValue({
        teamStructure: {
          'team-123': {
            items: [],
          },
        },
      });

      await AnalysisController.deleteAnalysis(req, res);

      expect(analysisService.deleteAnalysis).toHaveBeenCalledWith(analysisId);
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('getAnalysisContent', () => {
    it('should get analysis content successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: {},
      });
      const res = createControllerResponse();

      analysisService.getAnalysisContent.mockResolvedValue(
        'console.log("test");',
      );

      await AnalysisController.getAnalysisContent(req, res);

      expect(analysisService.getAnalysisContent).toHaveBeenCalledWith(
        analysisId,
      );
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(res.send).toHaveBeenCalledWith('console.log("test");');
    });

    it('should get version content when version is specified', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { version: '1' },
      });
      const res = createControllerResponse();

      analysisService.getVersionContent.mockResolvedValue(
        'console.log("version 1");',
      );

      await AnalysisController.getAnalysisContent(req, res);

      expect(analysisService.getVersionContent).toHaveBeenCalledWith(
        analysisId,
        1,
      );
      expect(res.send).toHaveBeenCalledWith('console.log("version 1");');
    });

    it('should return 400 for invalid version number', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { version: 'invalid' },
      });
      const res = createControllerResponse();

      await AnalysisController.getAnalysisContent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid version number',
      });
    });
  });

  describe('updateAnalysis', () => {
    it('should update analysis successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { content: 'console.log("updated");' },
      });
      const res = createControllerResponse();

      analysisService.updateAnalysis.mockResolvedValue({
        success: true,
        restarted: false,
      });

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
        status: 'stopped',
      });

      await AnalysisController.updateAnalysis(req, res);

      expect(analysisService.updateAnalysis).toHaveBeenCalledWith(analysisId, {
        content: 'console.log("updated");',
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Analysis updated successfully',
        }),
      );
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('renameAnalysis', () => {
    it('should rename analysis successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { newName: 'new-name' },
      });
      const res = createControllerResponse();

      analysisService.renameAnalysis.mockResolvedValue({
        success: true,
        restarted: false,
      });

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'new-name',
        status: 'stopped',
      });

      await AnalysisController.renameAnalysis(req, res);

      expect(analysisService.renameAnalysis).toHaveBeenCalledWith(
        analysisId,
        'new-name',
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Analysis renamed successfully',
        }),
      );
    });
  });

  describe('getLogs', () => {
    it('should get logs successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { page: '1', limit: '100' },
      });
      const res = createControllerResponse();

      const mockLogs = {
        logs: [{ message: 'test log' }],
        hasMore: false,
        totalCount: 1,
      };

      analysisService.getLogs.mockResolvedValue(mockLogs);

      await AnalysisController.getLogs(req, res);

      expect(analysisService.getLogs).toHaveBeenCalledWith(analysisId, 1, 100);
      expect(res.json).toHaveBeenCalledWith(mockLogs);
    });

    it('should use default pagination values', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: {},
      });
      const res = createControllerResponse();

      analysisService.getLogs.mockResolvedValue({
        logs: [],
        hasMore: false,
        totalCount: 0,
      });

      await AnalysisController.getLogs(req, res);

      expect(analysisService.getLogs).toHaveBeenCalledWith(analysisId, 1, 100);
    });
  });

  describe('clearLogs', () => {
    it('should clear logs successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      analysisService.clearLogs.mockResolvedValue({
        success: true,
        message: 'Logs cleared',
      });

      await AnalysisController.clearLogs(req, res);

      expect(analysisService.clearLogs).toHaveBeenCalledWith(
        analysisId,
        expect.objectContaining({ logger: expect.any(Object) }),
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logs cleared',
      });
    });
  });

  describe('getVersions', () => {
    it('should get versions successfully with pagination', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { page: '1', limit: '10' },
      });
      const res = createControllerResponse();

      const mockVersions = [
        { version: 2, timestamp: '2025-01-02', size: 150 },
        { version: 1, timestamp: '2025-01-01', size: 100 },
      ];

      const mockResult = {
        versions: mockVersions,
        page: 1,
        limit: 10,
        totalCount: 2,
        totalPages: 1,
        hasMore: false,
        nextVersionNumber: 3,
        currentVersion: 2,
      };

      analysisService.getVersions.mockResolvedValue(mockResult);

      await AnalysisController.getVersions(req, res);

      expect(analysisService.getVersions).toHaveBeenCalledWith(analysisId, {
        page: 1,
        limit: 10,
        logger: req.log,
      });
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should pass pagination parameters to service', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { page: '2', limit: '5' },
      });
      const res = createControllerResponse();

      analysisService.getVersions.mockResolvedValue({
        versions: [],
        page: 2,
        limit: 5,
        totalCount: 0,
        totalPages: 0,
        hasMore: false,
        nextVersionNumber: 2,
        currentVersion: 1,
      });

      await AnalysisController.getVersions(req, res);

      expect(analysisService.getVersions).toHaveBeenCalledWith(analysisId, {
        page: 2,
        limit: 5,
        logger: req.log,
      });
    });
  });

  describe('rollbackToVersion', () => {
    it('should rollback to version successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { version: 1 },
      });
      const res = createControllerResponse();

      analysisService.rollbackToVersion.mockResolvedValue({
        success: true,
        restarted: false,
        version: 1,
      });

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
        status: 'stopped',
      });

      await AnalysisController.rollbackToVersion(req, res);

      expect(analysisService.rollbackToVersion).toHaveBeenCalledWith(
        analysisId,
        1,
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          version: 1,
        }),
      );
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('updateEnvironment', () => {
    it('should update environment successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { env: { KEY: 'value' } },
      });
      const res = createControllerResponse();

      analysisService.updateEnvironment.mockResolvedValue({
        success: true,
        restarted: false,
      });

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
        status: 'stopped',
      });

      await AnalysisController.updateEnvironment(req, res);

      expect(analysisService.updateEnvironment).toHaveBeenCalledWith(
        analysisId,
        { KEY: 'value' },
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Environment updated successfully',
        }),
      );
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('getEnvironment', () => {
    it('should get environment successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      const mockEnv = { KEY: 'value', SECRET: 'secret' };

      analysisService.getEnvironment.mockResolvedValue(mockEnv);

      await AnalysisController.getEnvironment(req, res);

      expect(analysisService.getEnvironment).toHaveBeenCalledWith(analysisId);
      expect(res.json).toHaveBeenCalledWith(mockEnv);
    });
  });

  describe('downloadAnalysis', () => {
    it('should download current version successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: {},
      });
      const res = createControllerResponse();

      analysisService.getAnalysisContent.mockResolvedValue(
        'console.log("test");',
      );
      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        name: 'test-analysis',
        status: 'stopped',
      });

      await AnalysisController.downloadAnalysis(req, res);

      expect(analysisService.getAnalysisContent).toHaveBeenCalledWith(
        analysisId,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('test-analysis'),
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/javascript',
      );
      expect(res.send).toHaveBeenCalledWith('console.log("test");');
    });

    it('should download specific version successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { version: '2' },
      });
      const res = createControllerResponse();

      analysisService.getVersionContent.mockResolvedValue(
        'console.log("version 2");',
      );
      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        name: 'test-analysis',
        status: 'stopped',
      });

      await AnalysisController.downloadAnalysis(req, res);

      expect(analysisService.getVersionContent).toHaveBeenCalledWith(
        analysisId,
        2,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('_v2.js'),
      );
      expect(res.send).toHaveBeenCalledWith('console.log("version 2");');
    });

    it('should return 400 for invalid version number', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { version: 'invalid' },
      });
      const res = createControllerResponse();

      await AnalysisController.downloadAnalysis(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid version number',
      });
    });

    it('should return 400 for negative version number', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { version: '-1' },
      });
      const res = createControllerResponse();

      await AnalysisController.downloadAnalysis(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid version number',
      });
    });

    it('should use analysis ID as fallback when name is undefined', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: {},
      });
      const res = createControllerResponse();

      analysisService.getAnalysisContent.mockResolvedValue('code');
      analysisService.getAnalysisById.mockReturnValue(undefined);

      await AnalysisController.downloadAnalysis(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${analysisId}.js"`,
      );
    });
  });

  describe('downloadLogs', () => {
    it('should download full logs when timeRange is all', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { timeRange: 'all' },
      });
      const res = createControllerResponse();

      // Mock fs.access to not throw
      const fsMock = await import('fs');
      (fsMock.promises.access as Mock).mockResolvedValue(undefined);

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
      });

      // Use a spy to verify handleFullLogDownload is called
      const spy = vi.spyOn(AnalysisController, 'handleFullLogDownload');
      spy.mockResolvedValue(undefined);

      await AnalysisController.downloadLogs(req, res);

      expect(spy).toHaveBeenCalledWith(analysisId, req, res);
      spy.mockRestore();
    });

    it('should download filtered logs when timeRange is not all', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { timeRange: 'last24h' },
      });
      const res = createControllerResponse();

      const spy = vi.spyOn(AnalysisController, 'handleFilteredLogDownload');
      spy.mockResolvedValue(undefined);

      await AnalysisController.downloadLogs(req, res);

      expect(spy).toHaveBeenCalledWith(analysisId, 'last24h', req, res);
      spy.mockRestore();
    });

    it('should use default timeRange of all when not provided', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: {},
      });
      const res = createControllerResponse();

      const spy = vi.spyOn(AnalysisController, 'handleFilteredLogDownload');
      spy.mockResolvedValue(undefined);

      await AnalysisController.downloadLogs(req, res);

      expect(spy).toHaveBeenCalledWith(analysisId, 'all', req, res);
      spy.mockRestore();
    });
  });

  describe('handleFullLogDownload', () => {
    it('should set download headers before streaming', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      // Mock fs.access to succeed
      const fsMock = await import('fs');
      (fsMock.promises.access as Mock).mockResolvedValue(undefined);

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        name: 'test-analysis',
      });

      // Just verify headers are set - archiver is a real module
      // that we don't need to fully test here
      // We're testing that setZipDownloadHeaders is called correctly
      const spy = vi.spyOn(AnalysisController, 'setZipDownloadHeaders');

      try {
        await AnalysisController.handleFullLogDownload(analysisId, req, res);
      } catch {
        // Expected to fail due to real archiver, but headers should be set
      }

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should return 404 when log file not found', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      // Mock fs.access to throw ENOENT
      const fsMock = await import('fs');
      const error = new Error('File not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      (fsMock.promises.access as Mock).mockRejectedValue(error);

      await AnalysisController.handleFullLogDownload(analysisId, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining(`Log file for analysis ${analysisId}`),
        }),
      );
    });

    it('should throw and handle non-ENOENT fs errors', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      // Mock fs.access to throw a non-ENOENT error
      const fsMock = await import('fs');
      const error = new Error('Permission denied');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      (fsMock.promises.access as Mock).mockRejectedValue(error);

      // Should throw the error since it's not ENOENT
      try {
        await AnalysisController.handleFullLogDownload(analysisId, req, res);
      } catch (e) {
        expect((e as Error).message).toBe('Permission denied');
      }
    });
  });

  describe('handleFilteredLogDownload', () => {
    it('should call getLogsForDownload with correct parameters', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const timeRange = 'last24h';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      analysisService.getLogsForDownload.mockResolvedValue({
        content: 'filtered log content',
      });

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
      });

      // Spy on setZipDownloadHeaders to avoid testing archiver
      const spy = vi.spyOn(AnalysisController, 'setZipDownloadHeaders');

      try {
        await AnalysisController.handleFilteredLogDownload(
          analysisId,
          timeRange,
          req,
          res,
        );
      } catch {
        // Expected to fail due to real archiver, but service should be called
      }

      expect(analysisService.getLogsForDownload).toHaveBeenCalledWith(
        analysisId,
        timeRange,
      );
      spy.mockRestore();
    });

    it('should handle errors during filtered log download', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const timeRange = 'last24h';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      const error = new Error('Failed to get logs');
      analysisService.getLogsForDownload.mockRejectedValue(error);

      await AnalysisController.handleFilteredLogDownload(
        analysisId,
        timeRange,
        req,
        res,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to generate download file',
      });
    });
  });

  describe('getAnalysisMeta', () => {
    it('should get analysis metadata successfully', async () => {
      const { analysisInfoService } = (await import(
        '../../src/services/analysisInfoService.ts'
      )) as unknown as {
        analysisInfoService: { getAnalysisMeta: Mock };
      };

      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      const mockMeta = {
        analysisId,
        createdAt: '2025-01-01T00:00:00Z',
        fileSize: 1024,
        versions: 5,
      };

      analysisInfoService.getAnalysisMeta.mockResolvedValue(mockMeta);

      await AnalysisController.getAnalysisMeta(req, res);

      expect(analysisInfoService.getAnalysisMeta).toHaveBeenCalledWith(
        analysisId,
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockMeta);
    });
  });

  describe('getAnalysisNotes', () => {
    it('should get analysis notes successfully', async () => {
      const { analysisInfoService } = (await import(
        '../../src/services/analysisInfoService.ts'
      )) as unknown as {
        analysisInfoService: { getAnalysisNotes: Mock };
      };

      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      const mockNotes = {
        content: '# Analysis Notes\nThis is a test analysis',
        isNew: false,
      };

      analysisInfoService.getAnalysisNotes.mockResolvedValue(mockNotes);

      await AnalysisController.getAnalysisNotes(req, res);

      expect(analysisInfoService.getAnalysisNotes).toHaveBeenCalledWith(
        analysisId,
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockNotes);
    });

    it('should return default notes if none exist', async () => {
      const { analysisInfoService } = (await import(
        '../../src/services/analysisInfoService.ts'
      )) as unknown as {
        analysisInfoService: { getAnalysisNotes: Mock };
      };

      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      const mockNotes = {
        content: '# Analysis Notes\n\n',
        isNew: true,
      };

      analysisInfoService.getAnalysisNotes.mockResolvedValue(mockNotes);

      await AnalysisController.getAnalysisNotes(req, res);

      expect(res.json).toHaveBeenCalledWith(mockNotes);
    });
  });

  describe('updateAnalysisNotes', () => {
    it('should update analysis notes successfully', async () => {
      const { analysisInfoService } = (await import(
        '../../src/services/analysisInfoService.ts'
      )) as unknown as {
        analysisInfoService: { updateAnalysisNotes: Mock };
      };

      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { content: '# Updated Notes\nNew content' },
      });
      const res = createControllerResponse();

      const mockResult = {
        analysisName: 'test-analysis',
        lineCount: 2,
        lastModified: '2025-01-01T00:00:00Z',
      };

      analysisInfoService.updateAnalysisNotes.mockResolvedValue(mockResult);

      await AnalysisController.updateAnalysisNotes(req, res);

      expect(analysisInfoService.updateAnalysisNotes).toHaveBeenCalledWith(
        analysisId,
        '# Updated Notes\nNew content',
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('uploadAnalysis - invalid filename', () => {
    it('should return 400 for invalid filename with special characters', async () => {
      const req = createControllerRequest({
        files: {
          analysis: createMockFile({
            name: 'test<script>.js',
          }),
        },
        body: {
          teamId: 'team-123',
        },
      });
      const res = createControllerResponse();

      await AnalysisController.uploadAnalysis(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
      );
    });
  });

  describe('getAnalysisContent - edge cases', () => {
    it('should return 400 for negative version number', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { version: '-5' },
      });
      const res = createControllerResponse();

      await AnalysisController.getAnalysisContent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid version number',
      });
    });

    it('should return 400 for NaN version number', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { version: 'abc123' },
      });
      const res = createControllerResponse();

      await AnalysisController.getAnalysisContent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid version number',
      });
    });
  });

  describe('deleteAnalysis - teamId handling', () => {
    it('should broadcast deletion even when analysis has no teamId', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
        teamId: null,
      });

      analysisService.deleteAnalysis.mockResolvedValue({
        message: 'Deleted successfully',
      });

      await AnalysisController.deleteAnalysis(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });

    it('should handle when analysis does not exist', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
      });
      const res = createControllerResponse();

      analysisService.getAnalysisById.mockReturnValue(undefined);
      analysisService.deleteAnalysis.mockResolvedValue({
        message: 'Deleted successfully',
      });

      await AnalysisController.deleteAnalysis(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
      // broadcastAnalysisUpdate still called but with undefined teamId
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('renameAnalysis - teamId handling', () => {
    it('should skip team structure broadcast when analysis has no teamId', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { newName: 'new-name' },
      });
      const res = createControllerResponse();

      analysisService.renameAnalysis.mockResolvedValue({
        success: true,
        restarted: false,
      });

      analysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'new-name',
        status: 'stopped',
        teamId: null,
      });

      await AnalysisController.renameAnalysis(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Analysis renamed successfully',
        }),
      );
    });
  });

  describe('updateAnalysis - analysis data handling', () => {
    it('should handle when analysis is not found', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        body: { content: 'console.log("updated");' },
      });
      const res = createControllerResponse();

      analysisService.updateAnalysis.mockResolvedValue({
        success: true,
        restarted: false,
      });

      analysisService.getAnalysisById.mockReturnValue(undefined);

      await AnalysisController.updateAnalysis(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('getLogs - edge cases', () => {
    it('should handle invalid page parameter', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { page: 'invalid', limit: '100' },
      });
      const res = createControllerResponse();

      analysisService.getLogs.mockResolvedValue({
        logs: [],
        hasMore: false,
        totalCount: 0,
      });

      await AnalysisController.getLogs(req, res);

      // Should default to page 1 when invalid
      expect(analysisService.getLogs).toHaveBeenCalledWith(analysisId, 1, 100);
    });

    it('should handle invalid limit parameter', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { page: '1', limit: 'invalid' },
      });
      const res = createControllerResponse();

      analysisService.getLogs.mockResolvedValue({
        logs: [],
        hasMore: false,
        totalCount: 0,
      });

      await AnalysisController.getLogs(req, res);

      // Should default to limit 100 when invalid
      expect(analysisService.getLogs).toHaveBeenCalledWith(analysisId, 1, 100);
    });
  });

  describe('getVersions - edge cases', () => {
    it('should handle missing pagination params', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: {},
      });
      const res = createControllerResponse();

      analysisService.getVersions.mockResolvedValue({
        versions: [],
        page: undefined,
        limit: undefined,
        totalPages: 0,
        hasMore: false,
      });

      await AnalysisController.getVersions(req, res);

      expect(analysisService.getVersions).toHaveBeenCalledWith(analysisId, {
        page: undefined,
        limit: undefined,
        logger: req.log,
      });
    });

    it('should handle invalid page parameter', async () => {
      const analysisId = 'test-analysis-uuid-123';
      const req = createControllerRequest({
        params: { analysisId },
        query: { page: 'invalid', limit: '10' },
      });
      const res = createControllerResponse();

      analysisService.getVersions.mockResolvedValue({
        versions: [],
        page: undefined,
        limit: 10,
        totalPages: 0,
        hasMore: false,
      });

      await AnalysisController.getVersions(req, res);

      // parseInt("invalid") returns NaN, not undefined
      expect(analysisService.getVersions).toHaveBeenCalledWith(analysisId, {
        page: NaN,
        limit: 10,
        logger: req.log,
      });
    });
  });
});

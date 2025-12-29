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
interface MockAnalysisService {
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
}

interface MockSSEManager {
  broadcastAnalysisUpdate: Mock;
  broadcastToTeamUsers: Mock;
}

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

      expect(analysisService.clearLogs).toHaveBeenCalledWith(analysisId);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logs cleared',
      });
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
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
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createMockFile,
} from '../utils/testHelpers.js';

// Mock dependencies before importing the controller
vi.mock('../../src/services/analysisService.js', () => ({
  analysisService: {
    uploadAnalysis: vi.fn(),
    getAllAnalyses: vi.fn(),
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

vi.mock('../../src/utils/sse/index.js', () => ({
  sseManager: {
    broadcastAnalysisUpdate: vi.fn(),
    broadcastToTeamUsers: vi.fn(),
  },
}));

vi.mock('../../src/utils/safePath.js', () => ({
  sanitizeAndValidateFilename: vi.fn((filename) => filename),
  isPathSafe: vi.fn(() => true),
  safeWriteFile: vi.fn().mockResolvedValue(undefined),
  safeUnlink: vi.fn().mockResolvedValue(undefined),
  isValidFilename: vi.fn(() => true),
  FILENAME_REGEX: /^[a-zA-Z0-9_\-. ]+$/,
  FILENAME_ERROR_MESSAGE:
    'Filename can only contain alphanumeric characters, spaces, hyphens, underscores, and periods',
}));

vi.mock('../../src/utils/responseHelpers.js', () => ({
  handleError: vi.fn((res, error) => {
    res.status(500).json({ error: error.message });
  }),
  broadcastTeamStructureUpdate: vi.fn(),
}));

vi.mock('../../src/config/default.js', () => ({
  config: {
    paths: {
      analysis: '/tmp/test-analyses',
    },
  },
}));

vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks
const { analysisService } = await import(
  '../../src/services/analysisService.js'
);
const { sseManager } = await import('../../src/utils/sse/index.js');
const { AnalysisController } = await import(
  '../../src/controllers/analysisController.js'
);

describe('AnalysisController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadAnalysis', () => {
    it('should upload analysis successfully', async () => {
      const req = createMockRequest({
        files: {
          analysis: createMockFile(),
        },
        body: {
          teamId: 'team-123',
          targetFolderId: 'folder-123',
        },
      });
      const res = createMockResponse();

      analysisService.uploadAnalysis.mockResolvedValue({
        analysisName: 'test-analysis',
      });

      analysisService.getAllAnalyses.mockResolvedValue({
        'test-analysis': {
          name: 'test-analysis',
          status: 'stopped',
        },
      });

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
      expect(res.json).toHaveBeenCalledWith({ analysisName: 'test-analysis' });
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });

    it('should return 400 if no file is uploaded', async () => {
      const req = createMockRequest({
        files: {},
      });
      const res = createMockResponse();

      await AnalysisController.uploadAnalysis(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });

    it('should return 413 if file size exceeds limit', async () => {
      const req = createMockRequest({
        files: {
          analysis: createMockFile({
            size: 60 * 1024 * 1024, // 60MB
          }),
        },
        body: {
          teamId: 'team-123',
        },
      });
      const res = createMockResponse();

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
      const req = createMockRequest({
        user: { id: 'admin-id', role: 'admin' },
      });
      const res = createMockResponse();

      const mockAnalyses = {
        'analysis-1': { name: 'analysis-1', status: 'running' },
        'analysis-2': { name: 'analysis-2', status: 'stopped' },
      };

      analysisService.getAllAnalyses.mockResolvedValue(mockAnalyses);

      await AnalysisController.getAnalyses(req, res);

      expect(analysisService.getAllAnalyses).toHaveBeenCalledWith(
        null,
        req.log,
      );
      expect(res.json).toHaveBeenCalledWith(mockAnalyses);
    });

    it('should return filtered analyses for regular users', async () => {
      const req = createMockRequest({
        user: { id: 'user-id', role: 'user' },
      });
      const res = createMockResponse();

      const mockAnalyses = {
        'analysis-1': { name: 'analysis-1', status: 'running' },
      };

      analysisService.getAllAnalyses.mockResolvedValue(mockAnalyses);

      // Mock betterAuthMiddleware
      vi.doMock('../../src/middleware/betterAuthMiddleware.js', () => ({
        getUserTeamIds: vi.fn().mockReturnValue(['team-1', 'team-2']),
      }));

      await AnalysisController.getAnalyses(req, res);

      expect(res.json).toHaveBeenCalledWith(mockAnalyses);
    });
  });

  describe('runAnalysis', () => {
    it('should start analysis successfully', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
      });
      const res = createMockResponse();

      analysisService.runAnalysis.mockResolvedValue({ success: true });

      await AnalysisController.runAnalysis(req, res);

      expect(analysisService.runAnalysis).toHaveBeenCalledWith('test-analysis');
      expect(res.json).toHaveBeenCalledWith({ success: true });
      // No SSE broadcast expected here - the actual process lifecycle event
      // (analysisUpdate) will be sent from analysisProcess.js when the child process starts
    });
  });

  describe('stopAnalysis', () => {
    it('should stop analysis successfully', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
      });
      const res = createMockResponse();

      analysisService.stopAnalysis.mockResolvedValue({ success: true });

      await AnalysisController.stopAnalysis(req, res);

      expect(analysisService.stopAnalysis).toHaveBeenCalledWith(
        'test-analysis',
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
      // No SSE broadcast expected here - the actual process lifecycle event
      // (analysisUpdate) will be sent from analysisProcess.js when the child process exits
    });
  });

  describe('deleteAnalysis', () => {
    it('should delete analysis successfully', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
      });
      const res = createMockResponse();

      analysisService.getAllAnalyses.mockResolvedValue({
        'test-analysis': {
          teamId: 'team-123',
        },
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

      expect(analysisService.deleteAnalysis).toHaveBeenCalledWith(
        'test-analysis',
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('getAnalysisContent', () => {
    it('should get analysis content successfully', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        query: {},
      });
      const res = createMockResponse();

      analysisService.getAnalysisContent.mockResolvedValue(
        'console.log("test");',
      );

      await AnalysisController.getAnalysisContent(req, res);

      expect(analysisService.getAnalysisContent).toHaveBeenCalledWith(
        'test-analysis',
      );
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(res.send).toHaveBeenCalledWith('console.log("test");');
    });

    it('should get version content when version is specified', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        query: { version: '1' },
      });
      const res = createMockResponse();

      analysisService.getVersionContent.mockResolvedValue(
        'console.log("version 1");',
      );

      await AnalysisController.getAnalysisContent(req, res);

      expect(analysisService.getVersionContent).toHaveBeenCalledWith(
        'test-analysis',
        1,
      );
      expect(res.send).toHaveBeenCalledWith('console.log("version 1");');
    });

    it('should return 400 for invalid version number', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        query: { version: 'invalid' },
      });
      const res = createMockResponse();

      await AnalysisController.getAnalysisContent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid version number',
      });
    });
  });

  describe('updateAnalysis', () => {
    it('should update analysis successfully', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        body: { content: 'console.log("updated");' },
      });
      const res = createMockResponse();

      analysisService.updateAnalysis.mockResolvedValue({
        success: true,
        restarted: false,
      });

      analysisService.getAllAnalyses.mockResolvedValue({
        'test-analysis': {
          status: 'stopped',
        },
      });

      await AnalysisController.updateAnalysis(req, res);

      expect(analysisService.updateAnalysis).toHaveBeenCalledWith(
        'test-analysis',
        { content: 'console.log("updated");' },
      );
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
      const req = createMockRequest({
        params: { fileName: 'old-name' },
        body: { newFileName: 'new-name' },
      });
      const res = createMockResponse();

      analysisService.renameAnalysis.mockResolvedValue({
        success: true,
        restarted: false,
      });

      analysisService.getAllAnalyses.mockResolvedValue({
        'new-name': {
          status: 'stopped',
        },
      });

      await AnalysisController.renameAnalysis(req, res);

      expect(analysisService.renameAnalysis).toHaveBeenCalledWith(
        'old-name',
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
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        query: { page: '1', limit: '100' },
      });
      const res = createMockResponse();

      const mockLogs = {
        logs: [{ message: 'test log' }],
        hasMore: false,
        totalCount: 1,
      };

      analysisService.getLogs.mockResolvedValue(mockLogs);

      await AnalysisController.getLogs(req, res);

      expect(analysisService.getLogs).toHaveBeenCalledWith(
        'test-analysis',
        1,
        100,
      );
      expect(res.json).toHaveBeenCalledWith(mockLogs);
    });

    it('should use default pagination values', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        query: {},
      });
      const res = createMockResponse();

      analysisService.getLogs.mockResolvedValue({
        logs: [],
        hasMore: false,
        totalCount: 0,
      });

      await AnalysisController.getLogs(req, res);

      expect(analysisService.getLogs).toHaveBeenCalledWith(
        'test-analysis',
        1,
        100,
      );
    });
  });

  describe('clearLogs', () => {
    it('should clear logs successfully', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
      });
      const res = createMockResponse();

      analysisService.clearLogs.mockResolvedValue({
        success: true,
        message: 'Logs cleared',
      });

      await AnalysisController.clearLogs(req, res);

      expect(analysisService.clearLogs).toHaveBeenCalledWith('test-analysis');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logs cleared',
      });
      expect(sseManager.broadcastAnalysisUpdate).toHaveBeenCalled();
    });
  });

  describe('getVersions', () => {
    it('should get versions successfully with pagination', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        query: { page: 1, limit: 10 },
      });
      const res = createMockResponse();

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

      expect(analysisService.getVersions).toHaveBeenCalledWith(
        'test-analysis',
        {
          page: 1,
          limit: 10,
          logger: req.log,
        },
      );
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should pass pagination parameters to service', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        query: { page: 2, limit: 5 },
      });
      const res = createMockResponse();

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

      expect(analysisService.getVersions).toHaveBeenCalledWith(
        'test-analysis',
        {
          page: 2,
          limit: 5,
          logger: req.log,
        },
      );
    });
  });

  describe('rollbackToVersion', () => {
    it('should rollback to version successfully', async () => {
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        body: { version: 1 },
      });
      const res = createMockResponse();

      analysisService.rollbackToVersion.mockResolvedValue({
        success: true,
        restarted: false,
        version: 1,
      });

      analysisService.getAllAnalyses.mockResolvedValue({
        'test-analysis': {
          status: 'stopped',
        },
      });

      await AnalysisController.rollbackToVersion(req, res);

      expect(analysisService.rollbackToVersion).toHaveBeenCalledWith(
        'test-analysis',
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
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
        body: { env: { KEY: 'value' } },
      });
      const res = createMockResponse();

      analysisService.updateEnvironment.mockResolvedValue({
        success: true,
        restarted: false,
      });

      analysisService.getAllAnalyses.mockResolvedValue({
        'test-analysis': {
          status: 'stopped',
        },
      });

      await AnalysisController.updateEnvironment(req, res);

      expect(analysisService.updateEnvironment).toHaveBeenCalledWith(
        'test-analysis',
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
      const req = createMockRequest({
        params: { fileName: 'test-analysis' },
      });
      const res = createMockResponse();

      const mockEnv = { KEY: 'value', SECRET: 'secret' };

      analysisService.getEnvironment.mockResolvedValue(mockEnv);

      await AnalysisController.getEnvironment(req, res);

      expect(analysisService.getEnvironment).toHaveBeenCalledWith(
        'test-analysis',
      );
      expect(res.json).toHaveBeenCalledWith(mockEnv);
    });
  });
});

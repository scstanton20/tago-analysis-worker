import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('responseHelpers', () => {
  let responseHelpers;

  beforeEach(async () => {
    vi.clearAllMocks();
    responseHelpers = await import('../../src/utils/responseHelpers.js');
  });

  describe('handleError', () => {
    it('should return 400 for path traversal errors', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Path traversal attempt detected');

      responseHelpers.handleError(res, error, 'accessing file');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid file path' });
    });

    it('should return 400 for invalid filename errors', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Invalid filename provided');

      responseHelpers.handleError(res, error, 'creating file');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid file path' });
    });

    it('should return 404 for not found errors', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Resource not found');

      responseHelpers.handleError(res, error, 'fetching resource');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Resource not found' });
    });

    it('should return 409 for already exists errors', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Analysis already exists');

      responseHelpers.handleError(res, error, 'creating analysis');

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Analysis already exists',
      });
    });

    it('should return 400 for cannot move errors', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Cannot move item to itself');

      responseHelpers.handleError(res, error, 'moving item');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cannot move item to itself',
      });
    });

    it('should return 500 for generic errors', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Something went wrong');

      responseHelpers.handleError(res, error, 'processing request');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to processing request',
      });
    });

    it('should use error message when no operation provided', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Custom error message');

      responseHelpers.handleError(res, error, null);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Custom error message',
      });
    });

    it('should log error by default', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Test error');

      // handleError logs errors by default
      responseHelpers.handleError(res, error, 'test operation');

      // Verify the error was handled (status and json called)
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should not log error when logError is false', async () => {
      const { createChildLogger } = await import(
        '../../src/utils/logging/logger.js'
      );
      const mockLogger = createChildLogger();

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Test error');

      responseHelpers.handleError(res, error, 'test', { logError: false });

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should use custom logger when provided', async () => {
      const customLogger = {
        error: vi.fn(),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const error = new Error('Test error');

      responseHelpers.handleError(res, error, 'test', {
        logger: customLogger,
      });

      expect(customLogger.error).toHaveBeenCalled();
    });
  });

  describe('asyncHandler', () => {
    it('should execute controller function successfully', async () => {
      const controllerFn = vi.fn().mockResolvedValue(undefined);
      const req = {};
      const res = { json: vi.fn() };
      const next = vi.fn();

      const wrapped = responseHelpers.asyncHandler(controllerFn, 'test op');
      await wrapped(req, res, next);

      expect(controllerFn).toHaveBeenCalledWith(req, res, next);
    });

    it('should catch errors and call handleError', async () => {
      const error = new Error('Controller error');
      const controllerFn = vi.fn().mockRejectedValue(error);
      const req = {};
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const wrapped = responseHelpers.asyncHandler(
        controllerFn,
        'test operation',
      );
      await wrapped(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should use req.logger if available', async () => {
      const reqLogger = { error: vi.fn() };
      const error = new Error('Test');
      const controllerFn = vi.fn().mockRejectedValue(error);
      const req = { logger: reqLogger };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      const wrapped = responseHelpers.asyncHandler(controllerFn, 'test');
      await wrapped(req, res, next);

      expect(reqLogger.error).toHaveBeenCalled();
    });

    it('should return a function', () => {
      const controllerFn = vi.fn();
      const wrapped = responseHelpers.asyncHandler(controllerFn, 'test');

      expect(typeof wrapped).toBe('function');
    });
  });

  describe('broadcastTeamStructureUpdate', () => {
    it('should broadcast team structure update', async () => {
      const mockConfig = {
        teamStructure: {
          team1: { items: [{ id: '1', name: 'item1' }] },
        },
      };

      const mockAnalysisService = {
        getConfig: vi.fn().mockResolvedValue(mockConfig),
      };

      const mockSseManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      // Mock the dynamic import
      vi.doMock('../../src/services/analysisService.js', () => ({
        analysisService: mockAnalysisService,
      }));

      await responseHelpers.broadcastTeamStructureUpdate(
        mockSseManager,
        'team1',
      );

      expect(mockAnalysisService.getConfig).toHaveBeenCalled();
      expect(mockSseManager.broadcastToTeamUsers).toHaveBeenCalledWith(
        'team1',
        expect.objectContaining({
          type: 'teamStructureUpdated',
          teamId: 'team1',
        }),
      );

      vi.doUnmock('../../src/services/analysisService.js');
    });

    it('should handle missing team structure gracefully', async () => {
      const mockConfig = {
        teamStructure: {},
      };

      const mockAnalysisService = {
        getConfig: vi.fn().mockResolvedValue(mockConfig),
      };

      const mockSseManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      vi.doMock('../../src/services/analysisService.js', () => ({
        analysisService: mockAnalysisService,
      }));

      await responseHelpers.broadcastTeamStructureUpdate(
        mockSseManager,
        'nonexistent-team',
      );

      expect(mockSseManager.broadcastToTeamUsers).toHaveBeenCalledWith(
        'nonexistent-team',
        expect.objectContaining({
          items: [],
        }),
      );

      vi.doUnmock('../../src/services/analysisService.js');
    });

    it('should throw error on broadcast failure', async () => {
      const mockAnalysisService = {
        getConfig: vi.fn().mockRejectedValue(new Error('Config error')),
      };

      const mockSseManager = {
        broadcastToTeamUsers: vi.fn(),
      };

      vi.doMock('../../src/services/analysisService.js', () => ({
        analysisService: mockAnalysisService,
      }));

      await expect(
        responseHelpers.broadcastTeamStructureUpdate(mockSseManager, 'team1'),
      ).rejects.toThrow('Config error');

      vi.doUnmock('../../src/services/analysisService.js');
    });
  });
});

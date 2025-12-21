import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../utils/testHelpers.js';

// Mock dependencies before importing the controller
vi.mock('../../src/docs/utilsSwagger.js', () => ({
  getUtilsSpecs: vi.fn(),
}));

// Import after mocks
const { getUtilsSpecs } = await import('../../src/docs/utilsSwagger.js');
const { UtilsDocsController } = await import(
  '../../src/controllers/utilsDocsController.js'
);

describe('UtilsDocsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUtilsDocs', () => {
    it('should return utility documentation successfully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockSpecs = {
        openapi: '3.0.0',
        info: {
          title: 'Tago Analysis Utilities',
          version: '1.0.0',
        },
        paths: {
          '/utils/env': {
            get: {
              summary: 'Get environment variables',
            },
          },
          '/utils/context': {
            get: {
              summary: 'Get context',
            },
          },
        },
      };

      getUtilsSpecs.mockReturnValue(mockSpecs);

      UtilsDocsController.getUtilsDocs(req, res);

      expect(getUtilsSpecs).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockSpecs);
    });

    it('should return documentation with empty paths', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockSpecs = {
        openapi: '3.0.0',
        info: {
          title: 'Tago Analysis Utilities',
          version: '1.0.0',
        },
        paths: {},
      };

      getUtilsSpecs.mockReturnValue(mockSpecs);

      UtilsDocsController.getUtilsDocs(req, res);

      expect(getUtilsSpecs).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockSpecs);
    });

    it('should log path count when retrieving documentation', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockSpecs = {
        openapi: '3.0.0',
        paths: {
          '/utils/env': {},
          '/utils/context': {},
          '/utils/analysis': {},
        },
      };

      getUtilsSpecs.mockReturnValue(mockSpecs);

      UtilsDocsController.getUtilsDocs(req, res);

      expect(req.log.info).toHaveBeenCalledWith(
        { action: 'getUtilsDocs', pathCount: 3 },
        'Utility documentation retrieved',
      );
    });

    it('should handle error when getUtilsSpecs fails', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockError = new Error('Failed to generate specs');
      getUtilsSpecs.mockImplementation(() => {
        throw mockError;
      });

      UtilsDocsController.getUtilsDocs(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to retrieve utility documentation',
        message: 'Failed to generate specs',
      });
    });

    it('should log error when getUtilsSpecs fails', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockError = new Error('Swagger parsing error');
      getUtilsSpecs.mockImplementation(() => {
        throw mockError;
      });

      UtilsDocsController.getUtilsDocs(req, res);

      expect(req.log.error).toHaveBeenCalledWith(
        { err: mockError, action: 'getUtilsDocs' },
        'Failed to generate utility documentation',
      );
    });

    it('should handle specs with undefined paths', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockSpecs = {
        openapi: '3.0.0',
        info: {
          title: 'Tago Analysis Utilities',
          version: '1.0.0',
        },
        // paths is undefined
      };

      getUtilsSpecs.mockReturnValue(mockSpecs);

      UtilsDocsController.getUtilsDocs(req, res);

      expect(req.log.info).toHaveBeenCalledWith(
        { action: 'getUtilsDocs', pathCount: 0 },
        'Utility documentation retrieved',
      );
      expect(res.json).toHaveBeenCalledWith(mockSpecs);
    });
  });
});

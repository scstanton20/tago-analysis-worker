import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createControllerRequest,
  createControllerResponse,
} from '../utils/testHelpers.ts';

// Mock dependencies before importing the controller
vi.mock('../../src/docs/utilsSwagger.ts', () => ({
  getUtilsSpecs: vi.fn(),
}));

// Type for OpenAPI specification
interface OpenAPISpec {
  openapi: string;
  info?: {
    title: string;
    version: string;
  };
  paths?: Record<string, unknown>;
}

// Import after mocks
const { getUtilsSpecs } = (await import(
  '../../src/docs/utilsSwagger.ts'
)) as unknown as {
  getUtilsSpecs: Mock<() => OpenAPISpec>;
};
const { UtilsDocsController } = await import(
  '../../src/controllers/utilsDocsController.ts'
);

describe('UtilsDocsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUtilsDocs', () => {
    it('should return utility documentation successfully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockSpecs: OpenAPISpec = {
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
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockSpecs: OpenAPISpec = {
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
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockSpecs: OpenAPISpec = {
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
      const req = createControllerRequest();
      const res = createControllerResponse();

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
      const req = createControllerRequest();
      const res = createControllerResponse();

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
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockSpecs: OpenAPISpec = {
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

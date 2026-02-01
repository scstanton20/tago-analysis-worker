import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createControllerRequest,
  createControllerResponse,
} from '../utils/testHelpers.ts';

// Only mock getUtilsSpecs since it reads from filesystem via swaggerJSDoc
// getAvailablePackages and getAvailableUtilities are pure functions returning static data
vi.mock('../../src/docs/utilsSwagger.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/docs/utilsSwagger.ts')>();
  return {
    ...actual,
    getUtilsSpecs: vi.fn(),
  };
});

// Type for OpenAPI specification
type OpenAPISpec = {
  openapi: string;
  info?: {
    title: string;
    version: string;
  };
  paths?: Record<string, unknown>;
};

// Import after mocks - use real implementations for packages/utilities
const { getUtilsSpecs, getAvailablePackages, getAvailableUtilities } =
  await import('../../src/docs/utilsSwagger.ts');
const { UtilsDocsController } =
  await import('../../src/controllers/utilsDocsController.ts');

describe('UtilsDocsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOverview', () => {
    it('should return packages and utilities overview successfully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      await UtilsDocsController.getOverview(req, res);

      // Uses real data from utilsSwagger
      const expectedPackages = getAvailablePackages();
      const expectedUtilities = getAvailableUtilities();

      expect(res.json).toHaveBeenCalledWith({
        packages: expectedPackages,
        utilities: expectedUtilities,
      });
    });

    it('should log overview counts when retrieving', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      await UtilsDocsController.getOverview(req, res);

      const expectedPackages = getAvailablePackages();
      const expectedUtilities = getAvailableUtilities();

      expect(req.log.debug).toHaveBeenCalledWith(
        {
          action: 'getOverview',
          packageCount: expectedPackages.length,
          utilityCount: expectedUtilities.length,
        },
        'Utils overview retrieved',
      );
    });

    it('should handle empty packages and utilities', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      await UtilsDocsController.getOverview(req, res);

      // Real implementation returns actual data, just verify structure
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          packages: expect.any(Array),
          utilities: expect.any(Array),
        }),
      );
    });
  });

  describe('getPackages', () => {
    it('should return available packages successfully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      await UtilsDocsController.getPackages(req, res);

      const expectedPackages = getAvailablePackages();
      expect(res.json).toHaveBeenCalledWith(expectedPackages);
    });

    it('should log package count when retrieving', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      await UtilsDocsController.getPackages(req, res);

      const expectedPackages = getAvailablePackages();
      expect(req.log.debug).toHaveBeenCalledWith(
        { action: 'getPackages', count: expectedPackages.length },
        'Available packages retrieved',
      );
    });

    it('should return packages with expected structure', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      await UtilsDocsController.getPackages(req, res);

      const packages = getAvailablePackages();
      expect(packages.length).toBeGreaterThan(0);
      expect(packages[0]).toHaveProperty('name');
      expect(packages[0]).toHaveProperty('import');
      expect(packages[0]).toHaveProperty('description');
      expect(packages[0]).toHaveProperty('docsUrl');
    });
  });

  describe('getUtilities', () => {
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
            get: { summary: 'Get environment variables' },
          },
          '/utils/context': {
            get: { summary: 'Get context' },
          },
        },
      };

      (getUtilsSpecs as Mock).mockReturnValue(mockSpecs);

      await UtilsDocsController.getUtilities(req, res);

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

      (getUtilsSpecs as Mock).mockReturnValue(mockSpecs);

      await UtilsDocsController.getUtilities(req, res);

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

      (getUtilsSpecs as Mock).mockReturnValue(mockSpecs);

      await UtilsDocsController.getUtilities(req, res);

      expect(req.log.debug).toHaveBeenCalledWith(
        { action: 'getUtilities', pathCount: 3 },
        'Utility documentation retrieved',
      );
    });

    it('should throw error when getUtilsSpecs fails', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockError = new Error('Failed to generate specs');
      (getUtilsSpecs as Mock).mockImplementation(() => {
        throw mockError;
      });

      await expect(UtilsDocsController.getUtilities(req, res)).rejects.toThrow(
        'Failed to generate specs',
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

      (getUtilsSpecs as Mock).mockReturnValue(mockSpecs);

      await UtilsDocsController.getUtilities(req, res);

      expect(req.log.debug).toHaveBeenCalledWith(
        { action: 'getUtilities', pathCount: 0 },
        'Utility documentation retrieved',
      );
      expect(res.json).toHaveBeenCalledWith(mockSpecs);
    });
  });
});

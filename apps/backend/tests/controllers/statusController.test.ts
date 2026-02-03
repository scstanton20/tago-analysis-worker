import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createControllerRequest,
  createControllerResponse,
} from '../utils/testHelpers.ts';

// Mock dependencies before importing the controller
vi.mock('../../src/services/analysis/index.ts', () => ({
  analysisService: {
    getRunningAnalysesCount: vi.fn(() => 1),
  },
}));

vi.mock('../../src/utils/sse/index.ts', () => ({
  sseManager: {
    getContainerState: vi.fn(),
  },
}));

// Mock packageVersion module directly - this is the proper way to mock it
// since the module caches the version at import time
vi.mock('../../src/utils/packageVersion.ts', () => ({
  getPackageVersion: vi.fn(() => '12.4.0'),
}));

// Mock ms module
vi.mock('ms', () => ({
  default: vi.fn((ms: number, _options?: unknown) => {
    if (ms <= 0) return '0 seconds';
    if (ms < 60000) return `${Math.floor(ms / 1000)} seconds`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)} minutes`;
    return `${Math.floor(ms / 3600000)} hours`;
  }),
}));

// Type definitions for mocked services
type ContainerState = {
  status: string | null;
  message: string | null;
  startTime: Date | null;
};

type MockSSEManager = {
  getContainerState: Mock<() => ContainerState>;
};

type MockAnalysisService = {
  getRunningAnalysesCount: Mock<() => number>;
};

// Import after mocks
const { getPackageVersion } =
  (await import('../../src/utils/packageVersion.ts')) as unknown as {
    getPackageVersion: Mock<() => string>;
  };
const { sseManager } =
  (await import('../../src/utils/sse/index.ts')) as unknown as {
    sseManager: MockSSEManager;
  };
const { analysisService } =
  (await import('../../src/services/analysis/index.ts')) as unknown as {
    analysisService: MockAnalysisService;
  };
const { StatusController } =
  await import('../../src/controllers/statusController.ts');

describe('StatusController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to default returning 1 running analysis
    analysisService.getRunningAnalysesCount.mockReturnValue(1);
    // Reset SDK version mock to default
    getPackageVersion.mockReturnValue('12.4.0');
  });

  describe('getSystemStatus', () => {
    it('should return healthy status with running analyses', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockContainerState: ContainerState = {
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date('2025-01-14T10:00:00Z'),
      };

      sseManager.getContainerState.mockReturnValue(mockContainerState);

      await StatusController.getSystemStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          container_health: expect.objectContaining({
            status: 'healthy',
            message: 'Container is ready',
            uptime: expect.objectContaining({
              seconds: expect.any(Number),
              formatted: expect.any(String),
            }),
          }),
          tagoConnection: expect.objectContaining({
            sdkVersion: '12.4.0',
            runningAnalyses: 1,
          }),
          serverTime: expect.any(String),
        }),
      );
    });

    it('should return initializing status when container is not ready', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockContainerState: ContainerState = {
        status: 'initializing',
        message: 'Container is starting up',
        startTime: new Date(),
      };

      sseManager.getContainerState.mockReturnValue(mockContainerState);

      await StatusController.getSystemStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(203); // Non-Authoritative Information
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          container_health: expect.objectContaining({
            status: 'initializing',
          }),
        }),
      );
    });

    it('should return error status when container has an error', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockContainerState: ContainerState = {
        status: 'error',
        message: 'Container error occurred',
        startTime: new Date(),
      };

      sseManager.getContainerState.mockReturnValue(mockContainerState);

      await StatusController.getSystemStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle unknown Tago SDK version gracefully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      // Mock SDK version as unknown
      getPackageVersion.mockReturnValue('unknown');

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tagoConnection: expect.objectContaining({
            sdkVersion: 'unknown',
          }),
        }),
      );
    });

    it('should count running analyses correctly', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tagoConnection: expect.objectContaining({
            runningAnalyses: 1, // Only 1 running analysis from mock
          }),
        }),
      );
    });

    it('should handle missing container state gracefully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      sseManager.getContainerState.mockReturnValue({
        status: null,
        message: null,
        startTime: null,
      });

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          container_health: expect.objectContaining({
            message: 'Container status unknown',
          }),
        }),
      );
    });

    it('should calculate uptime correctly', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: twoHoursAgo,
      });

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          container_health: expect.objectContaining({
            uptime: expect.objectContaining({
              seconds: expect.any(Number),
              formatted: expect.any(String),
            }),
          }),
        }),
      );
    });

    it('should handle zero uptime', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          container_health: expect.objectContaining({
            uptime: expect.objectContaining({
              formatted: expect.any(String),
            }),
          }),
        }),
      );
    });

    it('should handle zero running analyses', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      // Set mock to return 0 running analyses
      analysisService.getRunningAnalysesCount.mockReturnValue(0);

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tagoConnection: expect.objectContaining({
            runningAnalyses: 0,
          }),
        }),
      );
    });

    it('should include server time in response', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          serverTime: expect.any(String),
        }),
      );
    });
  });
});

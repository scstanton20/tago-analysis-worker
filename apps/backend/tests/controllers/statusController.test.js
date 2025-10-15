import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../utils/testHelpers.js';

// Mock dependencies before importing the controller
vi.mock('../../src/services/analysisService.js', () => ({
  analysisService: {
    analyses: new Map([
      [
        'running-analysis',
        {
          status: 'running',
        },
      ],
      [
        'stopped-analysis',
        {
          status: 'stopped',
        },
      ],
    ]),
  },
}));

vi.mock('../../src/utils/sse.js', () => ({
  sseManager: {
    getContainerState: vi.fn(),
  },
}));

vi.mock('../../src/utils/responseHelpers.js', () => ({
  handleError: vi.fn((res, error) => {
    res.status(500).json({ error: error.message });
  }),
}));

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock path module
vi.mock('path', () => ({
  dirname: vi.fn((p) => {
    const parts = p.split('/');
    parts.pop();
    return parts.join('/') || '/';
  }),
  join: vi.fn((...args) => args.join('/')),
}));

// Mock ms module
vi.mock('ms', () => ({
  default: vi.fn((ms, _options) => {
    if (ms <= 0) return '0 seconds';
    if (ms < 60000) return `${Math.floor(ms / 1000)} seconds`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)} minutes`;
    return `${Math.floor(ms / 3600000)} hours`;
  }),
}));

// Import after mocks
const fs = await import('fs');
const { sseManager } = await import('../../src/utils/sse.js');
const StatusController = (
  await import('../../src/controllers/statusController.js')
).default;

describe('StatusController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSystemStatus', () => {
    it('should return healthy status with running analyses', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockContainerState = {
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date('2025-01-14T10:00:00Z'),
      };

      sseManager.getContainerState.mockReturnValue(mockContainerState);

      // Mock Tago SDK version resolution
      const mockPackageJson = {
        name: '@tago-io/sdk',
        version: '12.4.0',
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

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
      const req = createMockRequest();
      const res = createMockResponse();

      const mockContainerState = {
        status: 'initializing',
        message: 'Container is starting up',
        startTime: new Date(),
      };

      sseManager.getContainerState.mockReturnValue(mockContainerState);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ name: '@tago-io/sdk', version: '12.4.0' }),
      );

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
      const req = createMockRequest();
      const res = createMockResponse();

      const mockContainerState = {
        status: 'error',
        message: 'Container error occurred',
        startTime: new Date(),
      };

      sseManager.getContainerState.mockReturnValue(mockContainerState);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ name: '@tago-io/sdk', version: '12.4.0' }),
      );

      await StatusController.getSystemStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle unknown Tago SDK version gracefully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      fs.existsSync.mockReturnValue(false);

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
      const req = createMockRequest();
      const res = createMockResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ name: '@tago-io/sdk', version: '12.4.0' }),
      );

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
      const req = createMockRequest();
      const res = createMockResponse();

      sseManager.getContainerState.mockReturnValue({
        status: null,
        message: null,
        startTime: null,
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ name: '@tago-io/sdk', version: '12.4.0' }),
      );

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
      const req = createMockRequest();
      const res = createMockResponse();

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: twoHoursAgo,
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ name: '@tago-io/sdk', version: '12.4.0' }),
      );

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
      const req = createMockRequest();
      const res = createMockResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ name: '@tago-io/sdk', version: '12.4.0' }),
      );

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

    it('should handle package.json read errors gracefully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Failed to read file');
      });

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tagoConnection: expect.objectContaining({
            sdkVersion: 'unknown',
          }),
        }),
      );
    });

    it('should handle null analyses collection', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ name: '@tago-io/sdk', version: '12.4.0' }),
      );

      // Mock analysisService with null analyses
      vi.doMock('../../src/services/analysisService.js', () => ({
        analysisService: {
          analyses: null,
        },
      }));

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tagoConnection: expect.objectContaining({
            runningAnalyses: 0,
          }),
        }),
      );
    });

    it('should handle general errors', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      sseManager.getContainerState.mockImplementation(() => {
        throw new Error('SSE manager error');
      });

      await StatusController.getSystemStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should include server time in response', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      sseManager.getContainerState.mockReturnValue({
        status: 'ready',
        message: 'Container is ready',
        startTime: new Date(),
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ name: '@tago-io/sdk', version: '12.4.0' }),
      );

      await StatusController.getSystemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          serverTime: expect.any(String),
        }),
      );
    });
  });
});

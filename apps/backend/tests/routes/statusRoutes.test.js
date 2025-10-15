import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
vi.mock('../../src/middleware/betterAuthMiddleware.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
  requirePermission: () => (req, res, next) => next(),
}));

// Mock SSE manager
vi.mock('../../src/utils/sse.js', () => ({
  sseManager: {
    getContainerState: vi.fn(() => ({
      status: 'ready',
      startTime: new Date('2025-01-01T00:00:00Z'),
      message: 'Container is ready',
    })),
  },
}));

// Mock analysis service
vi.mock('../../src/services/analysisService.js', () => ({
  analysisService: {
    analyses: new Map([
      ['test-analysis-1', { status: 'running' }],
      ['test-analysis-2', { status: 'stopped' }],
    ]),
  },
}));

// Mock logging middleware
vi.mock('../../src/middleware/loggingMiddleware.js', () => ({
  attachRequestLogger: (req, res, next) => {
    req.log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    next();
  },
}));

describe('Status Routes', () => {
  let app;
  let statusRoutes;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());

    // Add logging middleware
    const { attachRequestLogger } = await import(
      '../../src/middleware/loggingMiddleware.js'
    );
    app.use(attachRequestLogger);

    // Import routes
    const routesModule = await import('../../src/routes/statusRoutes.js');
    statusRoutes = routesModule.default;

    // Mount routes
    app.use('/api/status', statusRoutes);
  });

  describe('GET /api/status', () => {
    it('should return system status', async () => {
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body).toEqual(
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
            sdkVersion: expect.any(String),
            runningAnalyses: 1, // test-analysis-1 is running
          }),
          serverTime: expect.any(String),
        }),
      );
    });

    it('should return 203 status when container is initializing', async () => {
      const { sseManager } = await import('../../src/utils/sse.js');
      sseManager.getContainerState.mockReturnValueOnce({
        status: 'initializing',
        startTime: new Date(),
        message: 'Container is initializing',
      });

      const response = await request(app).get('/api/status').expect(203);

      expect(response.body.container_health.status).toBe('initializing');
    });

    it('should count running analyses correctly', async () => {
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body.tagoConnection.runningAnalyses).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/api/status/nonexistent').expect(404);
    });
  });
});

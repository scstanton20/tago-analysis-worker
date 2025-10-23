/**
 * Status Routes Integration Tests
 *
 * - Uses REAL better-auth authentication (no mocks)
 * - Tests that status endpoint is accessible without auth (public endpoint)
 * - Tests multiple user roles can access status
 * - Verifies system health reporting
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  setupTestAuth,
  cleanupTestAuth,
  getSessionCookie,
} from '../utils/authHelpers.js';

// Mock SSE manager
vi.mock('../../src/utils/sse.js', () => ({
  sseManager: {
    getContainerState: vi.fn(() => ({
      status: 'ready',
      startTime: new Date('2025-01-01T00:00:00Z'),
      message: 'Container is ready',
    })),
    updateContainerState: vi.fn(),
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

// Logging middleware mock - provides req.log
const attachRequestLogger = (req, res, next) => {
  req.log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
  next();
};

vi.mock('../../src/middleware/loggingMiddleware.js', () => ({
  attachRequestLogger,
}));

describe('Status Routes - WITH REAL AUTH', () => {
  let app;
  let sseManager;

  beforeAll(async () => {
    // Setup test infrastructure (creates test org, teams, users)
    await setupTestAuth();
  });

  afterAll(async () => {
    // Cleanup all test data
    await cleanupTestAuth();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create fresh Express app with REAL middleware
    app = express();
    app.use(express.json());
    app.use(attachRequestLogger); // Use mocked logging middleware

    // Import SSE manager
    const sseModule = await import('../../src/utils/sse.js');
    sseManager = sseModule.sseManager;

    // Import routes - NO AUTH (public endpoint)
    const { default: statusRoutes } = await import(
      '../../src/routes/statusRoutes.js'
    );
    app.use('/api/status', statusRoutes);
  });

  describe('GET /api/status - Public Endpoint', () => {
    it('should return system status without authentication', async () => {
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

    it('should allow admin to access status', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/status')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body.container_health).toBeDefined();
      expect(response.body.tagoConnection).toBeDefined();
    });

    it('should allow team owner to access status', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      const response = await request(app)
        .get('/api/status')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(response.body.container_health).toBeDefined();
    });

    it('should allow team viewer to access status', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      const response = await request(app)
        .get('/api/status')
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(response.body.tagoConnection).toBeDefined();
    });

    it('should allow unauthenticated users to check health', async () => {
      // No cookie - unauthenticated request
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body).toHaveProperty('container_health');
      expect(response.body).toHaveProperty('tagoConnection');
      expect(response.body).toHaveProperty('serverTime');
    });
  });

  describe('Container Health Status', () => {
    it('should return 200 status when container is ready', async () => {
      sseManager.getContainerState.mockReturnValueOnce({
        status: 'ready',
        startTime: new Date('2025-01-01T00:00:00Z'),
        message: 'Container is ready',
      });

      const response = await request(app).get('/api/status').expect(200);

      expect(response.body.container_health.status).toBe('healthy');
      expect(response.body.container_health.message).toBe('Container is ready');
    });

    it('should return 203 status when container is initializing', async () => {
      sseManager.getContainerState.mockReturnValueOnce({
        status: 'initializing',
        startTime: new Date(),
        message: 'Container is initializing',
      });

      const response = await request(app).get('/api/status').expect(203);

      expect(response.body.container_health.status).toBe('initializing');
      expect(response.body.container_health.message).toBe(
        'Container is initializing',
      );
    });

    it('should calculate uptime correctly', async () => {
      const startTime = new Date(Date.now() - 3600000); // 1 hour ago
      sseManager.getContainerState.mockReturnValueOnce({
        status: 'ready',
        startTime,
        message: 'Container is ready',
      });

      const response = await request(app).get('/api/status').expect(200);

      expect(response.body.container_health.uptime.seconds).toBeGreaterThan(
        3500,
      );
      expect(response.body.container_health.uptime.seconds).toBeLessThan(3700);
      expect(response.body.container_health.uptime.formatted).toContain('hour');
    });
  });

  describe('Tago Connection Status', () => {
    it('should count running analyses correctly', async () => {
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body.tagoConnection.runningAnalyses).toBe(1);
    });

    it('should include SDK version', async () => {
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body.tagoConnection.sdkVersion).toBeDefined();
      expect(typeof response.body.tagoConnection.sdkVersion).toBe('string');
    });

    it('should return server time', async () => {
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body.serverTime).toBeDefined();
      expect(typeof response.body.serverTime).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/api/status/nonexistent').expect(404);
    });

    it('should handle 404 for unknown routes with auth', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/status/nonexistent')
        .set('Cookie', adminCookie)
        .expect(404);
    });
  });

  describe('HTTP Methods', () => {
    it('should only support GET method', async () => {
      await request(app).get('/api/status').expect(200);
      await request(app).post('/api/status').expect(404);
      await request(app).put('/api/status').expect(404);
      await request(app).delete('/api/status').expect(404);
    });
  });

  describe('Multiple User Roles - Comprehensive Coverage', () => {
    it('should verify all users can access status', async () => {
      const userRoles = [
        'admin',
        'teamOwner',
        'teamEditor',
        'teamViewer',
        'teamRunner',
        'noAccess',
        'multiTeamUser',
      ];

      for (const role of userRoles) {
        const cookie = await getSessionCookie(role);

        const response = await request(app)
          .get('/api/status')
          .set('Cookie', cookie)
          .expect(200);

        expect(response.body.container_health).toBeDefined();
        expect(response.body.tagoConnection).toBeDefined();
      }
    });
  });

  describe('Response Format', () => {
    it('should return consistent response structure', async () => {
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body).toHaveProperty('container_health');
      expect(response.body).toHaveProperty('tagoConnection');
      expect(response.body).toHaveProperty('serverTime');

      expect(response.body.container_health).toHaveProperty('status');
      expect(response.body.container_health).toHaveProperty('message');
      expect(response.body.container_health).toHaveProperty('uptime');

      expect(response.body.tagoConnection).toHaveProperty('sdkVersion');
      expect(response.body.tagoConnection).toHaveProperty('runningAnalyses');
    });
  });
});

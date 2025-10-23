/**
 * Metrics Routes Integration Tests
 *
 * - Uses REAL better-auth authentication (no mocks)
 * - Tests multiple user roles can access metrics
 * - Includes negative test cases (401)
 * - Metrics accessible to all authenticated users
 * - Uses real database sessions
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

// Mock only external dependencies - NO AUTH MOCKS!
vi.mock('../../src/utils/metrics-enhanced.js', () => ({
  register: {
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: vi
      .fn()
      .mockResolvedValue(
        '# HELP metric_name Metric description\n# TYPE metric_name counter\nmetric_name 42\n',
      ),
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

describe('Metrics Routes - WITH REAL AUTH', () => {
  let app;
  let register;

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

    // Import metrics register for verification
    const metricsModule = await import('../../src/utils/metrics-enhanced.js');
    register = metricsModule.register;

    // Import routes with REAL auth middleware
    const { default: metricsRoutes } = await import(
      '../../src/routes/metricsRoutes.js'
    );
    app.use('/api/metrics', metricsRoutes);
  });

  describe('Authentication Requirements', () => {
    it('should reject unauthenticated requests to metrics', async () => {
      await request(app).get('/api/metrics/metrics').expect(401);

      expect(register.metrics).not.toHaveBeenCalled();
    });

    it('should allow authenticated users to access metrics', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(register.metrics).toHaveBeenCalled();
    });
  });

  describe('GET /api/metrics/metrics - All Authenticated Users', () => {
    it('should allow admin to access Prometheus metrics', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(register.metrics).toHaveBeenCalled();
    });

    it('should allow team owner to access metrics', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      const response = await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(register.metrics).toHaveBeenCalled();
    });

    it('should allow team editor to access metrics', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', editorCookie)
        .expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });

    it('should allow team viewer to access metrics', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });

    it('should allow team runner to access metrics', async () => {
      const runnerCookie = await getSessionCookie('teamRunner');

      await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', runnerCookie)
        .expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });

    it('should allow user with no team access to view metrics', async () => {
      const noAccessCookie = await getSessionCookie('noAccess');

      await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', noAccessCookie)
        .expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });

    it('should allow multi-team user to access metrics', async () => {
      const multiTeamCookie = await getSessionCookie('multiTeamUser');

      await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', multiTeamCookie)
        .expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });

    it('should set correct content type for Prometheus', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      const response = await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(response.headers['content-type']).toBe(
        'text/plain; version=0.0.4; charset=utf-8',
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/metrics/nonexistent')
        .set('Cookie', adminCookie)
        .expect(404);
    });

    it('should handle metrics collection errors', async () => {
      const adminCookie = await getSessionCookie('admin');
      register.metrics.mockRejectedValueOnce(
        new Error('Metrics collection failed'),
      );

      const response = await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', adminCookie)
        .expect(500);

      expect(response.text).toBe('Metrics collection failed');
    });

    it('should handle async errors gracefully', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');
      register.metrics.mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      const response = await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', viewerCookie)
        .expect(500);

      expect(response.text).toBe('Database connection failed');
    });
  });

  describe('HTTP Methods', () => {
    it('should only expose GET method for metrics', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app)
        .post('/api/metrics/metrics')
        .set('Cookie', adminCookie)
        .expect(404);

      await request(app)
        .put('/api/metrics/metrics')
        .set('Cookie', adminCookie)
        .expect(404);

      await request(app)
        .delete('/api/metrics/metrics')
        .set('Cookie', adminCookie)
        .expect(404);
    });
  });

  describe('Metrics Format', () => {
    it('should return valid Prometheus text format', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });

    it('should call metrics for all authenticated users', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .get('/api/metrics/metrics')
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests from different users', async () => {
      const adminCookie = await getSessionCookie('admin');
      const viewerCookie = await getSessionCookie('teamViewer');
      const editorCookie = await getSessionCookie('teamEditor');

      const requests = [
        request(app).get('/api/metrics/metrics').set('Cookie', adminCookie),
        request(app).get('/api/metrics/metrics').set('Cookie', viewerCookie),
        request(app).get('/api/metrics/metrics').set('Cookie', editorCookie),
      ];

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
      expect(register.metrics).toHaveBeenCalledTimes(3);
    });

    it('should deny concurrent unauthenticated requests', async () => {
      const requests = Array(3)
        .fill(null)
        .map(() => request(app).get('/api/metrics/metrics'));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(401);
      });
      expect(register.metrics).not.toHaveBeenCalled();
    });
  });

  describe('Multiple User Roles - Comprehensive Coverage', () => {
    it('should verify all authenticated users can access metrics', async () => {
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
        vi.clearAllMocks();
        const cookie = await getSessionCookie(role);

        await request(app)
          .get('/api/metrics/metrics')
          .set('Cookie', cookie)
          .expect(200);

        expect(register.metrics).toHaveBeenCalled();
      }
    });
  });
});

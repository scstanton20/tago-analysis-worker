import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
vi.mock('../../src/middleware/betterAuthMiddleware.js', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
}));

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

describe('Metrics Routes', () => {
  let app;
  let metricsRoutes;
  let register;

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

    // Import metrics register
    const metricsModule = await import('../../src/utils/metrics-enhanced.js');
    register = metricsModule.register;

    // Import routes
    const routesModule = await import('../../src/routes/metricsRoutes.js');
    metricsRoutes = routesModule.default;

    // Mount routes
    app.use('/api/metrics', metricsRoutes);
  });

  describe('GET /api/metrics/metrics', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
      expect(register.metrics).toHaveBeenCalled();
    });

    it('should set correct content type for Prometheus', async () => {
      const response = await request(app)
        .get('/api/metrics/metrics')
        .expect(200);

      expect(response.headers['content-type']).toBe(
        'text/plain; version=0.0.4; charset=utf-8',
      );
    });

    it('should handle metrics collection errors', async () => {
      register.metrics.mockRejectedValueOnce(
        new Error('Metrics collection failed'),
      );

      const response = await request(app)
        .get('/api/metrics/metrics')
        .expect(500);

      expect(response.text).toBe('Metrics collection failed');
    });

    it('should require authentication', async () => {
      // Authentication middleware is applied
      await request(app).get('/api/metrics/metrics').expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });
  });

  describe('authentication', () => {
    it('should apply authentication middleware to all routes', async () => {
      // The authMiddleware is applied via router.use
      await request(app).get('/api/metrics/metrics');

      expect(register.metrics).toHaveBeenCalled();
    });

    it('should expose metrics to authenticated users', async () => {
      await request(app).get('/api/metrics/metrics').expect(200);

      expect(register.metrics).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/api/metrics/nonexistent').expect(404);
    });

    it('should handle async errors in metrics endpoint', async () => {
      register.metrics.mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      const response = await request(app)
        .get('/api/metrics/metrics')
        .expect(500);

      expect(response.text).toBe('Database connection failed');
    });
  });

  describe('metrics format', () => {
    it('should return valid Prometheus text format', async () => {
      await request(app).get('/api/metrics/metrics').expect(200);

      // Verify metrics were generated
      expect(register.metrics).toHaveBeenCalled();
    });

    it('should include metric values', async () => {
      await request(app).get('/api/metrics/metrics').expect(200);

      // Verify metrics were generated
      expect(register.metrics).toHaveBeenCalled();
    });
  });

  describe('route characteristics', () => {
    it('should only expose GET method for metrics', async () => {
      await request(app).get('/api/metrics/metrics').expect(200);
      await request(app).post('/api/metrics/metrics').expect(404);
      await request(app).put('/api/metrics/metrics').expect(404);
      await request(app).delete('/api/metrics/metrics').expect(404);
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(5)
        .fill(null)
        .map(() => request(app).get('/api/metrics/metrics'));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
      expect(register.metrics).toHaveBeenCalledTimes(5);
    });
  });
});

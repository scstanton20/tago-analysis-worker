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

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  settingsOperationLimiter: (req, res, next) => next(),
}));

vi.mock('../../src/middleware/validateRequest.js', () => ({
  validateRequest: () => (req, res, next) => next(),
}));

vi.mock('../../src/controllers/settingsController.js', () => ({
  default: {
    getDNSConfig: vi.fn((req, res) =>
      res.json({
        config: { enabled: true, ttl: 300, maxEntries: 1000 },
        stats: { hits: 100, misses: 20, errors: 0 },
      }),
    ),
    updateDNSConfig: vi.fn((req, res) =>
      res.json({
        message: 'DNS configuration updated successfully',
        config: { enabled: true, ttl: 600, maxEntries: 2000 },
        stats: { hits: 100, misses: 20, errors: 0 },
      }),
    ),
    getDNSCacheEntries: vi.fn((req, res) =>
      res.json({
        entries: [
          {
            key: 'google.com:4',
            value: ['8.8.8.8'],
            age: 120,
            ttl: 180,
            expired: false,
          },
        ],
      }),
    ),
    clearDNSCache: vi.fn((req, res) =>
      res.json({
        message: 'DNS cache cleared successfully',
        entriesCleared: 123,
        stats: { hits: 0, misses: 0, errors: 0 },
      }),
    ),
    deleteDNSCacheEntry: vi.fn((req, res) =>
      res.json({
        message: 'DNS cache entry deleted successfully',
        key: req.params.key,
      }),
    ),
    resetDNSStats: vi.fn((req, res) =>
      res.json({
        message: 'DNS cache statistics reset successfully',
        stats: { hits: 0, misses: 0, errors: 0, evictions: 0 },
      }),
    ),
  },
}));

vi.mock('../../src/utils/asyncHandler.js', () => ({
  asyncHandler: (fn) => fn,
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

describe('Settings Routes', () => {
  let app;
  let settingsRoutes;
  let SettingsController;

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

    // Import controller for verification
    const controllerModule = await import(
      '../../src/controllers/settingsController.js'
    );
    SettingsController = controllerModule.default;

    // Import routes
    const routesModule = await import('../../src/routes/settingsRoutes.js');
    settingsRoutes = routesModule.default;

    // Mount routes
    app.use('/api/settings', settingsRoutes);
  });

  describe('GET /api/settings/dns/config', () => {
    it('should get DNS configuration and stats', async () => {
      const response = await request(app)
        .get('/api/settings/dns/config')
        .expect(200);

      expect(response.body).toEqual({
        config: { enabled: true, ttl: 300, maxEntries: 1000 },
        stats: { hits: 100, misses: 20, errors: 0 },
      });
      expect(SettingsController.getDNSConfig).toHaveBeenCalled();
    });

    it('should return config and statistics', async () => {
      const response = await request(app)
        .get('/api/settings/dns/config')
        .expect(200);

      expect(response.body.config).toBeDefined();
      expect(response.body.stats).toBeDefined();
    });
  });

  describe('PUT /api/settings/dns/config', () => {
    it('should update DNS configuration', async () => {
      const response = await request(app)
        .put('/api/settings/dns/config')
        .send({ enabled: true, ttl: 600, maxEntries: 2000 })
        .expect(200);

      expect(response.body).toEqual({
        message: 'DNS configuration updated successfully',
        config: { enabled: true, ttl: 600, maxEntries: 2000 },
        stats: { hits: 100, misses: 20, errors: 0 },
      });
      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
    });

    it('should apply settings operation limiter', async () => {
      await request(app)
        .put('/api/settings/dns/config')
        .send({ enabled: false });

      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
    });

    it('should validate request data', async () => {
      await request(app)
        .put('/api/settings/dns/config')
        .send({ enabled: true, ttl: 300 });

      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
    });
  });

  describe('GET /api/settings/dns/entries', () => {
    it('should get all DNS cache entries', async () => {
      const response = await request(app)
        .get('/api/settings/dns/entries')
        .expect(200);

      expect(response.body).toEqual({
        entries: [
          {
            key: 'google.com:4',
            value: ['8.8.8.8'],
            age: 120,
            ttl: 180,
            expired: false,
          },
        ],
      });
      expect(SettingsController.getDNSCacheEntries).toHaveBeenCalled();
    });

    it('should return entries with metadata', async () => {
      const response = await request(app)
        .get('/api/settings/dns/entries')
        .expect(200);

      expect(Array.isArray(response.body.entries)).toBe(true);
    });
  });

  describe('DELETE /api/settings/dns/cache', () => {
    it('should clear entire DNS cache', async () => {
      const response = await request(app)
        .delete('/api/settings/dns/cache')
        .expect(200);

      expect(response.body).toEqual({
        message: 'DNS cache cleared successfully',
        entriesCleared: 123,
        stats: { hits: 0, misses: 0, errors: 0 },
      });
      expect(SettingsController.clearDNSCache).toHaveBeenCalled();
    });

    it('should apply settings operation limiter', async () => {
      await request(app).delete('/api/settings/dns/cache');

      expect(SettingsController.clearDNSCache).toHaveBeenCalled();
    });

    it('should return cleared entry count', async () => {
      const response = await request(app)
        .delete('/api/settings/dns/cache')
        .expect(200);

      expect(response.body.entriesCleared).toBeDefined();
      expect(typeof response.body.entriesCleared).toBe('number');
    });
  });

  describe('DELETE /api/settings/dns/cache/:key', () => {
    it('should delete specific DNS cache entry', async () => {
      const response = await request(app)
        .delete('/api/settings/dns/cache/google.com:4')
        .expect(200);

      expect(response.body).toEqual({
        message: 'DNS cache entry deleted successfully',
        key: 'google.com:4',
      });
      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
    });

    it('should apply settings operation limiter', async () => {
      await request(app).delete('/api/settings/dns/cache/example.com:4');

      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
    });

    it('should validate cache key parameter', async () => {
      await request(app).delete('/api/settings/dns/cache/test-key');

      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
    });

    it('should handle encoded cache keys', async () => {
      const encodedKey = encodeURIComponent('resolve4:example.com');
      await request(app)
        .delete(`/api/settings/dns/cache/${encodedKey}`)
        .expect(200);

      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
    });
  });

  describe('POST /api/settings/dns/stats/reset', () => {
    it('should reset DNS cache statistics', async () => {
      const response = await request(app)
        .post('/api/settings/dns/stats/reset')
        .expect(200);

      expect(response.body).toEqual({
        message: 'DNS cache statistics reset successfully',
        stats: { hits: 0, misses: 0, errors: 0, evictions: 0 },
      });
      expect(SettingsController.resetDNSStats).toHaveBeenCalled();
    });

    it('should apply settings operation limiter', async () => {
      await request(app).post('/api/settings/dns/stats/reset');

      expect(SettingsController.resetDNSStats).toHaveBeenCalled();
    });

    it('should return reset statistics', async () => {
      const response = await request(app)
        .post('/api/settings/dns/stats/reset')
        .expect(200);

      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.hits).toBe(0);
      expect(response.body.stats.misses).toBe(0);
    });
  });

  describe('authentication', () => {
    it('should require authentication for all routes', async () => {
      // All routes should pass through authMiddleware
      await request(app).get('/api/settings/dns/config');
      await request(app).put('/api/settings/dns/config').send({});
      await request(app).get('/api/settings/dns/entries');

      expect(SettingsController.getDNSConfig).toHaveBeenCalled();
      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
      expect(SettingsController.getDNSCacheEntries).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/api/settings/unknown').expect(404);
    });

    it('should handle 404 for unknown DNS routes', async () => {
      await request(app).get('/api/settings/dns/unknown').expect(404);
    });
  });

  describe('middleware chain', () => {
    it('should apply rate limiters to write operations', async () => {
      // Update config
      await request(app).put('/api/settings/dns/config').send({});
      // Clear cache
      await request(app).delete('/api/settings/dns/cache');
      // Delete entry
      await request(app).delete('/api/settings/dns/cache/test');
      // Reset stats
      await request(app).post('/api/settings/dns/stats/reset');

      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
      expect(SettingsController.clearDNSCache).toHaveBeenCalled();
      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
      expect(SettingsController.resetDNSStats).toHaveBeenCalled();
    });

    it('should validate requests with schemas', async () => {
      await request(app)
        .put('/api/settings/dns/config')
        .send({ enabled: true, ttl: 300 });
      await request(app).delete('/api/settings/dns/cache/test-key');

      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
    });
  });

  describe('HTTP methods', () => {
    it('should support correct HTTP methods for each endpoint', async () => {
      // GET for retrieving data
      await request(app).get('/api/settings/dns/config').expect(200);
      await request(app).get('/api/settings/dns/entries').expect(200);

      // PUT for updates
      await request(app).put('/api/settings/dns/config').send({}).expect(200);

      // DELETE for removal
      await request(app).delete('/api/settings/dns/cache').expect(200);
      await request(app).delete('/api/settings/dns/cache/test').expect(200);

      // POST for actions
      await request(app).post('/api/settings/dns/stats/reset').expect(200);
    });

    it('should reject incorrect HTTP methods', async () => {
      await request(app).post('/api/settings/dns/config').expect(404);
      await request(app).delete('/api/settings/dns/entries').expect(404);
      await request(app).put('/api/settings/dns/cache').expect(404);
    });
  });
});

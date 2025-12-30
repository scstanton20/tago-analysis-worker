/**
 * Settings Routes Integration Tests
 *
 * - Uses REAL better-auth authentication (no mocks)
 * - Tests multiple user roles and permissions
 * - Includes negative test cases (401, 403)
 * - Tests admin-only access control
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
  type Mock,
} from 'vitest';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import request from 'supertest';
import {
  setupTestAuth,
  cleanupTestAuth,
  getSessionCookie,
} from '../utils/authHelpers.ts';

type SettingsControllerType = {
  getDNSConfig: Mock;
  updateDNSConfig: Mock;
  getDNSCacheEntries: Mock;
  clearDNSCache: Mock;
  deleteDNSCacheEntry: Mock;
  resetDNSStats: Mock;
  getAllAnalysisDNSStats: Mock;
  getAnalysisDNSStats: Mock;
  getAnalysisDNSCacheEntries: Mock;
};

// Mock only external dependencies - NO AUTH MOCKS!
vi.mock('../../src/middleware/rateLimiter.ts', () => ({
  settingsOperationLimiter: (
    _req: Request,
    _res: Response,
    next: NextFunction,
  ) => next(),
}));

vi.mock('../../src/middleware/validateRequest.ts', () => ({
  validateRequest: () => (_req: Request, _res: Response, next: NextFunction) =>
    next(),
}));

vi.mock('../../src/controllers/settingsController.ts', () => ({
  SettingsController: {
    getDNSConfig: vi.fn((_req: Request, res: Response) =>
      res.json({
        config: { enabled: true, ttl: 300, maxEntries: 1000 },
        stats: { hits: 100, misses: 20, errors: 0 },
      }),
    ),
    updateDNSConfig: vi.fn((_req: Request, res: Response) =>
      res.json({
        message: 'DNS configuration updated successfully',
        config: { enabled: true, ttl: 600, maxEntries: 2000 },
        stats: { hits: 100, misses: 20, errors: 0 },
      }),
    ),
    getDNSCacheEntries: vi.fn((_req: Request, res: Response) =>
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
    clearDNSCache: vi.fn((_req: Request, res: Response) =>
      res.json({
        message: 'DNS cache cleared successfully',
        entriesCleared: 123,
        stats: { hits: 0, misses: 0, errors: 0 },
      }),
    ),
    deleteDNSCacheEntry: vi.fn((req: Request, res: Response) =>
      res.json({
        message: 'DNS cache entry deleted successfully',
        key: req.params.key,
      }),
    ),
    resetDNSStats: vi.fn((_req: Request, res: Response) =>
      res.json({
        message: 'DNS cache statistics reset successfully',
        stats: { hits: 0, misses: 0, errors: 0, evictions: 0 },
      }),
    ),
    getAllAnalysisDNSStats: vi.fn((_req: Request, res: Response) =>
      res.json({
        analysisStats: {
          'analysis-1': {
            hits: 50,
            misses: 10,
            errors: 0,
            hitRate: '83.3',
            hostnameCount: 5,
            hostnames: ['api.tago.io', 'google.com'],
          },
        },
      }),
    ),
    getAnalysisDNSStats: vi.fn((req: Request, res: Response) =>
      res.json({
        analysisId: req.params.analysisId,
        stats: {
          hits: 50,
          misses: 10,
          errors: 0,
          hitRate: '83.3',
          hostnameCount: 5,
          hostnames: ['api.tago.io'],
        },
      }),
    ),
    getAnalysisDNSCacheEntries: vi.fn((req: Request, res: Response) =>
      res.json({
        analysisId: req.params.analysisId,
        entries: [
          {
            key: 'api.tago.io:4',
            value: ['1.2.3.4'],
            age: 60,
            ttl: 240,
            expired: false,
          },
        ],
        total: 1,
      }),
    ),
  },
}));

vi.mock('../../src/utils/asyncHandler.ts', () => ({
  asyncHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

type RequestWithLog = {
  log: {
    info: Mock;
    error: Mock;
    warn: Mock;
    debug: Mock;
    child: Mock;
  };
};

// Logging middleware mock - provides req.log
const attachRequestLogger = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  (req as unknown as RequestWithLog).log = {
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

vi.mock('../../src/middleware/loggingMiddleware.ts', () => ({
  attachRequestLogger,
}));

describe('Settings Routes - WITH REAL AUTH', () => {
  let app: Express;
  let SettingsController: SettingsControllerType;

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

    // Import controller for verification (cast through unknown for mocked types)
    const controllerModule = await import(
      '../../src/controllers/settingsController.ts'
    );
    SettingsController =
      controllerModule.SettingsController as unknown as SettingsControllerType;

    // Import routes with REAL auth middleware
    const { settingsRouter } = await import(
      '../../src/routes/settingsRoutes.ts'
    );
    app.use('/api/settings', settingsRouter);
  });

  describe('Authentication Requirements', () => {
    it('should reject unauthenticated requests to DNS config', async () => {
      await request(app).get('/api/settings/dns/config').expect(401);

      expect(SettingsController.getDNSConfig).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests to update DNS config', async () => {
      await request(app)
        .put('/api/settings/dns/config')
        .send({ enabled: true, ttl: 600 })
        .expect(401);

      expect(SettingsController.updateDNSConfig).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests to DNS entries', async () => {
      await request(app).get('/api/settings/dns/entries').expect(401);

      expect(SettingsController.getDNSCacheEntries).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests to clear cache', async () => {
      await request(app).delete('/api/settings/dns/cache').expect(401);

      expect(SettingsController.clearDNSCache).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests to delete cache entry', async () => {
      await request(app).delete('/api/settings/dns/cache/test-key').expect(401);

      expect(SettingsController.deleteDNSCacheEntry).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests to reset stats', async () => {
      await request(app).post('/api/settings/dns/stats/reset').expect(401);

      expect(SettingsController.resetDNSStats).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/settings/dns/config - Admin Only', () => {
    it('should allow admin to get DNS configuration', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body).toEqual({
        config: { enabled: true, ttl: 300, maxEntries: 1000 },
        stats: { hits: 100, misses: 20, errors: 0 },
      });
      expect(SettingsController.getDNSConfig).toHaveBeenCalled();
    });

    it('should deny team owner from accessing DNS config', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', ownerCookie)
        .expect(403);

      expect(SettingsController.getDNSConfig).not.toHaveBeenCalled();
    });

    it('should deny team editor from accessing DNS config', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', editorCookie)
        .expect(403);

      expect(SettingsController.getDNSConfig).not.toHaveBeenCalled();
    });

    it('should deny team viewer from accessing DNS config', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', viewerCookie)
        .expect(403);

      expect(SettingsController.getDNSConfig).not.toHaveBeenCalled();
    });

    it('should deny team runner from accessing DNS config', async () => {
      const runnerCookie = await getSessionCookie('teamRunner');

      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', runnerCookie)
        .expect(403);

      expect(SettingsController.getDNSConfig).not.toHaveBeenCalled();
    });

    it('should deny user with no access from accessing DNS config', async () => {
      const noAccessCookie = await getSessionCookie('noAccess');

      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', noAccessCookie)
        .expect(403);

      expect(SettingsController.getDNSConfig).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/settings/dns/config - Admin Only', () => {
    it('should allow admin to update DNS configuration', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .put('/api/settings/dns/config')
        .set('Cookie', adminCookie)
        .send({ enabled: true, ttl: 600, maxEntries: 2000 })
        .expect(200);

      expect(response.body).toEqual({
        message: 'DNS configuration updated successfully',
        config: { enabled: true, ttl: 600, maxEntries: 2000 },
        stats: { hits: 100, misses: 20, errors: 0 },
      });
      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
    });

    it('should deny team owner from updating DNS config', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .put('/api/settings/dns/config')
        .set('Cookie', ownerCookie)
        .send({ enabled: false })
        .expect(403);

      expect(SettingsController.updateDNSConfig).not.toHaveBeenCalled();
    });

    it('should deny team editor from updating DNS config', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .put('/api/settings/dns/config')
        .set('Cookie', editorCookie)
        .send({ enabled: false })
        .expect(403);

      expect(SettingsController.updateDNSConfig).not.toHaveBeenCalled();
    });

    it('should deny team viewer from updating DNS config', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .put('/api/settings/dns/config')
        .set('Cookie', viewerCookie)
        .send({ enabled: false })
        .expect(403);

      expect(SettingsController.updateDNSConfig).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/settings/dns/entries - Admin Only', () => {
    it('should allow admin to get DNS cache entries', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/settings/dns/entries')
        .set('Cookie', adminCookie)
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

    it('should deny team owner from viewing DNS entries', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .get('/api/settings/dns/entries')
        .set('Cookie', ownerCookie)
        .expect(403);

      expect(SettingsController.getDNSCacheEntries).not.toHaveBeenCalled();
    });

    it('should deny team viewer from viewing DNS entries', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .get('/api/settings/dns/entries')
        .set('Cookie', viewerCookie)
        .expect(403);

      expect(SettingsController.getDNSCacheEntries).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/settings/dns/cache - Admin Only', () => {
    it('should allow admin to clear entire DNS cache', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .delete('/api/settings/dns/cache')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body).toEqual({
        message: 'DNS cache cleared successfully',
        entriesCleared: 123,
        stats: { hits: 0, misses: 0, errors: 0 },
      });
      expect(SettingsController.clearDNSCache).toHaveBeenCalled();
    });

    it('should deny team owner from clearing DNS cache', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .delete('/api/settings/dns/cache')
        .set('Cookie', ownerCookie)
        .expect(403);

      expect(SettingsController.clearDNSCache).not.toHaveBeenCalled();
    });

    it('should deny team editor from clearing DNS cache', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .delete('/api/settings/dns/cache')
        .set('Cookie', editorCookie)
        .expect(403);

      expect(SettingsController.clearDNSCache).not.toHaveBeenCalled();
    });

    it('should deny team viewer from clearing DNS cache', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .delete('/api/settings/dns/cache')
        .set('Cookie', viewerCookie)
        .expect(403);

      expect(SettingsController.clearDNSCache).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/settings/dns/cache/:key - Admin Only', () => {
    it('should allow admin to delete specific DNS cache entry', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .delete('/api/settings/dns/cache/google.com:4')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body).toEqual({
        message: 'DNS cache entry deleted successfully',
        key: 'google.com:4',
      });
      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
    });

    it('should deny team owner from deleting cache entry', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .delete('/api/settings/dns/cache/test-key')
        .set('Cookie', ownerCookie)
        .expect(403);

      expect(SettingsController.deleteDNSCacheEntry).not.toHaveBeenCalled();
    });

    it('should deny team editor from deleting cache entry', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .delete('/api/settings/dns/cache/test-key')
        .set('Cookie', editorCookie)
        .expect(403);

      expect(SettingsController.deleteDNSCacheEntry).not.toHaveBeenCalled();
    });

    it('should handle encoded cache keys for admin', async () => {
      const adminCookie = await getSessionCookie('admin');
      const encodedKey = encodeURIComponent('resolve4:example.com');

      await request(app)
        .delete(`/api/settings/dns/cache/${encodedKey}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
    });
  });

  describe('POST /api/settings/dns/stats/reset - Admin Only', () => {
    it('should allow admin to reset DNS cache statistics', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .post('/api/settings/dns/stats/reset')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body).toEqual({
        message: 'DNS cache statistics reset successfully',
        stats: { hits: 0, misses: 0, errors: 0, evictions: 0 },
      });
      expect(SettingsController.resetDNSStats).toHaveBeenCalled();
    });

    it('should deny team owner from resetting stats', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .post('/api/settings/dns/stats/reset')
        .set('Cookie', ownerCookie)
        .expect(403);

      expect(SettingsController.resetDNSStats).not.toHaveBeenCalled();
    });

    it('should deny team editor from resetting stats', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .post('/api/settings/dns/stats/reset')
        .set('Cookie', editorCookie)
        .expect(403);

      expect(SettingsController.resetDNSStats).not.toHaveBeenCalled();
    });

    it('should deny team viewer from resetting stats', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .post('/api/settings/dns/stats/reset')
        .set('Cookie', viewerCookie)
        .expect(403);

      expect(SettingsController.resetDNSStats).not.toHaveBeenCalled();
    });
  });

  describe('Admin-Only Routes - Comprehensive Coverage', () => {
    it('should verify all settings routes reject multi-team user', async () => {
      const multiTeamCookie = await getSessionCookie('multiTeamUser');

      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', multiTeamCookie)
        .expect(403);

      await request(app)
        .put('/api/settings/dns/config')
        .set('Cookie', multiTeamCookie)
        .send({ enabled: false })
        .expect(403);

      await request(app)
        .get('/api/settings/dns/entries')
        .set('Cookie', multiTeamCookie)
        .expect(403);

      await request(app)
        .delete('/api/settings/dns/cache')
        .set('Cookie', multiTeamCookie)
        .expect(403);

      await request(app)
        .delete('/api/settings/dns/cache/test')
        .set('Cookie', multiTeamCookie)
        .expect(403);

      await request(app)
        .post('/api/settings/dns/stats/reset')
        .set('Cookie', multiTeamCookie)
        .expect(403);

      // Verify NO controllers were called
      expect(SettingsController.getDNSConfig).not.toHaveBeenCalled();
      expect(SettingsController.updateDNSConfig).not.toHaveBeenCalled();
      expect(SettingsController.getDNSCacheEntries).not.toHaveBeenCalled();
      expect(SettingsController.clearDNSCache).not.toHaveBeenCalled();
      expect(SettingsController.deleteDNSCacheEntry).not.toHaveBeenCalled();
      expect(SettingsController.resetDNSStats).not.toHaveBeenCalled();
    });

    it('should verify all settings routes accept admin', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app)
        .put('/api/settings/dns/config')
        .set('Cookie', adminCookie)
        .send({ enabled: true })
        .expect(200);

      await request(app)
        .get('/api/settings/dns/entries')
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app)
        .delete('/api/settings/dns/cache')
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app)
        .delete('/api/settings/dns/cache/test')
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app)
        .post('/api/settings/dns/stats/reset')
        .set('Cookie', adminCookie)
        .expect(200);

      // Verify all controllers were called
      expect(SettingsController.getDNSConfig).toHaveBeenCalled();
      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
      expect(SettingsController.getDNSCacheEntries).toHaveBeenCalled();
      expect(SettingsController.clearDNSCache).toHaveBeenCalled();
      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
      expect(SettingsController.resetDNSStats).toHaveBeenCalled();
    });
  });

  describe('Query Parameter Validation - getDNSConfig', () => {
    it('should reject getDNSConfig with unexpected query parameters', async () => {
      // This test verifies the schema rejects unexpected query params
      // Even though validateRequest is mocked, we verify the schema exists
      const { settingsValidationSchemas } = await import(
        '../../src/validation/settingsSchemas.ts'
      );

      expect(settingsValidationSchemas.getDNSConfig).toBeDefined();
      expect(settingsValidationSchemas.getDNSConfig.query).toBeDefined();

      // Test that the schema validates correctly (empty query)
      const emptyResult =
        settingsValidationSchemas.getDNSConfig.query.safeParse({});
      expect(emptyResult.success).toBe(true);

      // Test that the schema rejects unexpected params (strict mode)
      const invalidResult =
        settingsValidationSchemas.getDNSConfig.query.safeParse({
          unexpected: 'param',
        });
      expect(invalidResult.success).toBe(false);
    });

    it('should allow getDNSConfig without query parameters', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(SettingsController.getDNSConfig).toHaveBeenCalled();
    });
  });

  describe('Query Parameter Validation - getDNSCacheEntries', () => {
    it('should validate pagination parameters for getDNSCacheEntries', async () => {
      const { settingsValidationSchemas } = await import(
        '../../src/validation/settingsSchemas.ts'
      );

      expect(settingsValidationSchemas.getDNSCacheEntries).toBeDefined();
      expect(settingsValidationSchemas.getDNSCacheEntries.query).toBeDefined();

      // Valid page and limit
      const validResult =
        settingsValidationSchemas.getDNSCacheEntries.query.safeParse({
          page: '1',
          limit: '50',
        });
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data.page).toBe(1);
        expect(validResult.data.limit).toBe(50);
      }

      // Invalid page (not a number)
      const invalidPageResult =
        settingsValidationSchemas.getDNSCacheEntries.query.safeParse({
          page: 'invalid',
        });
      expect(invalidPageResult.success).toBe(false);

      // Invalid limit (exceeds max)
      const invalidLimitResult =
        settingsValidationSchemas.getDNSCacheEntries.query.safeParse({
          limit: '5000',
        });
      expect(invalidLimitResult.success).toBe(false);

      // Valid filter parameter
      const filterResult =
        settingsValidationSchemas.getDNSCacheEntries.query.safeParse({
          filter: 'example.com',
        });
      expect(filterResult.success).toBe(true);

      // Empty query (all optional)
      const emptyResult =
        settingsValidationSchemas.getDNSCacheEntries.query.safeParse({});
      expect(emptyResult.success).toBe(true);
    });

    it('should allow getDNSCacheEntries without query parameters', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/settings/dns/entries')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(SettingsController.getDNSCacheEntries).toHaveBeenCalled();
    });

    it('should allow getDNSCacheEntries with pagination parameters', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/settings/dns/entries?page=1&limit=50')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(SettingsController.getDNSCacheEntries).toHaveBeenCalled();
    });

    it('should allow getDNSCacheEntries with filter parameter', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/settings/dns/entries?filter=example.com')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(SettingsController.getDNSCacheEntries).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/settings/unknown')
        .set('Cookie', adminCookie)
        .expect(404);
    });

    it('should handle 404 for unknown DNS routes', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/settings/dns/unknown')
        .set('Cookie', adminCookie)
        .expect(404);
    });

    it('should handle 404 for invalid HTTP methods', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .post('/api/settings/dns/config')
        .set('Cookie', adminCookie)
        .expect(404);

      await request(app)
        .delete('/api/settings/dns/entries')
        .set('Cookie', adminCookie)
        .expect(404);

      await request(app)
        .put('/api/settings/dns/cache')
        .set('Cookie', adminCookie)
        .expect(404);
    });
  });

  describe('Admin Settings Management Workflows', () => {
    it('should support complete DNS configuration workflow', async () => {
      const adminCookie = await getSessionCookie('admin');

      // Get current config
      await request(app)
        .get('/api/settings/dns/config')
        .set('Cookie', adminCookie)
        .expect(200);

      // Update config
      await request(app)
        .put('/api/settings/dns/config')
        .set('Cookie', adminCookie)
        .send({ enabled: true, ttl: 600 })
        .expect(200);

      // View entries
      await request(app)
        .get('/api/settings/dns/entries')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(SettingsController.getDNSConfig).toHaveBeenCalled();
      expect(SettingsController.updateDNSConfig).toHaveBeenCalled();
      expect(SettingsController.getDNSCacheEntries).toHaveBeenCalled();
    });

    it('should support DNS cache maintenance workflow', async () => {
      const adminCookie = await getSessionCookie('admin');

      // Delete specific entry
      await request(app)
        .delete('/api/settings/dns/cache/test-key')
        .set('Cookie', adminCookie)
        .expect(200);

      // Clear entire cache
      await request(app)
        .delete('/api/settings/dns/cache')
        .set('Cookie', adminCookie)
        .expect(200);

      // Reset statistics
      await request(app)
        .post('/api/settings/dns/stats/reset')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(SettingsController.deleteDNSCacheEntry).toHaveBeenCalled();
      expect(SettingsController.clearDNSCache).toHaveBeenCalled();
      expect(SettingsController.resetDNSStats).toHaveBeenCalled();
    });
  });
});

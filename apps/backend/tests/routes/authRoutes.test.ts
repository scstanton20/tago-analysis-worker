/**
 * Auth Routes Integration Tests
 *
 * - Tests that authRoutes is documentation-only
 * - Verifies Better-Auth handles actual authentication endpoints
 * - Confirms no route handlers are defined (all handled by Better-Auth middleware)
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
import express, { type Express, type Router } from 'express';
import request from 'supertest';
import { setupTestAuth, cleanupTestAuth } from '../utils/authHelpers.ts';

interface RouterLayer {
  route?: {
    path: string;
  };
}

describe('Auth Routes - Documentation Only', () => {
  let app: Express;
  let authRoutes: Router;

  beforeAll(async () => {
    // Setup test infrastructure for consistency
    await setupTestAuth();
  });

  afterAll(async () => {
    // Cleanup all test data
    await cleanupTestAuth();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());

    // Import routes (documentation-only)
    const { authRouter } = await import('../../src/routes/authRoutes.ts');
    authRoutes = authRouter;

    // Mount routes
    app.use('/api/auth', authRoutes);
  });

  describe('Route Definition', () => {
    it('should export a valid Express router', () => {
      expect(authRoutes).toBeDefined();
      expect(typeof authRoutes).toBe('function');
    });

    it('should be mountable as middleware', () => {
      expect(() => {
        const testApp = express();
        testApp.use('/test', authRoutes);
      }).not.toThrow();
    });

    it('should maintain router structure for documentation', () => {
      // Even though no routes are defined, it should be a valid router
      expect(authRoutes.stack).toBeDefined();
      expect(Array.isArray(authRoutes.stack)).toBe(true);
    });
  });

  describe('Documentation-Only Routes', () => {
    it('should not define actual route handlers (Better-Auth handles them)', async () => {
      // This file only contains Swagger documentation
      // Better-Auth middleware handles actual auth endpoints
      // Testing for 404 confirms no routes are defined here
      await request(app).get('/api/auth/get-session').expect(404);
    });

    it('should have no active route handlers', () => {
      // Since this is documentation-only, verify no routes are registered
      const routeCount =
        (authRoutes.stack as RouterLayer[])?.filter((layer) => layer.route)
          .length || 0;
      expect(routeCount).toBe(0);
    });

    it('should serve as documentation reference', () => {
      // The router exists for documentation purposes
      expect(authRoutes).toBeDefined();
      expect(authRoutes.stack).toBeDefined();
    });

    it('should not handle POST requests either', async () => {
      await request(app)
        .post('/api/auth/sign-in')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(404);
    });

    it('should not handle any HTTP methods', async () => {
      await request(app).get('/api/auth/sign-out').expect(404);
      await request(app).post('/api/auth/sign-up').send({}).expect(404);
      await request(app).put('/api/auth/session').send({}).expect(404);
      await request(app).delete('/api/auth/session').expect(404);
    });
  });

  describe('Better-Auth Integration', () => {
    it('should rely on Better-Auth middleware for authentication', () => {
      // This test verifies the documentation-only nature
      // Actual authentication is handled by Better-Auth middleware in server setup
      expect(authRoutes).toBeDefined();
    });

    it('should not interfere with Better-Auth endpoints', () => {
      // It's OK to have some middleware layers (like for documentation)
      // but there should be no route handlers
      const hasRouteHandlers =
        (authRoutes.stack as RouterLayer[])?.some((layer) => layer.route) ||
        false;

      expect(hasRouteHandlers).toBe(false);
    });

    it('should be a transparent pass-through router', () => {
      // The router should not modify requests or responses
      // It exists only for Swagger documentation
      expect(authRoutes.stack.length).toBe(0);
    });
  });

  describe('Route Characteristics', () => {
    it('should have empty route stack', () => {
      // Documentation-only router should have no registered routes
      const routes =
        (authRoutes.stack as RouterLayer[])?.filter((layer) => layer.route) ||
        [];
      expect(routes.length).toBe(0);
    });

    it('should not define any path patterns', () => {
      const routePaths =
        (authRoutes.stack as RouterLayer[])
          ?.filter((layer) => layer.route)
          .map((layer) => layer.route!.path) || [];

      expect(routePaths.length).toBe(0);
    });

    it('should remain compatible with Express router API', () => {
      // Verify it implements the Router interface
      expect(typeof authRoutes.use).toBe('function');
      expect(typeof authRoutes.get).toBe('function');
      expect(typeof authRoutes.post).toBe('function');
      expect(typeof authRoutes).toBe('function');
    });
  });

  describe('Integration with Better-Auth Middleware', () => {
    it('should allow Better-Auth to handle all authentication endpoints', () => {
      // This router doesn't interfere - Better-Auth middleware
      // mounted in server.ts handles all /api/auth/* endpoints
      expect(authRoutes).toBeDefined();

      // No routes defined means Better-Auth can handle everything
      const definedRoutes =
        (authRoutes.stack as RouterLayer[])?.filter((layer) => layer.route) ||
        [];
      expect(definedRoutes.length).toBe(0);
    });
  });
});

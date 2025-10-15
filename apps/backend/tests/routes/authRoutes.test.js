import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('Auth Routes', () => {
  let app;
  let authRoutes;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());

    // Import routes
    const routesModule = await import('../../src/routes/authRoutes.js');
    authRoutes = routesModule.default;

    // Mount routes
    app.use('/api/auth', authRoutes);
  });

  describe('route definition', () => {
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
  });

  describe('documentation-only routes', () => {
    it('should not define actual route handlers (Better-Auth handles them)', async () => {
      // This file only contains Swagger documentation
      // Better-Auth middleware handles actual auth endpoints
      // Testing for 404 confirms no routes are defined here
      await request(app).get('/api/auth/get-session').expect(404);
    });

    it('should serve as documentation reference', () => {
      // The router exists for documentation purposes
      expect(authRoutes).toBeDefined();
      expect(authRoutes.stack).toBeDefined();
    });
  });

  describe('Better-Auth integration', () => {
    it('should rely on Better-Auth middleware for authentication', () => {
      // This test verifies the documentation-only nature
      // Actual authentication is handled by Better-Auth middleware in server setup
      expect(authRoutes).toBeDefined();
    });
  });

  describe('route characteristics', () => {
    it('should have no active route handlers', () => {
      // Since this is documentation-only, verify no routes are registered
      const routeCount =
        authRoutes.stack?.filter((layer) => layer.route).length || 0;
      expect(routeCount).toBe(0);
    });

    it('should maintain router structure for documentation', () => {
      // Even though no routes are defined, it should be a valid router
      expect(authRoutes.stack).toBeDefined();
      expect(Array.isArray(authRoutes.stack)).toBe(true);
    });
  });
});

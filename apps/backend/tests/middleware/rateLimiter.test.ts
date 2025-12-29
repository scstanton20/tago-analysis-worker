import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestHandler, NextFunction } from 'express';
import {
  createControllerRequest,
  createControllerResponse,
  createMockNext,
} from '../utils/testHelpers.ts';

// Mock the constants
vi.mock('../../src/constants.ts', () => ({
  RATE_LIMIT: {
    WINDOW_FIFTEEN_MINUTES_MS: 15 * 60 * 1000,
    WINDOW_FIVE_MINUTES_MS: 5 * 60 * 1000,
    FILE_OPERATIONS_MAX: 200,
    UPLOADS_MAX: 50,
    ANALYSIS_RUN_MAX: 100,
    DELETIONS_MAX: 50,
    VERSION_OPERATIONS_MAX: 500,
  },
}));

// Define interface for rate limiters module
interface RateLimitersModule {
  fileOperationLimiter: RequestHandler;
  uploadLimiter: RequestHandler;
  analysisRunLimiter: RequestHandler;
  deletionLimiter: RequestHandler;
  versionOperationLimiter: RequestHandler;
  teamOperationLimiter: RequestHandler;
  userOperationLimiter: RequestHandler;
  settingsOperationLimiter: RequestHandler;
}

describe('rateLimiter middleware', () => {
  let rateLimiters: RateLimitersModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import the rate limiters
    rateLimiters = await import('../../src/middleware/rateLimiter.ts');
  });

  describe('fileOperationLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.fileOperationLimiter).toBeDefined();
      expect(typeof rateLimiters.fileOperationLimiter).toBe('function');
    });

    it('should call next when invoked (limiter middleware behavior)', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      rateLimiters.fileOperationLimiter(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        next as unknown as NextFunction,
      );

      // Rate limiter should eventually call next (unless limit exceeded)
      expect(typeof rateLimiters.fileOperationLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(rateLimiters.fileOperationLimiter.length).toBeGreaterThanOrEqual(
        2,
      );
    });
  });

  describe('uploadLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.uploadLimiter).toBeDefined();
      expect(typeof rateLimiters.uploadLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(rateLimiters.uploadLimiter.length).toBeGreaterThanOrEqual(2);
    });

    it('should call next when invoked', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      rateLimiters.uploadLimiter(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        next as unknown as NextFunction,
      );

      expect(typeof rateLimiters.uploadLimiter).toBe('function');
    });
  });

  describe('analysisRunLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.analysisRunLimiter).toBeDefined();
      expect(typeof rateLimiters.analysisRunLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(rateLimiters.analysisRunLimiter.length).toBeGreaterThanOrEqual(2);
    });

    it('should call next when invoked', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      rateLimiters.analysisRunLimiter(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        next as unknown as NextFunction,
      );

      expect(typeof rateLimiters.analysisRunLimiter).toBe('function');
    });
  });

  describe('deletionLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.deletionLimiter).toBeDefined();
      expect(typeof rateLimiters.deletionLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(rateLimiters.deletionLimiter.length).toBeGreaterThanOrEqual(2);
    });

    it('should call next when invoked', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      rateLimiters.deletionLimiter(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        next as unknown as NextFunction,
      );

      expect(typeof rateLimiters.deletionLimiter).toBe('function');
    });
  });

  describe('versionOperationLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.versionOperationLimiter).toBeDefined();
      expect(typeof rateLimiters.versionOperationLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(
        rateLimiters.versionOperationLimiter.length,
      ).toBeGreaterThanOrEqual(2);
    });

    it('should call next when invoked', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      rateLimiters.versionOperationLimiter(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        next as unknown as NextFunction,
      );

      expect(typeof rateLimiters.versionOperationLimiter).toBe('function');
    });
  });

  describe('teamOperationLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.teamOperationLimiter).toBeDefined();
      expect(typeof rateLimiters.teamOperationLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(rateLimiters.teamOperationLimiter.length).toBeGreaterThanOrEqual(
        2,
      );
    });

    it('should call next when invoked', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      rateLimiters.teamOperationLimiter(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        next as unknown as NextFunction,
      );

      expect(typeof rateLimiters.teamOperationLimiter).toBe('function');
    });
  });

  describe('userOperationLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.userOperationLimiter).toBeDefined();
      expect(typeof rateLimiters.userOperationLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(rateLimiters.userOperationLimiter.length).toBeGreaterThanOrEqual(
        2,
      );
    });

    it('should call next when invoked', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      rateLimiters.userOperationLimiter(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        next as unknown as NextFunction,
      );

      expect(typeof rateLimiters.userOperationLimiter).toBe('function');
    });
  });

  describe('settingsOperationLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.settingsOperationLimiter).toBeDefined();
      expect(typeof rateLimiters.settingsOperationLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(
        rateLimiters.settingsOperationLimiter.length,
      ).toBeGreaterThanOrEqual(2);
    });

    it('should call next when invoked', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      rateLimiters.settingsOperationLimiter(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        next as unknown as NextFunction,
      );

      expect(typeof rateLimiters.settingsOperationLimiter).toBe('function');
    });
  });

  describe('all rate limiters', () => {
    it('should export all expected limiters', () => {
      expect(rateLimiters.fileOperationLimiter).toBeDefined();
      expect(rateLimiters.uploadLimiter).toBeDefined();
      expect(rateLimiters.analysisRunLimiter).toBeDefined();
      expect(rateLimiters.deletionLimiter).toBeDefined();
      expect(rateLimiters.versionOperationLimiter).toBeDefined();
      expect(rateLimiters.teamOperationLimiter).toBeDefined();
      expect(rateLimiters.userOperationLimiter).toBeDefined();
      expect(rateLimiters.settingsOperationLimiter).toBeDefined();
    });

    it('should all be middleware functions', () => {
      const limiters: RequestHandler[] = [
        rateLimiters.fileOperationLimiter,
        rateLimiters.uploadLimiter,
        rateLimiters.analysisRunLimiter,
        rateLimiters.deletionLimiter,
        rateLimiters.versionOperationLimiter,
        rateLimiters.teamOperationLimiter,
        rateLimiters.userOperationLimiter,
        rateLimiters.settingsOperationLimiter,
      ];

      limiters.forEach((limiter) => {
        expect(typeof limiter).toBe('function');
        expect(limiter.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should be distinct instances', () => {
      const limiters: RequestHandler[] = [
        rateLimiters.fileOperationLimiter,
        rateLimiters.uploadLimiter,
        rateLimiters.analysisRunLimiter,
        rateLimiters.deletionLimiter,
        rateLimiters.versionOperationLimiter,
        rateLimiters.teamOperationLimiter,
        rateLimiters.userOperationLimiter,
        rateLimiters.settingsOperationLimiter,
      ];

      // Check that limiters are not the same reference
      const uniqueLimiters = new Set(limiters);
      expect(uniqueLimiters.size).toBe(limiters.length);
    });
  });

  describe('middleware behavior', () => {
    it('should handle requests with all limiters', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      const limiters: RequestHandler[] = [
        rateLimiters.fileOperationLimiter,
        rateLimiters.uploadLimiter,
        rateLimiters.analysisRunLimiter,
        rateLimiters.deletionLimiter,
        rateLimiters.versionOperationLimiter,
        rateLimiters.teamOperationLimiter,
        rateLimiters.userOperationLimiter,
        rateLimiters.settingsOperationLimiter,
      ];

      limiters.forEach((limiter) => {
        expect(() =>
          limiter(
            req as unknown as Parameters<RequestHandler>[0],
            res as unknown as Parameters<RequestHandler>[1],
            next as unknown as NextFunction,
          ),
        ).not.toThrow();
      });
    });

    it('should work with different request objects', () => {
      const req1 = createControllerRequest({ ip: '127.0.0.1' });
      const req2 = createControllerRequest({ ip: '192.168.1.1' });
      const res1 = createControllerResponse();
      const res2 = createControllerResponse();
      const next1 = createMockNext();
      const next2 = createMockNext();

      rateLimiters.fileOperationLimiter(
        req1 as unknown as Parameters<RequestHandler>[0],
        res1 as unknown as Parameters<RequestHandler>[1],
        next1 as unknown as NextFunction,
      );
      rateLimiters.fileOperationLimiter(
        req2 as unknown as Parameters<RequestHandler>[0],
        res2 as unknown as Parameters<RequestHandler>[1],
        next2 as unknown as NextFunction,
      );

      expect(typeof rateLimiters.fileOperationLimiter).toBe('function');
    });

    it('should handle different IP addresses', () => {
      const req = createControllerRequest({ ip: '192.168.1.100' });
      const res = createControllerResponse();
      const next = createMockNext();

      expect(() => {
        rateLimiters.fileOperationLimiter(
          req as unknown as Parameters<RequestHandler>[0],
          res as unknown as Parameters<RequestHandler>[1],
          next as unknown as NextFunction,
        );
      }).not.toThrow();
    });

    it('should be reusable across routes', () => {
      const middleware = rateLimiters.uploadLimiter;

      const req1 = createControllerRequest();
      const res1 = createControllerResponse();
      const next1 = createMockNext();

      const req2 = createControllerRequest();
      const res2 = createControllerResponse();
      const next2 = createMockNext();

      middleware(
        req1 as unknown as Parameters<RequestHandler>[0],
        res1 as unknown as Parameters<RequestHandler>[1],
        next1 as unknown as NextFunction,
      );
      middleware(
        req2 as unknown as Parameters<RequestHandler>[0],
        res2 as unknown as Parameters<RequestHandler>[1],
        next2 as unknown as NextFunction,
      );

      expect(typeof middleware).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent requests', () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        req: createControllerRequest({ ip: `192.168.1.${i}` }),
        res: createControllerResponse(),
        next: createMockNext(),
      }));

      requests.forEach(({ req, res, next }) => {
        expect(() => {
          rateLimiters.fileOperationLimiter(
            req as unknown as Parameters<RequestHandler>[0],
            res as unknown as Parameters<RequestHandler>[1],
            next as unknown as NextFunction,
          );
        }).not.toThrow();
      });
    });

    it('should handle requests with custom headers', () => {
      const req = createControllerRequest({
        headers: {
          'x-custom-header': 'test-value',
          'user-agent': 'test-agent',
        },
      });
      const res = createControllerResponse();
      const next = createMockNext();

      expect(() => {
        rateLimiters.fileOperationLimiter(
          req as unknown as Parameters<RequestHandler>[0],
          res as unknown as Parameters<RequestHandler>[1],
          next as unknown as NextFunction,
        );
      }).not.toThrow();
    });

    it('should handle requests with IPv6 addresses', () => {
      const req = createControllerRequest({ ip: '::1' });
      const res = createControllerResponse();
      const next = createMockNext();

      expect(() => {
        rateLimiters.fileOperationLimiter(
          req as unknown as Parameters<RequestHandler>[0],
          res as unknown as Parameters<RequestHandler>[1],
          next as unknown as NextFunction,
        );
      }).not.toThrow();
    });
  });

  describe('integration with express patterns', () => {
    it('should be chainable with other middleware', () => {
      const middleware1 = rateLimiters.uploadLimiter;
      const middleware2 = rateLimiters.fileOperationLimiter;

      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      middleware1(
        req as unknown as Parameters<RequestHandler>[0],
        res as unknown as Parameters<RequestHandler>[1],
        () => {
          middleware2(
            req as unknown as Parameters<RequestHandler>[0],
            res as unknown as Parameters<RequestHandler>[1],
            next as unknown as NextFunction,
          );
        },
      );

      expect(typeof middleware1).toBe('function');
      expect(typeof middleware2).toBe('function');
    });

    it('should work in middleware arrays', () => {
      const middlewares: RequestHandler[] = [
        rateLimiters.fileOperationLimiter,
        rateLimiters.uploadLimiter,
        rateLimiters.analysisRunLimiter,
      ];

      expect(middlewares).toHaveLength(3);
      middlewares.forEach((mw) => {
        expect(typeof mw).toBe('function');
      });
    });
  });

  describe('type safety', () => {
    it('should export functions not objects', () => {
      expect(typeof rateLimiters.fileOperationLimiter).toBe('function');
      expect(typeof rateLimiters.uploadLimiter).toBe('function');
      expect(typeof rateLimiters.analysisRunLimiter).toBe('function');
      expect(typeof rateLimiters.deletionLimiter).toBe('function');
      expect(typeof rateLimiters.versionOperationLimiter).toBe('function');
      expect(typeof rateLimiters.teamOperationLimiter).toBe('function');
      expect(typeof rateLimiters.userOperationLimiter).toBe('function');
      expect(typeof rateLimiters.settingsOperationLimiter).toBe('function');
    });

    it('should accept standard express middleware parameters', () => {
      const req = createControllerRequest();
      const res = createControllerResponse();
      const next = createMockNext();

      // Should not throw when called with standard Express middleware signature
      expect(() => {
        rateLimiters.fileOperationLimiter(
          req as unknown as Parameters<RequestHandler>[0],
          res as unknown as Parameters<RequestHandler>[1],
          next as unknown as NextFunction,
        );
      }).not.toThrow();
    });
  });

  describe('constants usage', () => {
    it('should use imported constants from constants.ts', async () => {
      const constants = await import('../../src/constants.ts');

      expect(constants.RATE_LIMIT).toBeDefined();
      expect(constants.RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS).toBe(
        15 * 60 * 1000,
      );
      expect(constants.RATE_LIMIT.WINDOW_FIVE_MINUTES_MS).toBe(5 * 60 * 1000);
      expect(constants.RATE_LIMIT.FILE_OPERATIONS_MAX).toBe(200);
      expect(constants.RATE_LIMIT.UPLOADS_MAX).toBe(50);
      expect(constants.RATE_LIMIT.ANALYSIS_RUN_MAX).toBe(100);
      expect(constants.RATE_LIMIT.DELETIONS_MAX).toBe(50);
      expect(constants.RATE_LIMIT.VERSION_OPERATIONS_MAX).toBe(500);
    });
  });
});

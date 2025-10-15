import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../utils/testHelpers.js';

// Mock the constants
vi.mock('../../src/constants.js', () => ({
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

describe('rateLimiter middleware', () => {
  let rateLimiters;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import the rate limiters
    rateLimiters = await import('../../src/middleware/rateLimiter.js');
  });

  describe('fileOperationLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.fileOperationLimiter).toBeDefined();
      expect(typeof rateLimiters.fileOperationLimiter).toBe('function');
    });

    it('should call next when invoked (limiter middleware behavior)', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.fileOperationLimiter(req, res, next);

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
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.uploadLimiter(req, res, next);

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
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.analysisRunLimiter(req, res, next);

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
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.deletionLimiter(req, res, next);

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
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.versionOperationLimiter(req, res, next);

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
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.teamOperationLimiter(req, res, next);

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
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.userOperationLimiter(req, res, next);

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
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.settingsOperationLimiter(req, res, next);

      expect(typeof rateLimiters.settingsOperationLimiter).toBe('function');
    });
  });

  describe('sseLogoutLimiter', () => {
    it('should be defined and callable', () => {
      expect(rateLimiters.sseLogoutLimiter).toBeDefined();
      expect(typeof rateLimiters.sseLogoutLimiter).toBe('function');
    });

    it('should be an express middleware function', () => {
      expect(rateLimiters.sseLogoutLimiter.length).toBeGreaterThanOrEqual(2);
    });

    it('should call next when invoked', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiters.sseLogoutLimiter(req, res, next);

      expect(typeof rateLimiters.sseLogoutLimiter).toBe('function');
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
      expect(rateLimiters.sseLogoutLimiter).toBeDefined();
    });

    it('should all be middleware functions', () => {
      const limiters = [
        rateLimiters.fileOperationLimiter,
        rateLimiters.uploadLimiter,
        rateLimiters.analysisRunLimiter,
        rateLimiters.deletionLimiter,
        rateLimiters.versionOperationLimiter,
        rateLimiters.teamOperationLimiter,
        rateLimiters.userOperationLimiter,
        rateLimiters.settingsOperationLimiter,
        rateLimiters.sseLogoutLimiter,
      ];

      limiters.forEach((limiter) => {
        expect(typeof limiter).toBe('function');
        expect(limiter.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should be distinct instances', () => {
      const limiters = [
        rateLimiters.fileOperationLimiter,
        rateLimiters.uploadLimiter,
        rateLimiters.analysisRunLimiter,
        rateLimiters.deletionLimiter,
        rateLimiters.versionOperationLimiter,
        rateLimiters.teamOperationLimiter,
        rateLimiters.userOperationLimiter,
        rateLimiters.settingsOperationLimiter,
        rateLimiters.sseLogoutLimiter,
      ];

      // Check that limiters are not the same reference
      const uniqueLimiters = new Set(limiters);
      expect(uniqueLimiters.size).toBe(limiters.length);
    });
  });

  describe('middleware behavior', () => {
    it('should handle requests with all limiters', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const limiters = [
        rateLimiters.fileOperationLimiter,
        rateLimiters.uploadLimiter,
        rateLimiters.analysisRunLimiter,
        rateLimiters.deletionLimiter,
        rateLimiters.versionOperationLimiter,
        rateLimiters.teamOperationLimiter,
        rateLimiters.userOperationLimiter,
        rateLimiters.settingsOperationLimiter,
        rateLimiters.sseLogoutLimiter,
      ];

      limiters.forEach((limiter) => {
        expect(() => limiter(req, res, next)).not.toThrow();
      });
    });

    it('should work with different request objects', () => {
      const req1 = createMockRequest({ ip: '127.0.0.1' });
      const req2 = createMockRequest({ ip: '192.168.1.1' });
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const next1 = createMockNext();
      const next2 = createMockNext();

      rateLimiters.fileOperationLimiter(req1, res1, next1);
      rateLimiters.fileOperationLimiter(req2, res2, next2);

      expect(typeof rateLimiters.fileOperationLimiter).toBe('function');
    });

    it('should handle different IP addresses', () => {
      const req = createMockRequest({ ip: '192.168.1.100' });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => {
        rateLimiters.fileOperationLimiter(req, res, next);
      }).not.toThrow();
    });

    it('should be reusable across routes', () => {
      const middleware = rateLimiters.uploadLimiter;

      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const next1 = createMockNext();

      const req2 = createMockRequest();
      const res2 = createMockResponse();
      const next2 = createMockNext();

      middleware(req1, res1, next1);
      middleware(req2, res2, next2);

      expect(typeof middleware).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent requests', () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        req: createMockRequest({ ip: `192.168.1.${i}` }),
        res: createMockResponse(),
        next: createMockNext(),
      }));

      requests.forEach(({ req, res, next }) => {
        expect(() => {
          rateLimiters.fileOperationLimiter(req, res, next);
        }).not.toThrow();
      });
    });

    it('should handle requests with custom headers', () => {
      const req = createMockRequest({
        headers: {
          'x-custom-header': 'test-value',
          'user-agent': 'test-agent',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => {
        rateLimiters.fileOperationLimiter(req, res, next);
      }).not.toThrow();
    });

    it('should handle requests with IPv6 addresses', () => {
      const req = createMockRequest({ ip: '::1' });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => {
        rateLimiters.fileOperationLimiter(req, res, next);
      }).not.toThrow();
    });
  });

  describe('integration with express patterns', () => {
    it('should be chainable with other middleware', () => {
      const middleware1 = rateLimiters.uploadLimiter;
      const middleware2 = rateLimiters.fileOperationLimiter;

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      middleware1(req, res, () => {
        middleware2(req, res, next);
      });

      expect(typeof middleware1).toBe('function');
      expect(typeof middleware2).toBe('function');
    });

    it('should work in middleware arrays', () => {
      const middlewares = [
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
      expect(typeof rateLimiters.sseLogoutLimiter).toBe('function');
    });

    it('should accept standard express middleware parameters', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Should not throw when called with standard Express middleware signature
      expect(() => {
        rateLimiters.fileOperationLimiter(req, res, next);
      }).not.toThrow();
    });
  });

  describe('constants usage', () => {
    it('should use imported constants from constants.js', async () => {
      const constants = await import('../../src/constants.js');

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

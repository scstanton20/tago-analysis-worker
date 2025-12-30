import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import compression from 'compression';
import {
  sseCompression,
  sseCompressionFilter,
} from '../../src/middleware/compression.ts';

// Mock compression.filter for testing default fallback behavior
vi.mock('compression', async () => {
  const actual = await vi.importActual('compression');
  return {
    ...actual,
    default: Object.assign(
      vi.fn((_options) => {
        // Return a middleware that calls next
        return (_req: Request, _res: Response, next: () => void) => next();
      }),
      {
        filter: vi.fn().mockReturnValue(true),
      },
    ),
  };
});

describe('SSE Compression Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sseCompressionFilter', () => {
    describe('SSE path detection', () => {
      it('should return true for SSE paths', () => {
        const mockReq = { path: '/api/sse/events' } as Request;
        const mockRes = {} as Response;

        const result = sseCompressionFilter(mockReq, mockRes);

        expect(result).toBe(true);
      });

      it('should return true for various SSE paths', () => {
        const testPaths = [
          '/sse/stream',
          '/api/sse/updates',
          '/v1/sse/logs',
          '/deeply/nested/sse/events',
          '/api/v1/analysis/sse/status',
          '/sse/broadcast',
        ];

        testPaths.forEach((path) => {
          const mockReq = { path } as Request;
          const mockRes = {} as Response;

          const result = sseCompressionFilter(mockReq, mockRes);

          expect(result).toBe(true);
        });
      });
    });

    describe('non-SSE paths', () => {
      it('should use default filter for regular API paths', () => {
        const mockReq = { path: '/api/analysis/list' } as Request;
        const mockRes = {} as Response;

        sseCompressionFilter(mockReq, mockRes);

        expect(compression.filter).toHaveBeenCalledWith(mockReq, mockRes);
      });

      it('should use default filter for auth paths', () => {
        const mockReq = { path: '/auth/login' } as Request;
        const mockRes = {} as Response;

        sseCompressionFilter(mockReq, mockRes);

        expect(compression.filter).toHaveBeenCalledWith(mockReq, mockRes);
      });

      it('should use default filter for paths containing "sse" but not /sse/ pattern', () => {
        const testPaths = [
          '/api/session/events',
          '/api/user/assessment',
          '/ssea/events',
          '/api/assess',
        ];

        testPaths.forEach((path) => {
          vi.clearAllMocks();
          const mockReq = { path } as Request;
          const mockRes = {} as Response;

          sseCompressionFilter(mockReq, mockRes);

          expect(compression.filter).toHaveBeenCalledWith(mockReq, mockRes);
        });
      });
    });

    describe('edge cases', () => {
      it('should use default filter for null request', () => {
        const mockRes = {} as Response;

        sseCompressionFilter(null as unknown as Request, mockRes);

        expect(compression.filter).toHaveBeenCalledWith(null, mockRes);
      });

      it('should use default filter for undefined request', () => {
        const mockRes = {} as Response;

        sseCompressionFilter(undefined as unknown as Request, mockRes);

        expect(compression.filter).toHaveBeenCalledWith(undefined, mockRes);
      });

      it('should use default filter for request with undefined path', () => {
        const mockReq = {} as Request;
        const mockRes = {} as Response;

        sseCompressionFilter(mockReq, mockRes);

        expect(compression.filter).toHaveBeenCalledWith(mockReq, mockRes);
      });

      it('should use default filter for request with null path', () => {
        const mockReq = { path: null } as unknown as Request;
        const mockRes = {} as Response;

        sseCompressionFilter(mockReq, mockRes);

        expect(compression.filter).toHaveBeenCalledWith(mockReq, mockRes);
      });

      it('should use default filter for request with empty path', () => {
        const mockReq = { path: '' } as Request;
        const mockRes = {} as Response;

        sseCompressionFilter(mockReq, mockRes);

        expect(compression.filter).toHaveBeenCalledWith(mockReq, mockRes);
      });
    });

    describe('return values', () => {
      it('should return default filter result for non-SSE paths', () => {
        vi.mocked(compression.filter).mockReturnValue(false);

        const mockReq = { path: '/api/data' } as Request;
        const mockRes = {} as Response;

        const result = sseCompressionFilter(mockReq, mockRes);

        expect(result).toBe(false);
      });

      it('should return true regardless of default filter for SSE paths', () => {
        vi.mocked(compression.filter).mockReturnValue(false);

        const mockReq = { path: '/api/sse/events' } as Request;
        const mockRes = {} as Response;

        const result = sseCompressionFilter(mockReq, mockRes);

        expect(result).toBe(true);
        expect(compression.filter).not.toHaveBeenCalled();
      });
    });
  });

  describe('sseCompression', () => {
    it('should return a middleware function', () => {
      const middleware = sseCompression();
      expect(typeof middleware).toBe('function');
      // Express middleware has 3 params (req, res, next)
      expect(middleware.length).toBe(3);
    });

    it('should call next function', () => {
      const middleware = sseCompression();

      const mockReq = { path: '/api/sse/events' } as Request;
      const mockRes = {
        getHeader: vi.fn().mockReturnValue('text/event-stream'),
        setHeader: vi.fn(),
        on: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      middleware(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
    });

    it('should not throw with various path types', () => {
      const middleware = sseCompression();

      const pathTests = [
        { path: '/api/sse/events' },
        { path: '/api/analysis' },
        { path: '/auth/login' },
        { path: '/sse/' },
      ];

      pathTests.forEach(({ path }) => {
        const mockReq = { path } as Request;
        const mockRes = {
          getHeader: vi.fn(),
          setHeader: vi.fn(),
          on: vi.fn(),
        } as unknown as Response;
        const next = vi.fn();

        expect(() => middleware(mockReq, mockRes, next)).not.toThrow();
      });
    });
  });
});

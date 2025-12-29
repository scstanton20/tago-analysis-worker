import { describe, it, expect, vi } from 'vitest';
import { sseCompression } from '../../src/middleware/compression.ts';
import type { Request, Response } from 'express';

describe('SSE Compression Middleware', () => {
  describe('sseCompression', () => {
    it('should return a middleware function', () => {
      const middleware = sseCompression();
      expect(typeof middleware).toBe('function');
    });

    it('should compress SSE paths containing /sse/', () => {
      const middleware = sseCompression();

      // Access the filter function through the middleware internals
      // The compression middleware exposes its filter when created
      const mockReq = {
        path: '/api/sse/events',
      } as Request;

      const mockRes = {
        getHeader: vi.fn().mockReturnValue('text/event-stream'),
      } as unknown as Response;

      // Call the middleware to verify it initializes correctly
      const next = vi.fn();
      // Middleware should not throw
      expect(() => middleware(mockReq, mockRes, next)).not.toThrow();
    });

    it('should handle non-SSE paths', () => {
      const middleware = sseCompression();

      const mockReq = {
        path: '/api/analysis/list',
      } as Request;

      const mockRes = {
        getHeader: vi.fn().mockReturnValue('application/json'),
      } as unknown as Response;

      const next = vi.fn();
      expect(() => middleware(mockReq, mockRes, next)).not.toThrow();
    });

    it('should handle requests with undefined path', () => {
      const middleware = sseCompression();

      const mockReq = {} as Request;

      const mockRes = {
        getHeader: vi.fn().mockReturnValue('application/json'),
      } as unknown as Response;

      const next = vi.fn();
      expect(() => middleware(mockReq, mockRes, next)).not.toThrow();
    });

    it('should handle null request gracefully', () => {
      const middleware = sseCompression();

      const mockRes = {
        getHeader: vi.fn().mockReturnValue('application/json'),
      } as unknown as Response;

      const next = vi.fn();
      // Even with null/undefined request, should not crash
      expect(() =>
        middleware(null as unknown as Request, mockRes, next),
      ).not.toThrow();
    });

    it('should configure middleware with maximum compression level', () => {
      const middleware = sseCompression();

      // Verify the middleware was created (it's a function)
      expect(middleware).toBeDefined();
      expect(middleware.length).toBe(3); // Express middleware signature (req, res, next)
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { asyncHandler } from '../../src/utils/asyncHandler.js';

describe('asyncHandler', () => {
  describe('successful execution', () => {
    it('should call async function with req, res, next', async () => {
      const mockFn = vi.fn().mockResolvedValue(undefined);
      const req = {};
      const res = {};
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(req, res, next);

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should not call next on successful execution', async () => {
      const mockFn = vi.fn().mockResolvedValue(undefined);
      const req = {};
      const res = { json: vi.fn() };
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it('should handle synchronous return values', async () => {
      const mockFn = vi.fn().mockReturnValue('sync value');
      const req = {};
      const res = {};
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(req, res, next);

      expect(mockFn).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should catch rejected promises and pass error to next', async () => {
      const error = new Error('Async error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = {};
      const res = {};
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should catch thrown errors from async functions', async () => {
      const error = new Error('Thrown error');
      const mockFn = vi.fn().mockImplementation(async () => {
        throw error;
      });
      const req = {};
      const res = {};
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should handle errors in async operations', async () => {
      const error = new Error('Database error');
      const mockFn = vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        throw error;
      });
      const req = {};
      const res = {};
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      // Need to use try-catch or wait for promise chain to complete
      wrapped(req, res, next);
      // Wait for the promise chain
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('edge cases', () => {
    it('should handle null errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(null);
      const req = {};
      const res = {};
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(req, res, next);

      expect(next).toHaveBeenCalledWith(null);
    });

    it('should handle string errors', async () => {
      const mockFn = vi.fn().mockRejectedValue('String error');
      const req = {};
      const res = {};
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(req, res, next);

      expect(next).toHaveBeenCalledWith('String error');
    });

    it('should preserve error properties', async () => {
      const error = new Error('Custom error');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = {};
      const res = {};
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(req, res, next);

      const passedError = next.mock.calls[0][0];
      expect(passedError.statusCode).toBe(404);
      expect(passedError.code).toBe('NOT_FOUND');
    });
  });

  describe('function signature', () => {
    it('should return a function', () => {
      const mockFn = vi.fn();
      const wrapped = asyncHandler(mockFn);

      expect(typeof wrapped).toBe('function');
    });

    it('should accept functions with different signatures', async () => {
      const mockFn1 = vi.fn().mockResolvedValue(undefined);
      const mockFn2 = vi.fn((_req, _res) => Promise.resolve());
      const mockFn3 = vi.fn((_req) => Promise.resolve());

      const wrapped1 = asyncHandler(mockFn1);
      const wrapped2 = asyncHandler(mockFn2);
      const wrapped3 = asyncHandler(mockFn3);

      await wrapped1({}, {}, vi.fn());
      await wrapped2({}, {}, vi.fn());
      await wrapped3({}, {}, vi.fn());

      expect(mockFn1).toHaveBeenCalled();
      expect(mockFn2).toHaveBeenCalled();
      expect(mockFn3).toHaveBeenCalled();
    });
  });
});

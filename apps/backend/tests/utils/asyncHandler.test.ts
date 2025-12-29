import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';

// No need to mock logger - tests verify response behavior, not logging
// The real logger will be silent or output to console (acceptable in tests)

interface MockRequest {
  log?: { error: Mock };
  logger?: { error: Mock };
}

interface MockResponse {
  status: Mock;
  json: Mock;
}

describe('asyncHandler', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let asyncHandler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/utils/asyncHandler.ts');
    asyncHandler = module.asyncHandler;
  });

  describe('successful execution', () => {
    it('should call async function with req, res, next', async () => {
      const mockFn = vi.fn().mockResolvedValue(undefined);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'test operation');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should not send error response on successful execution', async () => {
      const mockFn = vi.fn().mockResolvedValue(undefined);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'test operation');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should handle synchronous return values', async () => {
      const mockFn = vi.fn().mockReturnValue('sync value');
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'test operation');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(mockFn).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should catch rejected promises and send 500 error response', async () => {
      const error = new Error('Async error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'test operation');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to test operation',
      });
      expect(req.log!.error).toHaveBeenCalled();
    });

    it('should catch thrown errors from async functions', async () => {
      const error = new Error('Thrown error');
      const mockFn = vi.fn().mockImplementation(async () => {
        throw error;
      });
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'upload analysis');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to upload analysis',
      });
    });

    it('should handle errors in async operations', async () => {
      const error = new Error('Database error');
      const mockFn = vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        throw error;
      });
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'query database');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to query database',
      });
    });

    it('should return 404 for "not found" errors', async () => {
      const error = new Error('Analysis not found');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'get analysis');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Analysis not found' });
    });

    it('should return 409 for "already exists" errors', async () => {
      const error = new Error('Team already exists');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'create team');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Team already exists' });
    });

    it('should return 400 for path traversal errors', async () => {
      const error = new Error('Path traversal detected');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'read file');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid file path' });
    });

    it('should return 400 for invalid filename errors', async () => {
      const error = new Error('Invalid filename');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'create file');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid file path' });
    });

    it('should return 400 for "Cannot move" errors', async () => {
      const error = new Error('Cannot move folder into itself');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'move folder');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cannot move folder into itself',
      });
    });
  });

  describe('logger handling', () => {
    it('should use req.log if available', async () => {
      const error = new Error('Test error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const mockLogger = { error: vi.fn() };
      const req = { log: mockLogger } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'test operation');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: error, operation: 'test operation' },
        'Error test operation',
      );
    });

    it('should use req.logger if req.log not available', async () => {
      const error = new Error('Test error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const mockLogger = { error: vi.fn() };
      const req = { logger: mockLogger } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'test operation');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use default logger if no logger in req', async () => {
      const error = new Error('Test error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = {} as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'test operation');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      // Should still handle the error even without a logger
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to test operation',
      });
    });
  });

  describe('function signature', () => {
    it('should return a function', () => {
      const mockFn = vi.fn();
      const wrapped = asyncHandler(mockFn, 'test operation');

      expect(typeof wrapped).toBe('function');
    });

    it('should accept operation name as second parameter', async () => {
      const error = new Error('Test');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn, 'custom operation');
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to custom operation',
      });
    });

    it('should work without operation name', async () => {
      const error = new Error('Something went wrong');
      const mockFn = vi.fn().mockRejectedValue(error);
      const req = { log: { error: vi.fn() } } as MockRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as MockResponse;
      const next = vi.fn();

      const wrapped = asyncHandler(mockFn);
      await wrapped(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong' });
    });
  });
});

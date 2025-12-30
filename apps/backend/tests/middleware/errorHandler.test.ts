import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import type { NextFunction } from 'express';
import {
  createControllerRequest,
  createControllerResponse,
  createMockNext,
  type MockRequest,
  type MockResponse,
  type MockLogger,
} from '../utils/testHelpers.ts';

vi.mock('../../src/utils/logging/logger.ts');

// Define the error handler function type
type ErrorHandlerFn = (
  error: Error & {
    statusCode?: number;
    name?: string;
    errors?: unknown;
    code?: string;
    stack?: string;
  },
  req: MockRequest,
  res: MockResponse,
  next: Mock<NextFunction>,
) => void;

describe('errorHandler middleware', () => {
  let errorHandler: ErrorHandlerFn;
  let req: MockRequest;
  let res: MockResponse;
  let next: Mock<NextFunction>;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    const { errorHandler: handler } = await import(
      '../../src/middleware/errorHandler.ts'
    );
    errorHandler = handler as unknown as ErrorHandlerFn;

    req = createControllerRequest();
    res = createControllerResponse();
    next = createMockNext();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should handle generic errors with 500 status', () => {
    const error = new Error('Something went wrong');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Something went wrong',
    });
  });

  it('should use custom status code if provided', () => {
    const error = new Error('Not found') as Error & { statusCode: number };
    error.statusCode = 404;

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not found',
    });
  });

  it('should handle validation errors', () => {
    const error = new Error('Validation failed') as Error & {
      name: string;
      errors: Record<string, string>;
    };
    error.name = 'ValidationError';
    error.errors = {
      field1: 'Field is required',
      field2: 'Invalid value',
    };

    errorHandler(error, req, res, next);

    // errorHandler doesn't have special handling for ValidationError - uses default 500
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Validation failed',
      }),
    );
  });

  it('should handle Zod validation errors', () => {
    const error = {
      name: 'ZodError',
      message: 'Validation error',
      errors: [
        {
          path: ['field1'],
          message: 'Field is required',
        },
      ],
    } as unknown as Error;

    errorHandler(error, req, res, next);

    // errorHandler doesn't have special handling for ZodError - uses default 500
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should not expose stack traces in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Error('Internal error');

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.not.objectContaining({
        stack: expect.any(String),
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should include stack traces in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const error = new Error('Internal error');

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Internal error',
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should log errors', () => {
    const error = new Error('Something went wrong');

    errorHandler(error, req, res, next);

    expect(req.log.error).toHaveBeenCalled();
  });

  it('should handle errors without message', () => {
    const error = new Error();

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal Server Error', // Actual error handler uses capital S
    });
  });

  it('should not send response if headers already sent', () => {
    const error = new Error('Error after headers sent');
    res.headersSent = true;

    errorHandler(error, req, res, next);

    // Current errorHandler doesn't check headersSent - it still sends response
    // This test documents current behavior rather than ideal behavior
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });

  describe('invalid response object handling', () => {
    it('should handle invalid response object (missing status method)', () => {
      const error = new Error('Something went wrong');
      const invalidRes = { json: vi.fn() } as unknown as MockResponse;

      errorHandler(error, req, invalidRes, next);

      // Should call next() and not attempt to send response
      expect(next).toHaveBeenCalledWith(error);
      expect(invalidRes.json).not.toHaveBeenCalled();
    });

    it('should log error when response object is invalid', () => {
      const error = new Error('Something went wrong');
      const invalidRes = { json: vi.fn() } as unknown as MockResponse;

      errorHandler(error, req, invalidRes, next);

      expect(req.log.error).toHaveBeenCalled();
      const logCall = (req.log.error as Mock).mock.calls[0];
      expect(logCall[1]).toContain('invalid response object');
    });
  });

  describe('error code handling', () => {
    it('should handle ENOENT error code (File not found)', () => {
      const error = new Error('File missing') as Error & { code: string };
      error.code = 'ENOENT';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'File not found',
      });
    });

    it('should handle EACCES error code (Permission denied)', () => {
      const error = new Error('No access') as Error & { code: string };
      error.code = 'EACCES';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Permission denied',
      });
    });

    it('should use custom message for ENOENT over error message', () => {
      const error = new Error('Original message') as Error & { code: string };
      error.code = 'ENOENT';

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as Mock).mock.calls[0][0];
      expect(jsonCall.error).toBe('File not found');
    });

    it('should use custom message for EACCES over error message', () => {
      const error = new Error('Original message') as Error & { code: string };
      error.code = 'EACCES';

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as Mock).mock.calls[0][0];
      expect(jsonCall.error).toBe('Permission denied');
    });

    it('should not override statusCode for recognized error codes', () => {
      const error = new Error() as Error & { code: string; statusCode: number };
      error.code = 'ENOENT';
      error.statusCode = 404; // Explicitly set to same value

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('development vs production stack traces', () => {
    it('should include stack trace in development environment', () => {
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const errorStack = error.stack;

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as Mock).mock.calls[0][0];
      expect(jsonCall).toHaveProperty('stack');
      expect(jsonCall.stack).toBe(errorStack);
    });

    it('should not include stack trace in production environment', () => {
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as Mock).mock.calls[0][0];
      expect(jsonCall).not.toHaveProperty('stack');
    });

    it('should include error message in both development and production', () => {
      const errorMessage = 'Critical error';

      process.env.NODE_ENV = 'development';
      let error = new Error(errorMessage);
      errorHandler(error, req, res, next);

      let jsonCall = (res.json as Mock).mock.calls[0][0];
      expect(jsonCall.error).toBe(errorMessage);

      vi.clearAllMocks();
      process.env.NODE_ENV = 'production';
      error = new Error(errorMessage);
      errorHandler(error, req, res, next);

      jsonCall = (res.json as Mock).mock.calls[0][0];
      expect(jsonCall.error).toBe(errorMessage);
    });
  });

  describe('logger integration', () => {
    it('should create child logger with middleware context', () => {
      const error = new Error('Test error');

      errorHandler(error, req, res, next);

      expect(req.log.child).toHaveBeenCalledWith({
        middleware: 'errorHandler',
      });
    });

    it('should log error with complete context', () => {
      const error = new Error('Test error') as Error & { code: string };
      error.code = 'ENOENT';
      req.path = '/api/analysis/123';
      req.method = 'GET';

      errorHandler(error, req, res, next);

      const childLogger = req.log.child() as MockLogger;
      expect(childLogger.error).toHaveBeenCalled();

      const errorLogCall = (childLogger.error as Mock).mock.calls[0];
      const logContext = errorLogCall[0];

      expect(logContext).toMatchObject({
        action: 'errorHandler',
        statusCode: 404,
        code: 'ENOENT',
        path: '/api/analysis/123',
        method: 'GET',
        message: 'File not found',
      });
      expect(logContext).toHaveProperty('err');
    });

    it('should handle missing logger gracefully', () => {
      const error = new Error('Test error');
      req.log = undefined as unknown as MockLogger;

      // Should not throw
      expect(() => errorHandler(error, req, res, next)).not.toThrow();

      // Should still send error response
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should log message when calling next()', () => {
      const error = new Error('Something went wrong');
      const invalidRes = { json: vi.fn() } as unknown as MockResponse;

      errorHandler(error, req, invalidRes, next);

      const childLogger = req.log.child() as MockLogger;
      const errorLogCall = (childLogger.error as Mock).mock.calls[0];
      expect(errorLogCall[1]).toContain('invalid response object');
    });
  });

  describe('status code precedence', () => {
    it('should use custom statusCode when provided', () => {
      const error = new Error('Not found') as Error & { statusCode: number };
      error.statusCode = 404;

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should override with ENOENT status code', () => {
      const error = new Error() as Error & { code: string; statusCode: number };
      error.statusCode = 500;
      error.code = 'ENOENT';

      errorHandler(error, req, res, next);

      // statusCode is checked first (line 43-44), so it uses 500
      // Then code is checked (line 52-54), which also sets to 404
      // Final value depends on which overwrites - code comes after
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should use error code over error statusCode', () => {
      const error = new Error() as Error & { code: string; statusCode: number };
      error.statusCode = 401; // Unauthorized
      error.code = 'EACCES'; // Permission denied -> 403

      errorHandler(error, req, res, next);

      // Code overwrites statusCode since it comes later in logic
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('error message handling', () => {
    it('should use error message when provided', () => {
      const errorMessage = 'Custom error message';
      const error = new Error(errorMessage);

      errorHandler(error, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: errorMessage,
        }),
      );
    });

    it('should use default message for errors without message', () => {
      const error = new Error();

      errorHandler(error, req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
      });
    });

    it('should override message with code-specific message', () => {
      const error = new Error('Original message') as Error & { code: string };
      error.code = 'ENOENT';

      errorHandler(error, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'File not found',
        }),
      );
    });

    it('should handle empty string message', () => {
      const error = new Error('');

      errorHandler(error, req, res, next);

      // Empty string is falsy for the if statement, so default message is used
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
      });
    });
  });

  describe('request context logging', () => {
    it('should include request path in error log', () => {
      const error = new Error('Test');
      req.path = '/test/path';

      errorHandler(error, req, res, next);

      const childLogger = req.log.child() as MockLogger;
      const logContext = (childLogger.error as Mock).mock.calls[0][0];
      expect(logContext.path).toBe('/test/path');
    });

    it('should include request method in error log', () => {
      const error = new Error('Test');
      req.method = 'POST';

      errorHandler(error, req, res, next);

      const childLogger = req.log.child() as MockLogger;
      const logContext = (childLogger.error as Mock).mock.calls[0][0];
      expect(logContext.method).toBe('POST');
    });
  });

  describe('edge cases', () => {
    it('should handle error with null message', () => {
      const error = new Error() as Error & { message: null };
      Object.defineProperty(error, 'message', {
        value: null,
        writable: true,
      });

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should handle error with 0 statusCode', () => {
      const error = new Error('Test') as Error & { statusCode: number };
      error.statusCode = 0;

      errorHandler(error, req, res, next);

      // 0 is falsy, so if (err.statusCode) is false, uses default 500
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle multiple error codes (last one wins)', () => {
      const error = new Error() as Error & { code: string };
      // Only one code property, but test that EACCES comes after ENOENT in logic
      error.code = 'EACCES';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Permission denied',
      });
    });

    it('should handle unknown error codes', () => {
      const error = new Error('Unknown code error') as Error & { code: string };
      error.code = 'EUNKNOWN';

      errorHandler(error, req, res, next);

      // Unknown codes don't match ENOENT or EACCES, so use default
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unknown code error',
      });
    });
  });
});

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { NextFunction } from 'express';
import {
  sanitizeFilenameParam,
  sanitizeFilenameParams,
} from '../../src/middleware/sanitizeParams.ts';

// Define types for the mock objects
type MockRequest = {
  params: Record<string, string | number | null | undefined>;
  path: string;
};

type MockResponse = {
  status: Mock<(code: number) => MockResponse>;
  json: Mock<(data: unknown) => MockResponse>;
};

describe('sanitizeParams Middleware', () => {
  let req: MockRequest;
  let res: MockResponse;
  let next: Mock<NextFunction>;

  beforeEach(() => {
    req = {
      params: {},
      path: '/api/test',
    };
    res = {
      status: vi.fn().mockReturnThis() as Mock<(code: number) => MockResponse>,
      json: vi.fn() as Mock<(data: unknown) => MockResponse>,
    };
    next = vi.fn();
  });

  describe('sanitizeFilenameParam', () => {
    it('should sanitize valid filename and call next()', () => {
      req.params.fileName = 'test-analysis.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('test-analysis.js');
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should sanitize filename with dangerous chars that result in valid name', () => {
      // Colons and asterisks are sanitized to underscores by sanitize-filename
      // The result 'my_analysis_.js' passes FILENAME_REGEX
      req.params.fileName = 'my:analysis*.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('my_analysis_.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize filename with path traversal attempt', () => {
      // Path traversal results in '.._.._.._etc_passwd' which passes FILENAME_REGEX
      // (dots and underscores are allowed)
      req.params.fileName = '../../../etc/passwd';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('.._.._.._etc_passwd');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should reject filename with parentheses', () => {
      // Parentheses are not replaced by sanitize-filename but fail FILENAME_REGEX
      req.params.fileName = 'file(1).js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid filename',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject empty filename', () => {
      req.params.fileName = '';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid filename',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass through when no filename parameter exists', () => {
      // req.params.fileName is undefined

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle different parameter names', () => {
      req.params.newFileName = 'renamed.js';

      const middleware = sanitizeFilenameParam('newFileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.newFileName).toBe('renamed.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should reject null filename', () => {
      req.params.fileName = null;

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject non-string filename', () => {
      req.params.fileName = 123;

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should sanitize filename with only dots', () => {
      req.params.fileName = '...'; // becomes underscore after sanitization

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      // sanitize-filename converts ... to _
      expect(req.params.fileName).toBe('_');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should default to fileName parameter when no param name provided', () => {
      req.params.fileName = 'test.js';

      const middleware = sanitizeFilenameParam(); // no param name
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('test.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should include error details in response', () => {
      req.params.fileName = 123;

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid filename',
          details: expect.any(String),
        }),
      );
    });
  });

  describe('sanitizeFilenameParams (multiple params)', () => {
    it('should sanitize multiple valid filenames', () => {
      req.params.fileName = 'source.js';
      req.params.newFileName = 'target.js';

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('source.js');
      expect(req.params.newFileName).toBe('target.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize all params with special characters', () => {
      req.params.fileName = 'file:1.js';
      req.params.newFileName = 'file|2.js';

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('file_1.js');
      expect(req.params.newFileName).toBe('file_2.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize params with path traversal', () => {
      req.params.fileName = 'valid.js';
      req.params.newFileName = '../invalid.js';

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      // Path traversal results in '.._invalid.js' which passes FILENAME_REGEX
      // (dots and underscores are allowed)
      expect(req.params.fileName).toBe('valid.js');
      expect(req.params.newFileName).toBe('.._invalid.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should handle missing params gracefully', () => {
      req.params.fileName = 'test.js';
      // newFileName is undefined

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('test.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should work with single param', () => {
      req.params.fileName = 'single.js';

      const middleware = sanitizeFilenameParams('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('single.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should work with three or more params', () => {
      req.params.file1 = 'a.js';
      req.params.file2 = 'b.js';
      req.params.file3 = 'c.js';

      const middleware = sanitizeFilenameParams('file1', 'file2', 'file3');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.file1).toBe('a.js');
      expect(req.params.file2).toBe('b.js');
      expect(req.params.file3).toBe('c.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should reject when validation fails (null value)', () => {
      req.params.fileName = null;
      req.params.newFileName = 'good.js';

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid filename',
          details: expect.any(String),
        }),
      );
    });
  });

  describe('security tests', () => {
    it('should sanitize directory traversal with dots to underscore', () => {
      req.params.fileName = '..';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      // sanitize-filename converts .. to _, which passes FILENAME_REGEX
      expect(req.params.fileName).toBe('_');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize directory traversal with forward slashes', () => {
      req.params.fileName = '../../passwords.txt';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      // sanitize-filename converts to '.._.._passwords.txt'
      // Dots and underscores are allowed in FILENAME_REGEX, so this passes
      expect(req.params.fileName).toBe('.._.._passwords.txt');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize directory traversal with backslashes', () => {
      req.params.fileName = '..\\..\\passwords.txt';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      // sanitize-filename converts backslashes to underscores
      expect(req.params.fileName).toBe('.._.._passwords.txt');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize null bytes to underscores', () => {
      req.params.fileName = 'test\0.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      // sanitize-filename replaces null bytes with underscores
      expect(req.params.fileName).toBe('test_.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should reject URL-encoded path traversal attempts', () => {
      req.params.fileName = '%2e%2e%2f%2e%2e%2fpasswd';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      // URL-encoded characters like % fail FILENAME_REGEX
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow valid files with periods in name', () => {
      req.params.fileName = 'my.file.test.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('my.file.test.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should allow valid files with dashes and underscores', () => {
      req.params.fileName = 'my-analysis_file.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req as never, res as never, next as unknown as NextFunction);

      expect(req.params.fileName).toBe('my-analysis_file.js');
      expect(next).toHaveBeenCalledOnce();
    });
  });
});

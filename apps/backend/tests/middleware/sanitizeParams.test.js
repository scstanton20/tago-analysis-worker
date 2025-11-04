import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeFilenameParam,
  sanitizeFilenameParams,
} from '../../src/middleware/sanitizeParams.js';

describe('sanitizeParams Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      path: '/api/test',
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  describe('sanitizeFilenameParam', () => {
    it('should sanitize valid filename and call next()', () => {
      req.params.fileName = 'test-analysis.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      expect(req.params.fileName).toBe('test-analysis.js');
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should sanitize filename with special characters', () => {
      req.params.fileName = 'my:analysis*.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      // sanitize-filename replaces invalid chars with _
      expect(req.params.fileName).toBe('my_analysis_.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize filename with path traversal attempt', () => {
      req.params.fileName = '../../../etc/passwd';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      // sanitize-filename converts slashes and dots to underscores
      expect(req.params.fileName).toBe('.._.._.._etc_passwd');
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject empty filename', () => {
      req.params.fileName = '';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

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
      middleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle different parameter names', () => {
      req.params.newFileName = 'renamed.js';

      const middleware = sanitizeFilenameParam('newFileName');
      middleware(req, res, next);

      expect(req.params.newFileName).toBe('renamed.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should reject null filename', () => {
      req.params.fileName = null;

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject non-string filename', () => {
      req.params.fileName = 123;

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should sanitize filename with only dots', () => {
      req.params.fileName = '...'; // becomes underscore after sanitization

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      // sanitize-filename converts ... to _
      expect(req.params.fileName).toBe('_');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should default to fileName parameter when no param name provided', () => {
      req.params.fileName = 'test.js';

      const middleware = sanitizeFilenameParam(); // no param name
      middleware(req, res, next);

      expect(req.params.fileName).toBe('test.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should include error details in response', () => {
      req.params.fileName = 123;

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

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
      middleware(req, res, next);

      expect(req.params.fileName).toBe('source.js');
      expect(req.params.newFileName).toBe('target.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize all params with special characters', () => {
      req.params.fileName = 'file:1.js';
      req.params.newFileName = 'file|2.js';

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req, res, next);

      expect(req.params.fileName).toBe('file_1.js');
      expect(req.params.newFileName).toBe('file_2.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize params with path traversal', () => {
      req.params.fileName = 'valid.js';
      req.params.newFileName = '../invalid.js';

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req, res, next);

      expect(req.params.fileName).toBe('valid.js');
      expect(req.params.newFileName).toBe('.._invalid.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should handle missing params gracefully', () => {
      req.params.fileName = 'test.js';
      // newFileName is undefined

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req, res, next);

      expect(req.params.fileName).toBe('test.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should work with single param', () => {
      req.params.fileName = 'single.js';

      const middleware = sanitizeFilenameParams('fileName');
      middleware(req, res, next);

      expect(req.params.fileName).toBe('single.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should work with three or more params', () => {
      req.params.file1 = 'a.js';
      req.params.file2 = 'b.js';
      req.params.file3 = 'c.js';

      const middleware = sanitizeFilenameParams('file1', 'file2', 'file3');
      middleware(req, res, next);

      expect(req.params.file1).toBe('a.js');
      expect(req.params.file2).toBe('b.js');
      expect(req.params.file3).toBe('c.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should reject when validation fails (null value)', () => {
      req.params.fileName = null;
      req.params.newFileName = 'good.js';

      const middleware = sanitizeFilenameParams('fileName', 'newFileName');
      middleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid filename',
          details: expect.any(String),
        }),
      );
    });
  });

  describe('security tests', () => {
    it('should sanitize directory traversal with dots', () => {
      req.params.fileName = '..';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      // sanitize-filename converts .. to _
      expect(req.params.fileName).toBe('_');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize directory traversal with forward slashes', () => {
      req.params.fileName = '../../passwords.txt';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      // sanitize-filename converts path traversal to safe filename
      expect(req.params.fileName).toBe('.._.._passwords.txt');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should sanitize directory traversal with backslashes', () => {
      req.params.fileName = '..\\..\\passwords.txt';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      // sanitize-filename converts backslashes and path traversal
      expect(req.params.fileName).not.toContain('\\');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should prevent null byte injection', () => {
      req.params.fileName = 'test\0.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      // sanitize-filename should handle this
      expect(req.params.fileName).not.toContain('\0');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should handle URL-encoded path traversal attempts', () => {
      req.params.fileName = '%2e%2e%2f%2e%2e%2fpasswd';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      // After sanitization, should not contain path traversal
      expect(req.params.fileName).not.toMatch(/\.\./);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should allow valid files with periods in name', () => {
      req.params.fileName = 'my.file.test.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      expect(req.params.fileName).toBe('my.file.test.js');
      expect(next).toHaveBeenCalledOnce();
    });

    it('should allow valid files with dashes and underscores', () => {
      req.params.fileName = 'my-analysis_file.js';

      const middleware = sanitizeFilenameParam('fileName');
      middleware(req, res, next);

      expect(req.params.fileName).toBe('my-analysis_file.js');
      expect(next).toHaveBeenCalledOnce();
    });
  });
});

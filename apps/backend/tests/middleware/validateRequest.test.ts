import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { z } from 'zod';
import type { NextFunction } from 'express';
import {
  createControllerRequest,
  createControllerResponse,
  createMockNext,
  type MockRequest,
  type MockResponse,
} from '../utils/testHelpers.ts';

// Define schema types for validateRequest
type ValidationSchema = {
  body?: z.ZodType | { safeParse: (data: unknown) => unknown };
  query?: z.ZodType;
  params?: z.ZodType;
};

// Define validateRequest function type
type ValidateRequestFn = (
  schema: ValidationSchema,
) => (req: MockRequest, res: MockResponse, next: Mock<NextFunction>) => void;

describe('validateRequest middleware', () => {
  let validateRequest: ValidateRequestFn;
  let req: MockRequest;
  let res: MockResponse;
  let next: Mock<NextFunction>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/middleware/validateRequest.ts');
    validateRequest = module.validateRequest as unknown as ValidateRequestFn;

    req = createControllerRequest();
    res = createControllerResponse();
    next = createMockNext();
  });

  describe('body validation', () => {
    it('should validate body successfully and call next', () => {
      const schema: ValidationSchema = {
        body: z.object({
          name: z.string(),
          age: z.number(),
        }),
      };

      req.body = { name: 'John', age: 30 };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'John', age: 30 });
    });

    it('should reject invalid body and return 400', () => {
      const schema: ValidationSchema = {
        body: z.object({
          name: z.string(),
          age: z.number(),
        }),
      };

      req.body = { name: 'John', age: 'invalid' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INVALID_REQUEST_BODY',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'age',
            message: expect.any(String),
            code: expect.any(String),
          }),
        ]),
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalled();
    });

    it('should handle missing required fields in body', () => {
      const schema: ValidationSchema = {
        body: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      };

      req.body = { name: 'John' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INVALID_REQUEST_BODY',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'email',
            code: expect.any(String),
          }),
        ]),
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should sanitize and transform body data', () => {
      const schema: ValidationSchema = {
        body: z.object({
          name: z.string().trim(),
          age: z.string().transform((val) => parseInt(val, 10)),
        }),
      };

      req.body = { name: '  John  ', age: '30' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'John', age: 30 });
    });

    it('should handle nested validation errors in body', () => {
      const schema: ValidationSchema = {
        body: z.object({
          user: z.object({
            name: z.string(),
            profile: z.object({
              age: z.number(),
            }),
          }),
        }),
      };

      req.body = { user: { name: 'John', profile: { age: 'invalid' } } };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INVALID_REQUEST_BODY',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'user.profile.age',
          }),
        ]),
      });
    });

    it('should handle array validation in body', () => {
      const schema: ValidationSchema = {
        body: z.object({
          items: z.array(z.string()),
        }),
      };

      req.body = { items: ['valid', 123, 'another'] };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INVALID_REQUEST_BODY',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'items.1',
          }),
        ]),
      });
    });
  });

  describe('query validation', () => {
    it('should validate query successfully and call next', () => {
      const schema: ValidationSchema = {
        query: z.object({
          page: z.string(),
          limit: z.string(),
        }),
      };

      req.query = { page: '1', limit: '10' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.query).toEqual({ page: '1', limit: '10' });
    });

    it('should reject invalid query and return 400', () => {
      const schema: ValidationSchema = {
        query: z.object({
          page: z.string().regex(/^\d+$/),
          limit: z.string().regex(/^\d+$/),
        }),
      };

      req.query = { page: 'invalid', limit: '10' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INVALID_QUERY_PARAMETERS',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'page',
            message: expect.any(String),
            code: expect.any(String),
          }),
        ]),
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalled();
    });

    it('should transform query parameters', () => {
      const schema: ValidationSchema = {
        query: z.object({
          page: z.string().transform((val) => parseInt(val, 10)),
          enabled: z
            .string()
            .transform((val) => val === 'true')
            .optional(),
        }),
      };

      req.query = { page: '5', enabled: 'true' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.query).toEqual({ page: 5, enabled: true });
    });

    it('should handle optional query parameters', () => {
      const schema: ValidationSchema = {
        query: z.object({
          search: z.string().optional(),
          filter: z.string().optional(),
        }),
      };

      req.query = {};
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('params validation', () => {
    it('should validate params successfully and call next', () => {
      const schema: ValidationSchema = {
        params: z.object({
          id: z.string(),
        }),
      };

      req.params = { id: '123' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.params).toEqual({ id: '123' });
    });

    it('should reject invalid params and return 400', () => {
      const schema: ValidationSchema = {
        params: z.object({
          id: z.string().uuid(),
        }),
      };

      req.params = { id: 'not-a-uuid' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INVALID_ROUTE_PARAMETERS',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'id',
            message: expect.any(String),
            code: expect.any(String),
          }),
        ]),
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalled();
    });

    it('should transform params', () => {
      const schema: ValidationSchema = {
        params: z.object({
          fileName: z.string().transform((val) => val.toLowerCase()),
        }),
      };

      req.params = { fileName: 'TEST.JS' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.params).toEqual({ fileName: 'test.js' });
    });
  });

  describe('combined validation', () => {
    it('should validate body, query, and params together', () => {
      const schema: ValidationSchema = {
        body: z.object({ name: z.string() }),
        query: z.object({ filter: z.string() }),
        params: z.object({ id: z.string() }),
      };

      req.body = { name: 'John' };
      req.query = { filter: 'active' };
      req.params = { id: '123' };

      const middleware = validateRequest(schema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail on first validation error (body)', () => {
      const schema: ValidationSchema = {
        body: z.object({ name: z.string() }),
        query: z.object({ filter: z.string() }),
        params: z.object({ id: z.string() }),
      };

      req.body = { name: 123 }; // Invalid
      req.query = { filter: 'active' };
      req.params = { id: '123' };

      const middleware = validateRequest(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_REQUEST_BODY',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should fail on query validation after body passes', () => {
      const schema: ValidationSchema = {
        body: z.object({ name: z.string() }),
        query: z.object({ page: z.string().regex(/^\d+$/) }),
      };

      req.body = { name: 'John' };
      req.query = { page: 'invalid' };

      const middleware = validateRequest(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_QUERY_PARAMETERS',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should fail on params validation after body and query pass', () => {
      const schema: ValidationSchema = {
        body: z.object({ name: z.string() }),
        query: z.object({ filter: z.string() }),
        params: z.object({ id: z.string().uuid() }),
      };

      req.body = { name: 'John' };
      req.query = { filter: 'active' };
      req.params = { id: 'not-a-uuid' };

      const middleware = validateRequest(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_ROUTE_PARAMETERS',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('no schema validation', () => {
    it('should call next when no validation schemas provided', () => {
      const schema: ValidationSchema = {};
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should only validate provided schemas', () => {
      const schema: ValidationSchema = {
        body: z.object({ name: z.string() }),
      };

      req.body = { name: 'John' };
      req.query = { anything: 'goes' };
      req.params = { anything: 'goes' };

      const middleware = validateRequest(schema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors gracefully', () => {
      const schema: ValidationSchema = {
        body: {
          safeParse: () => {
            throw new Error('Unexpected error');
          },
        },
      };

      const middleware = validateRequest(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.error).toHaveBeenCalled();
    });

    it('should work without logger', () => {
      const schema: ValidationSchema = {
        body: z.object({ name: z.string() }),
      };

      req.body = { name: 123 };
      (req as unknown as { log: null }).log = null;

      const middleware = validateRequest(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty body validation', () => {
      const schema: ValidationSchema = {
        body: z.object({}),
      };

      req.body = {};
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle strict schemas that reject extra fields', () => {
      const schema: ValidationSchema = {
        body: z
          .object({
            name: z.string(),
          })
          .strict(),
      };

      req.body = { name: 'John', extra: 'field' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_REQUEST_BODY',
        }),
      );
    });

    it('should handle default values in schema', () => {
      const schema: ValidationSchema = {
        body: z.object({
          name: z.string(),
          active: z.boolean().default(true),
        }),
      };

      req.body = { name: 'John' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'John', active: true });
    });

    it('should handle refinements in schema', () => {
      const schema: ValidationSchema = {
        body: z
          .object({
            password: z.string(),
            confirmPassword: z.string(),
          })
          .refine((data) => data.password === data.confirmPassword, {
            message: 'Passwords must match',
            path: ['confirmPassword'],
          }),
      };

      req.body = { password: 'test123', confirmPassword: 'different' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INVALID_REQUEST_BODY',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'confirmPassword',
            message: 'Passwords must match',
          }),
        ]),
      });
    });

    it('should handle multiple validation errors', () => {
      const schema: ValidationSchema = {
        body: z.object({
          name: z.string(),
          email: z.string().email(),
          age: z.number().positive(),
        }),
      };

      req.body = { name: 123, email: 'not-an-email', age: -5 };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INVALID_REQUEST_BODY',
        details: expect.arrayContaining([
          expect.objectContaining({ path: 'name' }),
          expect.objectContaining({ path: 'email' }),
          expect.objectContaining({ path: 'age' }),
        ]),
      });
    });
  });

  describe('logging', () => {
    it('should log validation failures for body', () => {
      const schema: ValidationSchema = {
        body: z.object({ name: z.string() }),
      };

      req.body = { name: 123 };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'validateRequest',
          target: 'body',
          errors: expect.any(Array),
        }),
        'Request body validation failed',
      );
    });

    it('should log validation failures for query', () => {
      const schema: ValidationSchema = {
        query: z.object({ page: z.string().regex(/^\d+$/) }),
      };

      req.query = { page: 'invalid' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'validateRequest',
          target: 'query',
          errors: expect.any(Array),
        }),
        'Query parameters validation failed',
      );
    });

    it('should log validation failures for params', () => {
      const schema: ValidationSchema = {
        params: z.object({ id: z.string().uuid() }),
      };

      req.params = { id: 'not-a-uuid' };
      const middleware = validateRequest(schema);

      middleware(req, res, next);

      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'validateRequest',
          target: 'params',
          errors: expect.any(Array),
        }),
        'Route parameters validation failed',
      );
    });

    it('should log unexpected errors', () => {
      const schema: ValidationSchema = {
        body: {
          safeParse: () => {
            throw new Error('Unexpected');
          },
        },
      };

      const middleware = validateRequest(schema);
      middleware(req, res, next);

      expect(req.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
        }),
        'Unexpected error in validation middleware',
      );
    });
  });
});

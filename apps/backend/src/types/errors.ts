/**
 * Error and validation types for Express middleware.
 * Consolidated from duplicate definitions in errorHandler and validateRequest.
 */

import type { ZodType } from 'zod';

/**
 * Extended Error with HTTP status code for error handling middleware.
 */
export type AppError = Error & {
  /** HTTP status code to return */
  statusCode?: number;
  /** Error code (e.g., 'ENOENT', 'EACCES') */
  code?: string;
};

/**
 * Schema configuration for request validation middleware.
 * Defines Zod schemas for body, query, and params validation.
 */
export type ValidationSchema = {
  /** Schema for request body validation */
  body?: ZodType;
  /** Schema for query parameters validation */
  query?: ZodType;
  /** Schema for URL parameters validation */
  params?: ZodType;
};

/**
 * Validation error detail returned in API error responses.
 */
export type ValidationErrorDetail = {
  /** JSON path to the invalid field */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Zod error code */
  code: string;
};

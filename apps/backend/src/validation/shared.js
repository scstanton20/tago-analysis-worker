// validation/shared.js
// Centralized validation constants, patterns, and helpers
// This is the single source of truth for all validation logic in the backend

import { z } from 'zod';
import sanitize from 'sanitize-filename';

// ============================================================================
// FILENAME VALIDATION
// ============================================================================

/**
 * Shared filename validation regex pattern.
 * Only allows alphanumeric characters, spaces, hyphens, underscores, and periods.
 * @type {RegExp}
 */
export const FILENAME_REGEX = /^[a-zA-Z0-9_\-. ]+$/;

/**
 * Error message for invalid filenames.
 * @type {string}
 */
export const FILENAME_ERROR_MESSAGE =
  'Filename can only contain alphanumeric characters, spaces, hyphens, underscores, and periods';

/**
 * Validates a filename against the shared filename regex pattern.
 * @param {string} filename - The filename to validate
 * @returns {boolean} True if the filename is valid
 */
export function isValidFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename === '.' || filename === '..') return false;
  return FILENAME_REGEX.test(filename);
}

/**
 * Zod schema for filename validation.
 * Use this in route schemas for consistent validation.
 */
export const filenameSchema = z
  .string()
  .min(1, 'Filename is required')
  .regex(FILENAME_REGEX, FILENAME_ERROR_MESSAGE)
  .refine((val) => val !== '.' && val !== '..', 'Invalid filename');

/**
 * Sanitizes and validates a filename to prevent path traversal and invalid characters.
 * First applies sanitize-filename to handle dangerous characters, then validates
 * against the shared FILENAME_REGEX for consistent validation.
 *
 * @param {string} filename - The filename to sanitize and validate
 * @returns {string} The sanitized filename
 * @throws {Error} If the filename is invalid, becomes empty after sanitization,
 *                 or contains characters not allowed by FILENAME_REGEX
 */
export function sanitizeAndValidateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid filename');
  }

  // First, apply sanitize-filename to handle dangerous characters
  const sanitized = sanitize(filename, { replacement: '_' });

  if (
    !sanitized ||
    sanitized.length === 0 ||
    sanitized === '.' ||
    sanitized === '..'
  ) {
    throw new Error('Filename cannot be empty or invalid after sanitization');
  }

  // Then validate against the shared regex for consistent validation
  if (!isValidFilename(sanitized)) {
    throw new Error(FILENAME_ERROR_MESSAGE);
  }

  return sanitized;
}

/**
 * Validates an analysis name to ensure it's safe for use in paths.
 * Uses isValidFilename for consistent validation across the application.
 * @param {string} name - Analysis name to validate
 * @returns {boolean} True if name is safe
 */
export function isAnalysisNameSafe(name) {
  return isValidFilename(name);
}

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

/**
 * Schema for page query parameter.
 * Accepts string from query params, transforms to number.
 */
export const pageSchema = z
  .string()
  .regex(/^\d+$/, 'Page must be a valid positive integer')
  .transform((val) => parseInt(val, 10))
  .optional();

/**
 * Schema for limit query parameter.
 * Accepts string from query params, transforms to number.
 */
export const limitSchema = z
  .string()
  .regex(/^\d+$/, 'Limit must be a valid positive integer')
  .transform((val) => parseInt(val, 10))
  .optional();

/**
 * Schema for limit with bounds (1-1000).
 * Use for endpoints that need stricter limits.
 */
export const boundedLimitSchema = z
  .string()
  .regex(/^\d+$/, 'Limit must be a valid positive integer')
  .transform((val) => parseInt(val, 10))
  .refine((val) => val >= 1 && val <= 1000, 'Limit must be between 1 and 1000')
  .optional();

// ============================================================================
// ID SCHEMAS
// ============================================================================

/**
 * Creates a required ID schema with custom field name.
 * @param {string} fieldName - Name of the field for error message
 * @returns {z.ZodString} Zod string schema
 */
export const requiredId = (fieldName) =>
  z.string().min(1, `${fieldName} is required`);

// ============================================================================
// COLOR SCHEMAS
// ============================================================================

/**
 * Schema for hex color validation (#RRGGBB format).
 */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
  .optional();

// ============================================================================
// UTILITY SCHEMAS
// ============================================================================

/**
 * Empty strict object schema for endpoints with no parameters.
 * Rejects any unexpected fields.
 */
export const emptyStrictSchema = z.object({}).strict();

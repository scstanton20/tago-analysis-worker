import { describe, it, expect } from 'vitest';
import {
  FILENAME_REGEX,
  FILENAME_ERROR_MESSAGE,
  isValidFilename,
  filenameSchema,
  sanitizeAndValidateFilename,
  isAnalysisNameSafe,
  pageSchema,
  limitSchema,
  boundedLimitSchema,
  requiredId,
  hexColorSchema,
  emptyStrictSchema,
} from '../../src/validation/shared.ts';

describe('shared validation utilities', () => {
  describe('FILENAME_REGEX', () => {
    it('should match valid filenames', () => {
      expect(FILENAME_REGEX.test('valid-file')).toBe(true);
      expect(FILENAME_REGEX.test('valid_file')).toBe(true);
      expect(FILENAME_REGEX.test('valid.file')).toBe(true);
      expect(FILENAME_REGEX.test('valid file')).toBe(true);
      expect(FILENAME_REGEX.test('ValidFile123')).toBe(true);
    });

    it('should reject invalid filenames', () => {
      expect(FILENAME_REGEX.test('../path')).toBe(false);
      expect(FILENAME_REGEX.test('path/file')).toBe(false);
      expect(FILENAME_REGEX.test('file@name')).toBe(false);
      expect(FILENAME_REGEX.test('file#name')).toBe(false);
    });
  });

  describe('FILENAME_ERROR_MESSAGE', () => {
    it('should be a descriptive error message', () => {
      expect(FILENAME_ERROR_MESSAGE).toContain('alphanumeric');
      expect(FILENAME_ERROR_MESSAGE).toContain('hyphens');
      expect(FILENAME_ERROR_MESSAGE).toContain('underscores');
    });
  });

  describe('isValidFilename', () => {
    it('should return true for valid filenames', () => {
      expect(isValidFilename('valid-file')).toBe(true);
      expect(isValidFilename('valid_file.txt')).toBe(true);
      expect(isValidFilename('My File 123')).toBe(true);
    });

    it('should return false for null/undefined', () => {
      expect(isValidFilename(null)).toBe(false);
      expect(isValidFilename(undefined)).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isValidFilename(123)).toBe(false);
      expect(isValidFilename({})).toBe(false);
      expect(isValidFilename([])).toBe(false);
    });

    it('should return false for . and ..', () => {
      expect(isValidFilename('.')).toBe(false);
      expect(isValidFilename('..')).toBe(false);
    });

    it('should return false for path traversal', () => {
      expect(isValidFilename('../file')).toBe(false);
      expect(isValidFilename('path/to/file')).toBe(false);
    });
  });

  describe('filenameSchema', () => {
    it('should accept valid filenames', () => {
      const result = filenameSchema.safeParse('valid-file');
      expect(result.success).toBe(true);
    });

    it('should reject empty string', () => {
      const result = filenameSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject . and ..', () => {
      expect(filenameSchema.safeParse('.').success).toBe(false);
      expect(filenameSchema.safeParse('..').success).toBe(false);
    });

    it('should reject invalid characters', () => {
      const result = filenameSchema.safeParse('file@name');
      expect(result.success).toBe(false);
    });
  });

  describe('sanitizeAndValidateFilename', () => {
    it('should return sanitized valid filename', () => {
      expect(sanitizeAndValidateFilename('valid-file')).toBe('valid-file');
    });

    it('should sanitize dangerous characters', () => {
      // sanitize-filename replaces dangerous chars with _
      const result = sanitizeAndValidateFilename('file<>name');
      expect(result).toMatch(/^[a-zA-Z0-9_\-. ]+$/);
    });

    it('should throw for null/undefined', () => {
      expect(() => sanitizeAndValidateFilename(null)).toThrow(
        'Invalid filename',
      );
      expect(() => sanitizeAndValidateFilename(undefined)).toThrow(
        'Invalid filename',
      );
    });

    it('should throw for non-strings', () => {
      expect(() => sanitizeAndValidateFilename(123)).toThrow(
        'Invalid filename',
      );
    });

    it('should throw for empty string', () => {
      expect(() => sanitizeAndValidateFilename('')).toThrow('Invalid filename');
    });
  });

  describe('isAnalysisNameSafe', () => {
    it('should return true for valid names', () => {
      expect(isAnalysisNameSafe('my-analysis')).toBe(true);
      expect(isAnalysisNameSafe('Analysis_v2')).toBe(true);
    });

    it('should return false for invalid names', () => {
      expect(isAnalysisNameSafe('../malicious')).toBe(false);
      expect(isAnalysisNameSafe('path/to/analysis')).toBe(false);
    });

    it('should delegate to isValidFilename', () => {
      expect(isAnalysisNameSafe(null)).toBe(false);
      expect(isAnalysisNameSafe('')).toBe(false);
    });
  });

  describe('pageSchema', () => {
    it('should transform valid page string to number', () => {
      const result = pageSchema.safeParse('5');
      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
    });

    it('should accept undefined (optional)', () => {
      const result = pageSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should reject non-numeric strings', () => {
      const result = pageSchema.safeParse('abc');
      expect(result.success).toBe(false);
    });

    it('should reject negative numbers', () => {
      const result = pageSchema.safeParse('-5');
      expect(result.success).toBe(false);
    });

    it('should reject decimal numbers', () => {
      const result = pageSchema.safeParse('5.5');
      expect(result.success).toBe(false);
    });
  });

  describe('limitSchema', () => {
    it('should transform valid limit string to number', () => {
      const result = limitSchema.safeParse('100');
      expect(result.success).toBe(true);
      expect(result.data).toBe(100);
    });

    it('should accept undefined (optional)', () => {
      const result = limitSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should reject non-numeric strings', () => {
      const result = limitSchema.safeParse('xyz');
      expect(result.success).toBe(false);
    });
  });

  describe('boundedLimitSchema', () => {
    it('should accept valid limits within bounds', () => {
      expect(boundedLimitSchema.safeParse('1').success).toBe(true);
      expect(boundedLimitSchema.safeParse('500').success).toBe(true);
      expect(boundedLimitSchema.safeParse('1000').success).toBe(true);
    });

    it('should reject limits below 1', () => {
      const result = boundedLimitSchema.safeParse('0');
      expect(result.success).toBe(false);
    });

    it('should reject limits above 1000', () => {
      const result = boundedLimitSchema.safeParse('1001');
      expect(result.success).toBe(false);
    });

    it('should accept undefined (optional)', () => {
      const result = boundedLimitSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('requiredId', () => {
    it('should create schema requiring non-empty string', () => {
      const schema = requiredId('Team ID');
      expect(schema.safeParse('team-123').success).toBe(true);
    });

    it('should reject empty string with custom message', () => {
      const schema = requiredId('Team ID');
      const result = schema.safeParse('');
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Team ID');
    });

    it('should use custom field name in error message', () => {
      const schema = requiredId('Analysis ID');
      const result = schema.safeParse('');
      expect(result.error?.issues[0].message).toContain('Analysis ID');
    });
  });

  describe('hexColorSchema', () => {
    it('should accept valid 6-digit hex colors', () => {
      expect(hexColorSchema.safeParse('#FF5733').success).toBe(true);
      expect(hexColorSchema.safeParse('#00ff00').success).toBe(true);
      expect(hexColorSchema.safeParse('#123ABC').success).toBe(true);
    });

    it('should accept undefined (optional)', () => {
      const result = hexColorSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should reject 3-digit hex colors', () => {
      const result = hexColorSchema.safeParse('#F53');
      expect(result.success).toBe(false);
    });

    it('should reject colors without hash', () => {
      const result = hexColorSchema.safeParse('FF5733');
      expect(result.success).toBe(false);
    });

    it('should reject invalid hex characters', () => {
      const result = hexColorSchema.safeParse('#GHIJKL');
      expect(result.success).toBe(false);
    });

    it('should reject color names', () => {
      const result = hexColorSchema.safeParse('red');
      expect(result.success).toBe(false);
    });
  });

  describe('emptyStrictSchema', () => {
    it('should accept empty object', () => {
      const result = emptyStrictSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject object with any properties', () => {
      const result = emptyStrictSchema.safeParse({ unexpected: 'value' });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject multiple unexpected properties', () => {
      const result = emptyStrictSchema.safeParse({ a: 1, b: 2 });
      expect(result.success).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { sseValidationSchemas as schemas } from '../../src/validation/sseSchemas.ts';

describe('sseSchemas', () => {
  describe('subscribe schema', () => {
    it('should validate valid subscription data', () => {
      const validData = {
        sessionId: 'abc123xyz',
        analyses: ['analysis1.js', 'analysis2.js'],
      };

      const result = schemas.subscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate subscription with single analysis', () => {
      const validData = {
        sessionId: 'session-id',
        analyses: ['single-analysis.js'],
      };

      const result = schemas.subscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate subscription with many analyses', () => {
      const validData = {
        sessionId: 'session-id',
        analyses: Array.from({ length: 10 }, (_, i) => `analysis-${i}.js`),
      };

      const result = schemas.subscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject missing sessionId', () => {
      const invalidData = {
        analyses: ['analysis1.js'],
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0].path).toContain('sessionId');
      expect(result.error?.issues[0].message).toContain('expected string');
    });

    it('should reject empty sessionId', () => {
      const invalidData = {
        sessionId: '',
        analyses: ['analysis1.js'],
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('sessionId');
      expect(result.error?.issues[0].message).toBe('sessionId is required');
    });

    it('should reject missing analyses', () => {
      const invalidData = {
        sessionId: 'session-id',
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
    });

    it('should reject empty analyses array', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: [],
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
      expect(result.error?.issues[0].message).toBe(
        'At least one analysis ID must be provided',
      );
    });

    it('should reject analyses with empty string', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: ['analysis1.js', '', 'analysis2.js'],
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['analyses', 1]);
      expect(result.error?.issues[0].message).toBe('Analysis ID is required');
    });

    it('should reject analyses with non-string values', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: ['analysis1.js', 123, 'analysis2.js'],
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['analyses', 1]);
    });

    it('should reject non-array analyses', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: 'analysis1.js',
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
    });

    it('should reject null sessionId', () => {
      const invalidData = {
        sessionId: null,
        analyses: ['analysis1.js'],
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('sessionId');
    });

    it('should reject null analyses', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: null,
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
    });

    it('should reject extra unexpected fields', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: ['analysis1.js'],
        unexpectedField: 'value',
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      // Zod will strip unknown fields by default in strict mode
      // If your schema uses .strict(), this would fail
      // Otherwise it passes but strips the field
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });
  });

  describe('unsubscribe schema', () => {
    it('should validate valid unsubscription data', () => {
      const validData = {
        sessionId: 'abc123xyz',
        analyses: ['analysis1.js', 'analysis2.js'],
      };

      const result = schemas.unsubscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate unsubscription with single analysis', () => {
      const validData = {
        sessionId: 'session-id',
        analyses: ['single-analysis.js'],
      };

      const result = schemas.unsubscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate unsubscription with many analyses', () => {
      const validData = {
        sessionId: 'session-id',
        analyses: Array.from({ length: 10 }, (_, i) => `analysis-${i}.js`),
      };

      const result = schemas.unsubscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject missing sessionId', () => {
      const invalidData = {
        analyses: ['analysis1.js'],
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0].path).toContain('sessionId');
      expect(result.error?.issues[0].message).toContain('expected string');
    });

    it('should reject empty sessionId', () => {
      const invalidData = {
        sessionId: '',
        analyses: ['analysis1.js'],
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('sessionId');
      expect(result.error?.issues[0].message).toBe('sessionId is required');
    });

    it('should reject missing analyses', () => {
      const invalidData = {
        sessionId: 'session-id',
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
    });

    it('should reject empty analyses array', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: [],
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
      expect(result.error?.issues[0].message).toBe(
        'At least one analysis ID must be provided',
      );
    });

    it('should reject analyses with empty string', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: ['analysis1.js', '', 'analysis2.js'],
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['analyses', 1]);
      expect(result.error?.issues[0].message).toBe('Analysis ID is required');
    });

    it('should reject analyses with non-string values', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: ['analysis1.js', 123, 'analysis2.js'],
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['analyses', 1]);
    });

    it('should reject non-array analyses', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: 'analysis1.js',
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
    });

    it('should reject null sessionId', () => {
      const invalidData = {
        sessionId: null,
        analyses: ['analysis1.js'],
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('sessionId');
    });

    it('should reject null analyses', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: null,
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
    });

    it('should reject extra unexpected fields', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: ['analysis1.js'],
        unexpectedField: 'value',
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      // Zod will strip unknown fields by default in strict mode
      // If your schema uses .strict(), this would fail
      // Otherwise it passes but strips the field
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });
  });

  describe('schema consistency', () => {
    it('should have identical validation rules for subscribe and unsubscribe', () => {
      const testData = {
        sessionId: 'test-session',
        analyses: ['test-analysis.js'],
      };

      const subscribeResult = schemas.subscribe.body!.safeParse(testData);
      const unsubscribeResult = schemas.unsubscribe.body!.safeParse(testData);

      expect(subscribeResult.success).toBe(unsubscribeResult.success);
      expect(subscribeResult.success).toBe(true);
    });

    it('should fail consistently for both schemas with invalid data', () => {
      const invalidData = {
        sessionId: '',
        analyses: [],
      };

      const subscribeResult = schemas.subscribe.body!.safeParse(invalidData);
      const unsubscribeResult =
        schemas.unsubscribe.body!.safeParse(invalidData);

      expect(subscribeResult.success).toBe(false);
      expect(unsubscribeResult.success).toBe(false);
      expect(subscribeResult.error?.issues.length).toBe(
        unsubscribeResult.error?.issues.length,
      );
    });
  });

  describe('connectSSE schema', () => {
    it('should validate empty query object', () => {
      const validData = {};

      const result = schemas.connectSSE.query!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should reject query with any parameters (strict mode)', () => {
      const invalidData = { someParam: 'value' };

      const result = schemas.connectSSE.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject multiple unexpected parameters', () => {
      const invalidData = {
        param1: 'value1',
        param2: 'value2',
        param3: 'value3',
      };

      const result = schemas.connectSSE.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject sessionId parameter', () => {
      const invalidData = { sessionId: 'session-123' };

      const result = schemas.connectSSE.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject boolean parameters', () => {
      const invalidData = { enabled: true };

      const result = schemas.connectSSE.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject numeric parameters', () => {
      const invalidData = { count: 5 };

      const result = schemas.connectSSE.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });
  });
});

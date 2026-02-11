import { describe, it, expect } from 'vitest';
import { sseValidationSchemas as schemas } from '../../src/validation/sseSchemas.ts';

/** Valid UUID for test data */
const VALID_UUID_1 = '123e4567-e89b-12d3-a456-426614174000';
const VALID_UUID_2 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('sseSchemas', () => {
  describe('subscribe schema', () => {
    it('should validate valid subscription data', () => {
      const validData = {
        sessionId: 'abc123xyz',
        analyses: [VALID_UUID_1, VALID_UUID_2],
      };

      const result = schemas.subscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate subscription with single analysis', () => {
      const validData = {
        sessionId: 'session-id',
        analyses: [VALID_UUID_1],
      };

      const result = schemas.subscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate subscription with many analyses', () => {
      const validData = {
        sessionId: 'session-id',
        analyses: Array.from(
          { length: 10 },
          (_, i) =>
            `${i.toString(16).padStart(8, '0')}-0000-4000-a000-000000000000`,
        ),
      };

      const result = schemas.subscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject missing sessionId', () => {
      const invalidData = {
        analyses: [VALID_UUID_1],
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
        analyses: [VALID_UUID_1, '', VALID_UUID_2],
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['analyses', 1]);
    });

    it('should reject analyses with non-string values', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: [VALID_UUID_1, 123, VALID_UUID_2],
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['analyses', 1]);
    });

    it('should reject non-array analyses', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: VALID_UUID_1,
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
    });

    it('should reject null sessionId', () => {
      const invalidData = {
        sessionId: null,
        analyses: [VALID_UUID_1],
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
        analyses: [VALID_UUID_1],
        unexpectedField: 'value',
      };

      const result = schemas.subscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject analysis IDs with path traversal characters', () => {
      const pathTraversalAttempts = [
        '../../etc/passwd',
        '../secret',
        'analysis/../../../etc/shadow',
        'valid/../../escape',
      ];

      for (const maliciousId of pathTraversalAttempts) {
        const result = schemas.subscribe.body!.safeParse({
          sessionId: 'session-id',
          analyses: [maliciousId],
        });

        expect(result.success).toBe(false);
      }
    });

    it('should reject non-UUID analysis IDs', () => {
      const invalidIds = [
        'analysis1.js',
        'not-a-uuid',
        'my-analysis',
        'some-random-string',
      ];

      for (const invalidId of invalidIds) {
        const result = schemas.subscribe.body!.safeParse({
          sessionId: 'session-id',
          analyses: [invalidId],
        });

        expect(result.success).toBe(false);
      }
    });
  });

  describe('unsubscribe schema', () => {
    it('should validate valid unsubscription data', () => {
      const validData = {
        sessionId: 'abc123xyz',
        analyses: [VALID_UUID_1, VALID_UUID_2],
      };

      const result = schemas.unsubscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate unsubscription with single analysis', () => {
      const validData = {
        sessionId: 'session-id',
        analyses: [VALID_UUID_1],
      };

      const result = schemas.unsubscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate unsubscription with many analyses', () => {
      const validData = {
        sessionId: 'session-id',
        analyses: Array.from(
          { length: 10 },
          (_, i) =>
            `${i.toString(16).padStart(8, '0')}-0000-4000-a000-000000000000`,
        ),
      };

      const result = schemas.unsubscribe.body!.safeParse(validData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject missing sessionId', () => {
      const invalidData = {
        analyses: [VALID_UUID_1],
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
        analyses: [VALID_UUID_1, '', VALID_UUID_2],
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['analyses', 1]);
    });

    it('should reject analyses with non-string values', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: [VALID_UUID_1, 123, VALID_UUID_2],
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['analyses', 1]);
    });

    it('should reject non-array analyses', () => {
      const invalidData = {
        sessionId: 'session-id',
        analyses: VALID_UUID_1,
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('analyses');
    });

    it('should reject null sessionId', () => {
      const invalidData = {
        sessionId: null,
        analyses: [VALID_UUID_1],
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
        analyses: [VALID_UUID_1],
        unexpectedField: 'value',
      };

      const result = schemas.unsubscribe.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject analysis IDs with path traversal characters', () => {
      const pathTraversalAttempts = [
        '../../etc/passwd',
        '../secret',
        'analysis/../../../etc/shadow',
      ];

      for (const maliciousId of pathTraversalAttempts) {
        const result = schemas.unsubscribe.body!.safeParse({
          sessionId: 'session-id',
          analyses: [maliciousId],
        });

        expect(result.success).toBe(false);
      }
    });
  });

  describe('schema consistency', () => {
    it('should have identical validation rules for subscribe and unsubscribe', () => {
      const testData = {
        sessionId: 'test-session',
        analyses: [VALID_UUID_1],
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

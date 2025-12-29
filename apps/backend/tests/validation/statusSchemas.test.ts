import { describe, it, expect } from 'vitest';
import { statusValidationSchemas } from '../../src/validation/statusSchemas.ts';

describe('statusSchemas', () => {
  describe('getSystemStatus', () => {
    it('should accept empty query object', () => {
      const validData = {};

      const result =
        statusValidationSchemas.getSystemStatus.query.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject unexpected query parameters (strict mode)', () => {
      const invalidData = {
        unexpectedParam: 'value',
      };

      const result =
        statusValidationSchemas.getSystemStatus.query.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject multiple unexpected parameters', () => {
      const invalidData = {
        param1: 'value1',
        param2: 'value2',
      };

      const result =
        statusValidationSchemas.getSystemStatus.query.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });
});

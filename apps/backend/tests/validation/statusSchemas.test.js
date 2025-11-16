import { describe, it, expect, beforeEach } from 'vitest';

describe('statusSchemas', () => {
  let schemas;

  beforeEach(async () => {
    const module = await import('../../src/validation/statusSchemas.js');
    schemas = module.statusValidationSchemas;
  });

  describe('getSystemStatus schema', () => {
    describe('query validation', () => {
      it('should validate empty query object', () => {
        const validData = {};

        const result = schemas.getSystemStatus.query.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({});
      });

      it('should reject query with any parameters (strict mode)', () => {
        const invalidData = { someParam: 'value' };

        const result = schemas.getSystemStatus.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject multiple unexpected parameters', () => {
        const invalidData = {
          param1: 'value1',
          param2: 'value2',
          param3: 'value3',
        };

        const result = schemas.getSystemStatus.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject common query parameters', () => {
        const invalidData = { detailed: 'true', format: 'json' };

        const result = schemas.getSystemStatus.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject boolean parameters', () => {
        const invalidData = { includeMetrics: true };

        const result = schemas.getSystemStatus.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject numeric parameters', () => {
        const invalidData = { timeout: 5000 };

        const result = schemas.getSystemStatus.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject filter parameters', () => {
        const invalidData = { filter: 'health' };

        const result = schemas.getSystemStatus.query.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });
    });
  });
});

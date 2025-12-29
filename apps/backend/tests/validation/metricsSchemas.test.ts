import { describe, it, expect } from 'vitest';
import { metricsValidationSchemas as schemas } from '../../src/validation/metricsSchemas.ts';

describe('metricsSchemas', () => {
  describe('getMetrics schema', () => {
    describe('query validation', () => {
      it('should validate empty query object', () => {
        const validData = {};

        const result = schemas.getMetrics.query!.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({});
      });

      it('should reject query with any parameters (strict mode)', () => {
        const invalidData = { someParam: 'value' };

        const result = schemas.getMetrics.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject multiple unexpected parameters', () => {
        const invalidData = {
          param1: 'value1',
          param2: 'value2',
          param3: 'value3',
        };

        const result = schemas.getMetrics.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject Prometheus-specific query parameters', () => {
        const invalidData = { name: 'some_metric', format: 'text' };

        const result = schemas.getMetrics.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject filter parameters', () => {
        const invalidData = { filter: 'cpu_usage' };

        const result = schemas.getMetrics.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject boolean parameters', () => {
        const invalidData = { includeAll: true };

        const result = schemas.getMetrics.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject numeric parameters', () => {
        const invalidData = { limit: 100 };

        const result = schemas.getMetrics.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });

      it('should reject time range parameters', () => {
        const invalidData = { start: '2024-01-01', end: '2024-12-31' };

        const result = schemas.getMetrics.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].code).toBe('unrecognized_keys');
      });
    });
  });
});

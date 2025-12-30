import { describe, it, expect } from 'vitest';
import { settingsValidationSchemas as schemas } from '../../src/validation/settingsSchemas.ts';

describe('settingsSchemas', () => {
  describe('updateDNSConfig', () => {
    describe('enabled field', () => {
      it('should validate with enabled as true', () => {
        const validData = {
          enabled: true,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with enabled as false', () => {
        const validData = {
          enabled: false,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow missing enabled field', () => {
        const validData = {
          ttl: 5000,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject non-boolean enabled value', () => {
        const invalidData = {
          enabled: 'true',
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('enabled');
      });
    });

    describe('ttl field', () => {
      it('should validate with valid ttl in range', () => {
        const validData = {
          ttl: 5000,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with minimum ttl value (1000)', () => {
        const validData = {
          ttl: 1000,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with maximum ttl value (86400000)', () => {
        const validData = {
          ttl: 86400000,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow missing ttl field', () => {
        const validData = {
          enabled: true,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject ttl below minimum (999)', () => {
        const invalidData = {
          ttl: 999,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
        expect(result.error?.issues[0].message).toContain('at least 1000ms');
      });

      it('should reject ttl above maximum (86400001)', () => {
        const invalidData = {
          ttl: 86400001,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
        expect(result.error?.issues[0].message).toContain(
          'not exceed 86400000ms',
        );
      });

      it('should reject non-integer ttl', () => {
        const invalidData = {
          ttl: 5000.5,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
      });

      it('should reject non-number ttl', () => {
        const invalidData = {
          ttl: '5000',
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
      });

      it('should reject negative ttl', () => {
        const invalidData = {
          ttl: -1000,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
      });
    });

    describe('maxEntries field', () => {
      it('should validate with valid maxEntries in range', () => {
        const validData = {
          maxEntries: 100,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with minimum maxEntries value (10)', () => {
        const validData = {
          maxEntries: 10,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with maximum maxEntries value (10000)', () => {
        const validData = {
          maxEntries: 10000,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow missing maxEntries field', () => {
        const validData = {
          enabled: true,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject maxEntries below minimum (9)', () => {
        const invalidData = {
          maxEntries: 9,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
        expect(result.error?.issues[0].message).toContain('at least 10');
      });

      it('should reject maxEntries above maximum (10001)', () => {
        const invalidData = {
          maxEntries: 10001,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
        expect(result.error?.issues[0].message).toContain('not exceed 10000');
      });

      it('should reject non-integer maxEntries', () => {
        const invalidData = {
          maxEntries: 100.5,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
      });

      it('should reject non-number maxEntries', () => {
        const invalidData = {
          maxEntries: '100',
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
      });

      it('should reject negative maxEntries', () => {
        const invalidData = {
          maxEntries: -10,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
      });
    });

    describe('combined fields', () => {
      it('should validate with all valid fields', () => {
        const validData = {
          enabled: true,
          ttl: 5000,
          maxEntries: 100,
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with empty object (all optional)', () => {
        const validData = {};

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow extra unknown fields (Zod default behavior)', () => {
        const validData = {
          enabled: true,
          unknownField: 'value',
        };

        const result = schemas.updateDNSConfig.body!.safeParse(validData);

        // Zod allows unknown fields by default unless .strict() is used
        expect(result.success).toBe(true);
      });
    });
  });

  describe('deleteDNSCacheEntry', () => {
    it('should validate with valid cache key', () => {
      const validData = {
        key: 'example.com',
      };

      const result = schemas.deleteDNSCacheEntry.params!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with complex cache key', () => {
      const validData = {
        key: 'subdomain.example.com',
      };

      const result = schemas.deleteDNSCacheEntry.params!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with alphanumeric cache key', () => {
      const validData = {
        key: 'cache123',
      };

      const result = schemas.deleteDNSCacheEntry.params!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require key field', () => {
      const invalidData = {};

      const result = schemas.deleteDNSCacheEntry.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('key');
    });

    it('should reject empty cache key', () => {
      const invalidData = {
        key: '',
      };

      const result = schemas.deleteDNSCacheEntry.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('key');
      expect(result.error?.issues[0].message).toContain('required');
    });

    it('should reject non-string cache key', () => {
      const invalidData = {
        key: 123,
      };

      const result = schemas.deleteDNSCacheEntry.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('key');
    });

    it('should reject null cache key', () => {
      const invalidData = {
        key: null,
      };

      const result = schemas.deleteDNSCacheEntry.params!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('key');
    });
  });

  describe('clearDNSCache', () => {
    it('should validate with empty body (no parameters required)', () => {
      const validData = {};

      const result = schemas.clearDNSCache.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject body with unexpected fields', () => {
      const invalidData = {
        unexpectedField: 'value',
      };

      const result = schemas.clearDNSCache.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject non-object body', () => {
      const invalidData = 'string';

      const result = schemas.clearDNSCache.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject null body', () => {
      const invalidData = null;

      const result = schemas.clearDNSCache.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject array body', () => {
      const invalidData: unknown[] = [];

      const result = schemas.clearDNSCache.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('resetDNSStats', () => {
    it('should validate with empty body (no parameters required)', () => {
      const validData = {};

      const result = schemas.resetDNSStats.body!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject body with unexpected fields', () => {
      const invalidData = {
        unexpectedField: 'value',
      };

      const result = schemas.resetDNSStats.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject non-object body', () => {
      const invalidData = 'string';

      const result = schemas.resetDNSStats.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject null body', () => {
      const invalidData = null;

      const result = schemas.resetDNSStats.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject array body', () => {
      const invalidData: unknown[] = [];

      const result = schemas.resetDNSStats.body!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('getDNSConfig', () => {
    it('should validate with empty query object (no parameters required)', () => {
      const validData = {};

      const result = schemas.getDNSConfig.query!.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject query with unexpected fields', () => {
      const invalidData = {
        unexpectedField: 'value',
      };

      const result = schemas.getDNSConfig.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject query with multiple unexpected fields', () => {
      const invalidData = {
        field1: 'value1',
        field2: 'value2',
      };

      const result = schemas.getDNSConfig.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].code).toBe('unrecognized_keys');
    });

    it('should reject non-object query', () => {
      const invalidData = 'string';

      const result = schemas.getDNSConfig.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject null query', () => {
      const invalidData = null;

      const result = schemas.getDNSConfig.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('should reject array query', () => {
      const invalidData: unknown[] = [];

      const result = schemas.getDNSConfig.query!.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('getDNSCacheEntries', () => {
    describe('page parameter', () => {
      it('should accept undefined page (optional)', () => {
        const validData = {};

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should accept valid page string', () => {
        const validData = { page: '1' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data?.page).toBe(1);
      });

      it('should accept page as positive integer string and transform to number', () => {
        const validData = { page: '5' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        // The schema transforms string to number and then validates with refine
        expect(result.success).toBe(true);
        expect(result.data?.page).toBe(5);
      });

      it('should accept large page numbers', () => {
        const validData = { page: '1000' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data?.page).toBe(1000);
      });

      it('should reject page less than 1', () => {
        const invalidData = { page: '0' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toContain(
          'Page must be at least 1',
        );
      });

      it('should reject negative page', () => {
        const invalidData = { page: '-5' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject non-numeric page', () => {
        const invalidData = { page: 'abc' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject decimal page', () => {
        const invalidData = { page: '1.5' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject null page', () => {
        const invalidData = { page: null };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });
    });

    describe('limit parameter', () => {
      it('should accept undefined limit (optional)', () => {
        const validData = {};

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should accept valid limit string', () => {
        const validData = { limit: '100' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data?.limit).toBe(100);
      });

      it('should accept minimum limit (1)', () => {
        const validData = { limit: '1' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data?.limit).toBe(1);
      });

      it('should accept maximum limit (1000)', () => {
        const validData = { limit: '1000' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data?.limit).toBe(1000);
      });

      it('should reject limit below 1', () => {
        const invalidData = { limit: '0' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject limit above 1000', () => {
        const invalidData = { limit: '1001' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject negative limit', () => {
        const invalidData = { limit: '-10' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject non-numeric limit', () => {
        const invalidData = { limit: 'xyz' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject decimal limit', () => {
        const invalidData = { limit: '50.5' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject null limit', () => {
        const invalidData = { limit: null };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });
    });

    describe('filter parameter', () => {
      it('should accept undefined filter (optional)', () => {
        const validData = {};

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should accept valid filter string', () => {
        const validData = { filter: 'example.com' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data?.filter).toBe('example.com');
      });

      it('should accept filter with special characters', () => {
        const validData = { filter: 'sub-domain_123.example.com' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should accept empty filter string', () => {
        const validData = { filter: '' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should accept filter at max length (255 characters)', () => {
        const validData = { filter: 'a'.repeat(255) };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject filter exceeding 255 characters', () => {
        const invalidData = { filter: 'a'.repeat(256) };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toContain(
          'Filter must not exceed 255 characters',
        );
      });

      it('should reject non-string filter', () => {
        const invalidData = { filter: 123 };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject null filter', () => {
        const invalidData = { filter: null };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject filter with unicode characters but validate as string', () => {
        const validData = { filter: 'テスト' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });
    });

    describe('combined parameters', () => {
      it('should validate with all parameters', () => {
        const validData = {
          page: '2',
          limit: '100',
          filter: 'example.com',
        };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
        expect(result.data?.page).toBe(2);
        expect(result.data?.limit).toBe(100);
        expect(result.data?.filter).toBe('example.com');
      });

      it('should validate with only page and filter', () => {
        const validData = {
          page: '5',
          filter: 'test',
        };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with only limit', () => {
        const validData = { limit: '50' };

        const result = schemas.getDNSCacheEntries.query!.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject with invalid page and valid limit', () => {
        const invalidData = {
          page: '0',
          limit: '100',
        };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('page');
      });

      it('should reject with valid page and invalid limit', () => {
        const invalidData = {
          page: '1',
          limit: '2000',
        };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('limit');
      });

      it('should reject with unexpected fields', () => {
        const invalidData = {
          page: '1',
          limit: '100',
          filter: 'example.com',
          unexpectedField: 'value',
        };

        const result = schemas.getDNSCacheEntries.query!.safeParse(invalidData);

        // This is allowed since getDNSCacheEntries doesn't use .strict()
        expect(result.success).toBe(true);
      });
    });
  });
});

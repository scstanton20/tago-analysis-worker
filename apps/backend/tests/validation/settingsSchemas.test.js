import { describe, it, expect, beforeEach } from 'vitest';

describe('settingsSchemas', () => {
  let schemas;

  beforeEach(async () => {
    const module = await import('../../src/validation/settingsSchemas.js');
    schemas = module.settingsValidationSchemas;
  });

  describe('updateDNSConfig', () => {
    describe('enabled field', () => {
      it('should validate with enabled as true', () => {
        const validData = {
          enabled: true,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with enabled as false', () => {
        const validData = {
          enabled: false,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow missing enabled field', () => {
        const validData = {
          ttl: 5000,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject non-boolean enabled value', () => {
        const invalidData = {
          enabled: 'true',
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('enabled');
      });
    });

    describe('ttl field', () => {
      it('should validate with valid ttl in range', () => {
        const validData = {
          ttl: 5000,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with minimum ttl value (1000)', () => {
        const validData = {
          ttl: 1000,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with maximum ttl value (86400000)', () => {
        const validData = {
          ttl: 86400000,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow missing ttl field', () => {
        const validData = {
          enabled: true,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject ttl below minimum (999)', () => {
        const invalidData = {
          ttl: 999,
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
        expect(result.error?.issues[0].message).toContain('at least 1000ms');
      });

      it('should reject ttl above maximum (86400001)', () => {
        const invalidData = {
          ttl: 86400001,
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

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

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
      });

      it('should reject non-number ttl', () => {
        const invalidData = {
          ttl: '5000',
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
      });

      it('should reject negative ttl', () => {
        const invalidData = {
          ttl: -1000,
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('ttl');
      });
    });

    describe('maxEntries field', () => {
      it('should validate with valid maxEntries in range', () => {
        const validData = {
          maxEntries: 100,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with minimum maxEntries value (10)', () => {
        const validData = {
          maxEntries: 10,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with maximum maxEntries value (10000)', () => {
        const validData = {
          maxEntries: 10000,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow missing maxEntries field', () => {
        const validData = {
          enabled: true,
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should reject maxEntries below minimum (9)', () => {
        const invalidData = {
          maxEntries: 9,
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
        expect(result.error?.issues[0].message).toContain('at least 10');
      });

      it('should reject maxEntries above maximum (10001)', () => {
        const invalidData = {
          maxEntries: 10001,
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
        expect(result.error?.issues[0].message).toContain('not exceed 10000');
      });

      it('should reject non-integer maxEntries', () => {
        const invalidData = {
          maxEntries: 100.5,
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
      });

      it('should reject non-number maxEntries', () => {
        const invalidData = {
          maxEntries: '100',
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toContain('maxEntries');
      });

      it('should reject negative maxEntries', () => {
        const invalidData = {
          maxEntries: -10,
        };

        const result = schemas.updateDNSConfig.body.safeParse(invalidData);

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

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should validate with empty object (all optional)', () => {
        const validData = {};

        const result = schemas.updateDNSConfig.body.safeParse(validData);

        expect(result.success).toBe(true);
      });

      it('should allow extra unknown fields (Zod default behavior)', () => {
        const validData = {
          enabled: true,
          unknownField: 'value',
        };

        const result = schemas.updateDNSConfig.body.safeParse(validData);

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

      const result = schemas.deleteDNSCacheEntry.params.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with complex cache key', () => {
      const validData = {
        key: 'subdomain.example.com',
      };

      const result = schemas.deleteDNSCacheEntry.params.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should validate with alphanumeric cache key', () => {
      const validData = {
        key: 'cache123',
      };

      const result = schemas.deleteDNSCacheEntry.params.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should require key field', () => {
      const invalidData = {};

      const result = schemas.deleteDNSCacheEntry.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('key');
    });

    it('should reject empty cache key', () => {
      const invalidData = {
        key: '',
      };

      const result = schemas.deleteDNSCacheEntry.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('key');
      expect(result.error?.issues[0].message).toContain('required');
    });

    it('should reject non-string cache key', () => {
      const invalidData = {
        key: 123,
      };

      const result = schemas.deleteDNSCacheEntry.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('key');
    });

    it('should reject null cache key', () => {
      const invalidData = {
        key: null,
      };

      const result = schemas.deleteDNSCacheEntry.params.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('key');
    });
  });
});

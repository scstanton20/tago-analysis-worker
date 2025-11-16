// validation/settingsSchemas.js
import { z } from 'zod';
import { DNS_CACHE } from '../constants.js';

export const settingsValidationSchemas = {
  /**
   * PUT /api/settings/dns/config - Update DNS configuration
   */
  updateDNSConfig: {
    body: z.object({
      enabled: z.boolean().optional(),
      ttl: z
        .number()
        .int()
        .min(
          DNS_CACHE.TTL_MIN_MS,
          `TTL must be at least ${DNS_CACHE.TTL_MIN_MS}ms (1 second)`,
        )
        .max(
          DNS_CACHE.TTL_MAX_MS,
          `TTL must not exceed ${DNS_CACHE.TTL_MAX_MS}ms (24 hours)`,
        )
        .optional(),
      maxEntries: z
        .number()
        .int()
        .min(
          DNS_CACHE.MAX_ENTRIES_MIN,
          `Max entries must be at least ${DNS_CACHE.MAX_ENTRIES_MIN}`,
        )
        .max(
          DNS_CACHE.MAX_ENTRIES_MAX,
          `Max entries must not exceed ${DNS_CACHE.MAX_ENTRIES_MAX}`,
        )
        .optional(),
    }),
  },

  /**
   * DELETE /api/settings/dns/cache/:key - Delete DNS cache entry
   */
  deleteDNSCacheEntry: {
    params: z.object({
      key: z.string().min(1, 'Cache key is required'),
    }),
  },

  /**
   * DELETE /api/settings/dns/cache - Clear entire DNS cache
   * No parameters required, but validates against unexpected fields
   */
  clearDNSCache: {
    body: z.object({}).strict(),
  },

  /**
   * POST /api/settings/dns/stats/reset - Reset DNS statistics
   * No parameters required, but validates against unexpected fields
   */
  resetDNSStats: {
    body: z.object({}).strict(),
  },

  /**
   * GET /api/settings/dns/config - Get DNS cache configuration
   * No query parameters expected, but validates against unexpected fields
   */
  getDNSConfig: {
    query: z.object({}).strict(),
  },

  /**
   * GET /api/settings/dns/entries - Get DNS cache entries with optional pagination and filtering
   * Supports pagination (page, limit) and optional filter parameters
   */
  getDNSCacheEntries: {
    query: z.object({
      page: z
        .string()
        .regex(/^\d+$/, 'Page must be a valid positive integer')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, 'Page must be at least 1')
        .optional(),
      limit: z
        .string()
        .regex(/^\d+$/, 'Limit must be a valid positive integer')
        .transform((val) => parseInt(val, 10))
        .refine(
          (val) => val >= 1 && val <= 1000,
          'Limit must be between 1 and 1000',
        )
        .optional(),
      filter: z
        .string()
        .max(255, 'Filter must not exceed 255 characters')
        .optional(),
    }),
  },
};

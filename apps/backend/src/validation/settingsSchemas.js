// validation/settingsSchemas.js
import { z } from 'zod';

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
        .min(0, 'TTL must be a non-negative integer')
        .max(86400, 'TTL must not exceed 24 hours (86400 seconds)')
        .optional(),
      maxEntries: z
        .number()
        .int()
        .min(1, 'Max entries must be at least 1')
        .max(10000, 'Max entries must not exceed 10000')
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
};

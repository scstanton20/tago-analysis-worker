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
        .min(1000, 'TTL must be at least 1000ms (1 second)')
        .max(86400000, 'TTL must not exceed 86400000ms (24 hours)')
        .optional(),
      maxEntries: z
        .number()
        .int()
        .min(10, 'Max entries must be at least 10')
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

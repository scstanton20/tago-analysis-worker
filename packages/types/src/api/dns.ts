/**
 * DNS Cache API Types
 *
 * Request/response types for DNS cache management endpoints.
 */

// Re-export base DNSCacheStats from SSE messages for convenience
export type { DNSCacheStats } from '../sse/messages.js';

// ============================================================================
// DNS CACHE CONFIGURATION
// ============================================================================

/** DNS cache configuration settings */
export type DNSCacheConfig = {
  enabled: boolean;
  ttl: number;
  maxEntries: number;
};

// ============================================================================
// DNS CACHE STATISTICS
// ============================================================================

/** Extended DNS cache statistics with error tracking */
export type DNSCacheExtendedStats = {
  hits: number;
  misses: number;
  errors: number;
  evictions: number;
};

/** Full DNS cache stats response */
export type DNSCacheFullStats = DNSCacheExtendedStats & {
  cacheSize: number;
  hitRate: number | string;
  ttlPeriodAge: number;
  ttlPeriodRemaining: number;
  ttlPeriodProgress: string;
};

// ============================================================================
// DNS CACHE ENTRIES
// ============================================================================

/** DNS lookup cache data */
export type DNSLookupCacheData = {
  address: string;
  family: number;
};

/** DNS resolve cache data */
export type DNSResolveCacheData = {
  addresses: Array<string>;
};

/** DNS cache entry for API response */
export type DNSCacheEntry = {
  key: string;
  data: DNSLookupCacheData | DNSResolveCacheData;
  timestamp: number;
  age: number;
  remainingTTL: number;
  expired: boolean;
  source?: string;
};

// ============================================================================
// DNS OPERATION RESULTS
// ============================================================================

/** DNS lookup operation result */
export type DNSLookupResult = {
  success: boolean;
  address?: string;
  family?: number;
  error?: string;
};

/** DNS resolve operation result */
export type DNSResolveResult = {
  success: boolean;
  addresses?: Array<string>;
  error?: string;
};

// ============================================================================
// PER-ANALYSIS DNS STATISTICS
// ============================================================================

/** Per-analysis DNS stats response */
export type AnalysisDNSStatsResponse = {
  hits: number;
  misses: number;
  errors: number;
  hitRate: number | string;
  hostnameCount: number;
  hostnames: Array<string>;
  cacheKeyCount: number;
};

// ============================================================================
// API RESPONSES
// ============================================================================

/** Get DNS config response */
export type GetDNSConfigResponse = {
  config: DNSCacheConfig;
  stats: {
    cacheSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
};

/** Update DNS config request */
export type UpdateDNSConfigRequest = {
  enabled?: boolean;
  ttl?: number;
  maxEntries?: number;
};

/** Update DNS config response */
export type UpdateDNSConfigResponse = {
  message: string;
  config: DNSCacheConfig;
  stats: {
    cacheSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
};

/** Get DNS cache entries response */
export type GetDNSCacheEntriesResponse = {
  entries: Array<DNSCacheEntry>;
  total: number;
};

/** Delete DNS cache entry response */
export type DeleteDNSCacheEntryResponse = {
  message: string;
  key: string;
};

// Note: ClearDNSCacheResponse is already defined in settings.ts

/** Reset DNS stats response */
export type ResetDNSStatsResponse = {
  message: string;
  stats: {
    cacheSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
};

/** Get all analysis DNS stats response */
export type GetAllAnalysisDNSStatsResponse = {
  analysisStats: Record<string, AnalysisDNSStatsResponse>;
};

/** Get single analysis DNS stats response */
export type GetAnalysisDNSStatsResponse = {
  analysisId: string;
  stats: AnalysisDNSStatsResponse;
};

/** Get analysis DNS cache entries response */
export type GetAnalysisDNSCacheEntriesResponse = {
  analysisId: string;
  entries: Array<DNSCacheEntry>;
  total: number;
};

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
export interface DNSCacheConfig {
  enabled: boolean;
  ttl: number;
  maxEntries: number;
}

// ============================================================================
// DNS CACHE STATISTICS
// ============================================================================

/** Extended DNS cache statistics with error tracking */
export interface DNSCacheExtendedStats {
  hits: number;
  misses: number;
  errors: number;
  evictions: number;
}

/** Full DNS cache stats response */
export interface DNSCacheFullStats extends DNSCacheExtendedStats {
  cacheSize: number;
  hitRate: number | string;
  ttlPeriodAge: number;
  ttlPeriodRemaining: number;
  ttlPeriodProgress: string;
}

// ============================================================================
// DNS CACHE ENTRIES
// ============================================================================

/** DNS lookup cache data */
export interface DNSLookupCacheData {
  address: string;
  family: number;
}

/** DNS resolve cache data */
export interface DNSResolveCacheData {
  addresses: string[];
}

/** DNS cache entry for API response */
export interface DNSCacheEntry {
  key: string;
  data: DNSLookupCacheData | DNSResolveCacheData;
  timestamp: number;
  age: number;
  remainingTTL: number;
  expired: boolean;
  source?: string;
}

// ============================================================================
// DNS OPERATION RESULTS
// ============================================================================

/** DNS lookup operation result */
export interface DNSLookupResult {
  success: boolean;
  address?: string;
  family?: number;
  error?: string;
}

/** DNS resolve operation result */
export interface DNSResolveResult {
  success: boolean;
  addresses?: string[];
  error?: string;
}

// ============================================================================
// PER-ANALYSIS DNS STATISTICS
// ============================================================================

/** Per-analysis DNS stats response */
export interface AnalysisDNSStatsResponse {
  hits: number;
  misses: number;
  errors: number;
  hitRate: number | string;
  hostnameCount: number;
  hostnames: string[];
  cacheKeyCount: number;
}

// ============================================================================
// API RESPONSES
// ============================================================================

/** Get DNS config response */
export interface GetDNSConfigResponse {
  config: DNSCacheConfig;
  stats: {
    cacheSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/** Update DNS config request */
export interface UpdateDNSConfigRequest {
  enabled?: boolean;
  ttl?: number;
  maxEntries?: number;
}

/** Update DNS config response */
export interface UpdateDNSConfigResponse {
  message: string;
  config: DNSCacheConfig;
  stats: {
    cacheSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/** Get DNS cache entries response */
export interface GetDNSCacheEntriesResponse {
  entries: DNSCacheEntry[];
  total: number;
}

/** Delete DNS cache entry response */
export interface DeleteDNSCacheEntryResponse {
  message: string;
  key: string;
}

// Note: ClearDNSCacheResponse is already defined in settings.ts

/** Reset DNS stats response */
export interface ResetDNSStatsResponse {
  message: string;
  stats: {
    cacheSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/** Get all analysis DNS stats response */
export interface GetAllAnalysisDNSStatsResponse {
  analysisStats: Record<string, AnalysisDNSStatsResponse>;
}

/** Get single analysis DNS stats response */
export interface GetAnalysisDNSStatsResponse {
  analysisId: string;
  stats: AnalysisDNSStatsResponse;
}

/** Get analysis DNS cache entries response */
export interface GetAnalysisDNSCacheEntriesResponse {
  analysisId: string;
  entries: DNSCacheEntry[];
  total: number;
}

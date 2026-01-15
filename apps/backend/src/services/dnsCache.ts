/**
 * DNS caching service with SSRF protection
 * @module dnsCache
 */
import dns from 'dns';
import { promises as dnsPromises } from 'dns';
import path from 'path';
import { config } from '../config/default.ts';
import { safeReadFile, safeWriteFile } from '../utils/safePath.ts';
import { createChildLogger } from '../utils/logging/logger.ts';
import { dnsCacheHits, dnsCacheMisses } from '../utils/metrics-enhanced.ts';
import {
  validateHostname,
  validateResolvedAddress,
  validateResolvedAddresses,
} from '../utils/ssrfProtection.ts';
import { DNS_CACHE } from '../constants.ts';

const logger = createChildLogger('dns-cache');
const DNS_CONFIG_FILE = path.join(config.paths.config, 'dns-cache-config.json');

/** DNS lookup options */
type LookupOptions = {
  family?: number;
  hints?: number;
  all?: boolean;
  verbatim?: boolean;
};

/** DNS lookup callback */
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | null,
  family: number | null,
) => void;

/** Original dns.lookup function signature - simplified for call() usage */
type OriginalLookupFn = (
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
) => void;

/** Original resolve4/resolve6 function signature - simplified for call() usage */
type OriginalResolveFn = (hostname: string) => Promise<string[]>;

/** IP version type for resolve operations */
type IPVersion = 4 | 6;

// Import types from shared package
import type {
  DNSCacheConfig,
  DNSCacheExtendedStats,
  DNSLookupCacheData,
  DNSResolveCacheData,
  DNSCacheEntry,
  DNSLookupResult,
  DNSResolveResult,
  AnalysisDNSStatsResponse,
  DNSCacheFullStats,
} from '@tago-analysis-worker/types';

// Re-export for backward compatibility
export type { DNSCacheConfig, DNSLookupResult, DNSResolveResult };

// Local type aliases for internal use
type DNSCacheStats = DNSCacheExtendedStats;
type LookupCacheData = DNSLookupCacheData;
type ResolveCacheData = DNSResolveCacheData;
type CacheEntryResponse = DNSCacheEntry;
type AnalysisStatsResponse = AnalysisDNSStatsResponse;
type FullStatsResponse = DNSCacheFullStats;

/** Per-analysis stats tracking (internal, includes Set types) */
type AnalysisStatsEntry = {
  hits: number;
  misses: number;
  errors: number;
  hostnames: Set<string>;
  cacheKeys: Set<string>;
};

/** Cache entry wrapper (internal) */
type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

class DNSCacheService {
  private cache: Map<string, CacheEntry<LookupCacheData | ResolveCacheData>>;
  private config: DNSCacheConfig;
  private stats: DNSCacheStats;
  private analysisStats: Map<string, AnalysisStatsEntry>;
  private cacheKeyToAnalyses: Map<string, Set<string>>;
  private ttlPeriodStart: number;
  private originalLookup: OriginalLookupFn | null;
  private originalResolve4: OriginalResolveFn | null;
  private originalResolve6: OriginalResolveFn | null;
  private pendingBroadcasts: Map<string, NodeJS.Timeout> | null;

  constructor() {
    this.cache = new Map();
    this.config = {
      enabled: false,
      ttl: DNS_CACHE.DEFAULT_TTL_MS,
      maxEntries: DNS_CACHE.DEFAULT_MAX_ENTRIES,
    };
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      evictions: 0,
    };
    this.analysisStats = new Map();
    this.cacheKeyToAnalyses = new Map();
    this.ttlPeriodStart = Date.now();
    this.originalLookup = null;
    this.originalResolve4 = null;
    this.originalResolve6 = null;
    this.pendingBroadcasts = null;
  }

  /** Initialize DNS cache (load config, install interceptors if enabled) */
  async initialize(): Promise<void> {
    try {
      await this.loadConfig();
      this.updateEnvironmentVariables();
      if (this.config.enabled) {
        this.installInterceptors();
        logger.info(
          { config: this.config },
          'DNS cache initialized and enabled',
        );
      } else {
        logger.info('DNS cache initialized but disabled');
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize DNS cache');
    }
  }

  /** Load configuration from file */
  async loadConfig(): Promise<void> {
    try {
      const data = (await safeReadFile(DNS_CONFIG_FILE, config.paths.config, {
        encoding: 'utf8',
      })) as string;
      const savedConfig = JSON.parse(data) as Partial<DNSCacheConfig>;
      this.config = { ...this.config, ...savedConfig };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error({ err: error }, 'Error loading DNS cache config');
      }
      await this.saveConfig();
    }
  }

  /** Save configuration to file */
  async saveConfig(): Promise<void> {
    try {
      await safeWriteFile(
        DNS_CONFIG_FILE,
        JSON.stringify(this.config, null, 2),
        config.paths.config,
      );
      logger.debug('DNS cache config saved');
    } catch (error) {
      logger.error({ err: error }, 'Failed to save DNS cache config');
    }
  }

  /** Install DNS interceptors with caching and SSRF protection */
  installInterceptors(): void {
    // Cast to simplified function types for call() compatibility
    this.originalLookup = dns.lookup as unknown as OriginalLookupFn;
    this.originalResolve4 = dnsPromises.resolve4 as OriginalResolveFn;
    this.originalResolve6 = dnsPromises.resolve6 as OriginalResolveFn;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dns.lookup = this.createCachedLookup() as any;
    dnsPromises.resolve4 = this.createCachedResolve4();
    dnsPromises.resolve6 = this.createCachedResolve6();

    logger.info('DNS interceptors installed');
  }

  /**
   * Create a cached dns.lookup interceptor
   */
  createCachedLookup(): (
    hostname: string,
    options: LookupOptions | LookupCallback,
    callback?: LookupCallback,
  ) => void {
    return (
      hostname: string,
      options: LookupOptions | LookupCallback,
      callback?: LookupCallback,
    ) => {
      let actualOptions: LookupOptions = {};
      let actualCallback: LookupCallback;

      if (typeof options === 'function') {
        actualCallback = options;
        actualOptions = {};
      } else {
        actualOptions = options || {};
        actualCallback = callback!;
      }

      const hostnameValidation = validateHostname(hostname);
      if (!hostnameValidation.allowed) {
        this.stats.errors++;
        const error = new Error(
          `SSRF Protection: ${hostnameValidation.reason}`,
        ) as NodeJS.ErrnoException;
        error.code = 'ENOTFOUND';
        return process.nextTick(() => actualCallback(error, null, null));
      }

      const family = actualOptions.family || 4;
      const cacheKey = `${hostname}:${family}`;

      const cached = this.getFromCache(cacheKey) as LookupCacheData | null;
      if (cached) {
        this.checkAndResetTTLPeriod();
        this.respondWithCacheHit('lookup', hostname, () =>
          actualCallback(null, cached.address, cached.family),
        );
        return;
      }

      this.handleLookupCacheMiss(
        hostname,
        actualOptions,
        family,
        cacheKey,
        actualCallback,
      );
    };
  }

  /**
   * Create a cached DNS resolve interceptor for the specified IP version
   */
  private createCachedResolve(
    ipVersion: IPVersion,
  ): (hostname: string) => Promise<string[]> {
    const cacheKeyPrefix = `resolve${ipVersion}:`;
    const operation = `resolve${ipVersion}`;

    return async (hostname: string): Promise<string[]> => {
      const hostnameValidation = validateHostname(hostname);
      if (!hostnameValidation.allowed) {
        this.stats.errors++;
        const error = new Error(
          `SSRF Protection: ${hostnameValidation.reason}`,
        ) as NodeJS.ErrnoException;
        error.code = 'ENOTFOUND';
        throw error;
      }

      const cacheKey = `${cacheKeyPrefix}${hostname}`;

      const cached = this.getFromCache(cacheKey) as ResolveCacheData | null;
      if (cached) {
        this.checkAndResetTTLPeriod();
        this.recordCacheHit(operation, hostname);
        logger.debug({ hostname, cached }, `DNS ${operation} cache hit`);
        return cached.addresses;
      }

      return this.handleResolveCacheMiss(hostname, cacheKey, ipVersion);
    };
  }

  /**
   * Create a cached dnsPromises.resolve4 interceptor
   */
  createCachedResolve4(): typeof dnsPromises.resolve4 {
    return this.createCachedResolve(4) as typeof dnsPromises.resolve4;
  }

  /**
   * Create a cached dnsPromises.resolve6 interceptor
   */
  createCachedResolve6(): typeof dnsPromises.resolve6 {
    return this.createCachedResolve(6) as typeof dnsPromises.resolve6;
  }

  /**
   * Handle cache miss for dns.lookup
   */
  private handleLookupCacheMiss(
    hostname: string,
    options: LookupOptions,
    _family: number,
    cacheKey: string,
    callback: LookupCallback,
  ): void {
    this.checkAndResetTTLPeriod();
    this.recordCacheMiss();

    this.originalLookup!.call(
      dns,
      hostname,
      options,
      (err: NodeJS.ErrnoException | null, address: string, family: number) => {
        if (!err && address) {
          const addressValidation = validateResolvedAddress(
            hostname,
            address,
            family,
          );
          if (!addressValidation.allowed) {
            this.stats.errors++;
            const error = new Error(
              `SSRF Protection: ${addressValidation.reason}`,
            ) as NodeJS.ErrnoException;
            error.code = 'ENOTFOUND';
            return callback(error, null, null);
          }

          this.addToCache(cacheKey, { address, family });
          logger.debug({ hostname, address, family }, 'DNS result cached');
        } else if (err) {
          this.stats.errors++;
        }
        callback(err, address, family);
      },
    );
  }

  /**
   * Handle cache miss for dnsPromises.resolve4 or resolve6
   */
  private async handleResolveCacheMiss(
    hostname: string,
    cacheKey: string,
    ipVersion: IPVersion,
  ): Promise<string[]> {
    const originalResolve =
      ipVersion === 4 ? this.originalResolve4 : this.originalResolve6;
    const operation = `resolve${ipVersion}`;

    try {
      this.checkAndResetTTLPeriod();
      this.recordCacheMiss();
      const addresses = await originalResolve!.call(dnsPromises, hostname);

      const addressesValidation = validateResolvedAddresses(
        hostname,
        addresses,
      );
      if (!addressesValidation.allowed) {
        this.stats.errors++;
        const error = new Error(
          `SSRF Protection: ${addressesValidation.reason}`,
        ) as NodeJS.ErrnoException;
        error.code = 'ENOTFOUND';
        throw error;
      }

      const safeAddresses = addressesValidation.filteredAddresses || addresses;
      this.addToCache(cacheKey, { addresses: safeAddresses });
      logger.debug(
        { hostname, addresses: safeAddresses },
        `DNS ${operation} result cached`,
      );
      return safeAddresses;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  private recordCacheHit(operation: string, hostname: string): void {
    this.stats.hits++;
    dnsCacheHits.inc();
    logger.debug({ hostname, operation }, 'DNS cache hit');
  }

  private recordCacheMiss(): void {
    this.stats.misses++;
    dnsCacheMisses.inc();
  }

  private respondWithCacheHit(
    operation: string,
    hostname: string,
    callback: () => void,
  ): void {
    this.recordCacheHit(operation, hostname);
    return process.nextTick(callback);
  }

  uninstallInterceptors(): void {
    if (this.originalLookup) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dns.lookup = this.originalLookup as any;
      this.originalLookup = null;
    }
    if (this.originalResolve4) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dnsPromises.resolve4 = this.originalResolve4 as any;
      this.originalResolve4 = null;
    }
    if (this.originalResolve6) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dnsPromises.resolve6 = this.originalResolve6 as any;
      this.originalResolve6 = null;
    }
    logger.info('DNS interceptors uninstalled');
  }

  private getOrCreateAnalysisStats(
    analysisId: string,
  ): AnalysisStatsEntry | null {
    if (!analysisId) return null;

    if (!this.analysisStats.has(analysisId)) {
      this.analysisStats.set(analysisId, {
        hits: 0,
        misses: 0,
        errors: 0,
        hostnames: new Set(),
        cacheKeys: new Set(),
      });
    }
    return this.analysisStats.get(analysisId)!;
  }

  private recordAnalysisCacheHit(
    analysisId: string,
    hostname: string,
    cacheKey: string,
  ): void {
    this.stats.hits++;
    dnsCacheHits.inc();

    if (analysisId) {
      const analysisStats = this.getOrCreateAnalysisStats(analysisId);
      if (analysisStats) {
        analysisStats.hits++;
        analysisStats.hostnames.add(hostname);
        analysisStats.cacheKeys.add(cacheKey);

        if (!this.cacheKeyToAnalyses.has(cacheKey)) {
          this.cacheKeyToAnalyses.set(cacheKey, new Set());
        }
        this.cacheKeyToAnalyses.get(cacheKey)!.add(analysisId);

        this.scheduleBroadcast(analysisId);
      }
    }
  }

  private recordAnalysisCacheMiss(
    analysisId: string,
    hostname: string,
    cacheKey: string,
  ): void {
    this.stats.misses++;
    dnsCacheMisses.inc();

    if (analysisId) {
      const analysisStats = this.getOrCreateAnalysisStats(analysisId);
      if (analysisStats) {
        analysisStats.misses++;
        analysisStats.hostnames.add(hostname);
        analysisStats.cacheKeys.add(cacheKey);

        if (!this.cacheKeyToAnalyses.has(cacheKey)) {
          this.cacheKeyToAnalyses.set(cacheKey, new Set());
        }
        this.cacheKeyToAnalyses.get(cacheKey)!.add(analysisId);

        this.scheduleBroadcast(analysisId);
      }
    }
  }

  private recordAnalysisError(analysisId: string | null): void {
    this.stats.errors++;

    if (analysisId) {
      const analysisStats = this.getOrCreateAnalysisStats(analysisId);
      if (analysisStats) {
        analysisStats.errors++;
        this.scheduleBroadcast(analysisId);
      }
    }
  }

  private scheduleBroadcast(analysisId: string): void {
    if (!this.pendingBroadcasts) {
      this.pendingBroadcasts = new Map();
    }

    if (this.pendingBroadcasts.has(analysisId)) {
      clearTimeout(this.pendingBroadcasts.get(analysisId)!);
    }

    const timeoutId = setTimeout(async () => {
      this.pendingBroadcasts!.delete(analysisId);
      try {
        const { sseManager } = await import('../utils/sse/SSEManager.ts');
        // Broadcast DNS stats to stats channel subscribers
        if (sseManager.analysisStatsChannels.has(analysisId)) {
          await sseManager.broadcastService.broadcastAnalysisDnsStats(
            analysisId,
          );
        }
      } catch {
        // Ignore - SSE manager might not be ready
      }
    }, 500);

    this.pendingBroadcasts.set(analysisId, timeoutId);
  }

  // Handle IPC DNS lookup requests from child processes
  async handleDNSLookupRequest(
    hostname: string,
    options: LookupOptions = {},
    analysisId: string | null = null,
  ): Promise<DNSLookupResult> {
    const hostnameValidation = validateHostname(hostname);
    if (!hostnameValidation.allowed) {
      this.recordAnalysisError(analysisId);
      logger.warn(
        { hostname, analysisId, reason: hostnameValidation.reason },
        'SSRF: Blocked DNS lookup from child process',
      );
      return { success: false, error: hostnameValidation.reason };
    }

    const family = options.family || 4;
    const cacheKey = `${hostname}:${family}`;

    const cached = this.getFromCache(cacheKey) as LookupCacheData | null;
    if (cached) {
      this.checkAndResetTTLPeriod();
      this.recordAnalysisCacheHit(analysisId!, hostname, cacheKey);
      logger.debug(
        { hostname, family, analysisId, cached },
        'DNS cache hit (IPC)',
      );
      return { success: true, ...cached };
    }

    this.checkAndResetTTLPeriod();
    this.recordAnalysisCacheMiss(analysisId!, hostname, cacheKey);

    return new Promise((resolve) => {
      this.originalLookup!.call(
        dns,
        hostname,
        options,
        (
          err: NodeJS.ErrnoException | null,
          address: string,
          family: number,
        ) => {
          if (!err && address) {
            const addressValidation = validateResolvedAddress(
              hostname,
              address,
              family,
            );
            if (!addressValidation.allowed) {
              this.recordAnalysisError(analysisId);
              logger.warn(
                {
                  hostname,
                  address,
                  family,
                  analysisId,
                  reason: addressValidation.reason,
                },
                'SSRF: Blocked resolved address from child process',
              );
              resolve({ success: false, error: addressValidation.reason });
              return;
            }

            const result = { address, family };
            this.addToCache(cacheKey, result);
            logger.debug(
              { hostname, address, family, analysisId },
              'DNS result cached (IPC)',
            );
            resolve({ success: true, ...result });
          } else {
            this.recordAnalysisError(analysisId);
            logger.debug(
              { hostname, analysisId, error: err?.message },
              'DNS error (IPC)',
            );
            resolve({ success: false, error: err?.message });
          }
        },
      );
    });
  }

  /**
   * Handle IPC DNS resolve requests for both IPv4 and IPv6
   */
  private async handleDNSResolveRequest(
    hostname: string,
    analysisId: string | null,
    ipVersion: IPVersion,
  ): Promise<DNSResolveResult> {
    const operation = `resolve${ipVersion}`;
    const cacheKey = `${operation}:${hostname}`;
    const originalResolve =
      ipVersion === 4 ? this.originalResolve4 : this.originalResolve6;

    const hostnameValidation = validateHostname(hostname);
    if (!hostnameValidation.allowed) {
      this.recordAnalysisError(analysisId);
      logger.warn(
        { hostname, analysisId, reason: hostnameValidation.reason },
        `SSRF: Blocked DNS ${operation} from child process`,
      );
      return { success: false, error: hostnameValidation.reason };
    }

    const cached = this.getFromCache(cacheKey) as ResolveCacheData | null;
    if (cached) {
      this.checkAndResetTTLPeriod();
      this.recordAnalysisCacheHit(analysisId!, hostname, cacheKey);
      logger.debug(
        { hostname, analysisId, cached },
        `DNS ${operation} cache hit (IPC)`,
      );
      return { success: true, addresses: cached.addresses };
    }

    try {
      this.checkAndResetTTLPeriod();
      this.recordAnalysisCacheMiss(analysisId!, hostname, cacheKey);
      const addresses = await originalResolve!.call(dnsPromises, hostname);

      const addressesValidation = validateResolvedAddresses(
        hostname,
        addresses,
      );
      if (!addressesValidation.allowed) {
        this.recordAnalysisError(analysisId);
        logger.warn(
          {
            hostname,
            analysisId,
            addresses,
            reason: addressesValidation.reason,
          },
          'SSRF: Blocked resolved addresses from child process',
        );
        return { success: false, error: addressesValidation.reason };
      }

      const safeAddresses = addressesValidation.filteredAddresses || addresses;
      this.addToCache(cacheKey, { addresses: safeAddresses });
      logger.debug(
        { hostname, analysisId, addresses: safeAddresses },
        `DNS ${operation} result cached (IPC)`,
      );
      return { success: true, addresses: safeAddresses };
    } catch (error) {
      this.recordAnalysisError(analysisId);
      logger.debug(
        { hostname, analysisId, error: (error as Error).message },
        `DNS ${operation} error (IPC)`,
      );
      return { success: false, error: (error as Error).message };
    }
  }

  // Handle IPC DNS resolve4 requests
  async handleDNSResolve4Request(
    hostname: string,
    analysisId: string | null = null,
  ): Promise<DNSResolveResult> {
    return this.handleDNSResolveRequest(hostname, analysisId, 4);
  }

  // Handle IPC DNS resolve6 requests
  async handleDNSResolve6Request(
    hostname: string,
    analysisId: string | null = null,
  ): Promise<DNSResolveResult> {
    return this.handleDNSResolveRequest(hostname, analysisId, 6);
  }

  // Check if we're in a new TTL period and reset stats if needed
  checkAndResetTTLPeriod(): void {
    const now = Date.now();
    const ttlPeriodAge = now - this.ttlPeriodStart;

    if (ttlPeriodAge >= this.config.ttl) {
      this.ttlPeriodStart = now;
      this.stats.hits = 0;
      this.stats.misses = 0;
      logger.debug('TTL period expired, reset hit/miss statistics');
    }
  }

  getFromCache(key: string): LookupCacheData | ResolveCacheData | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  addToCache(key: string, data: LookupCacheData | ResolveCacheData): void {
    if (this.cache.size >= this.config.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  async updateConfig(newConfig: Partial<DNSCacheConfig>): Promise<void> {
    const wasEnabled = this.config.enabled;
    const oldTtl = this.config.ttl;
    this.config = { ...this.config, ...newConfig };

    if (newConfig.ttl !== undefined && newConfig.ttl !== oldTtl) {
      this.ttlPeriodStart = Date.now();
      this.stats.hits = 0;
      this.stats.misses = 0;
      logger.info(
        { oldTtl, newTtl: newConfig.ttl },
        'TTL changed, reset hit/miss statistics',
      );
    }

    if (wasEnabled && !this.config.enabled) {
      this.uninstallInterceptors();
      logger.info('DNS cache disabled');
    } else if (!wasEnabled && this.config.enabled) {
      this.installInterceptors();
      logger.info('DNS cache enabled');
    }

    await this.saveConfig();
    this.updateEnvironmentVariables();
    logger.info({ config: this.config }, 'DNS cache config updated');
  }

  updateEnvironmentVariables(): void {
    process.env.DNS_CACHE_ENABLED = this.config.enabled.toString();
    process.env.DNS_CACHE_TTL = this.config.ttl.toString();
    process.env.DNS_CACHE_MAX_ENTRIES = this.config.maxEntries.toString();

    logger.debug(
      {
        DNS_CACHE_ENABLED: process.env.DNS_CACHE_ENABLED,
        DNS_CACHE_TTL: process.env.DNS_CACHE_TTL,
        DNS_CACHE_MAX_ENTRIES: process.env.DNS_CACHE_MAX_ENTRIES,
      },
      'Updated environment variables for child processes',
    );
  }

  clearCache(): number {
    const size = this.cache.size;
    this.cache.clear();
    logger.info({ entriesCleared: size }, 'DNS cache cleared');
    return size;
  }

  /**
   * Delete a specific cache entry by key
   */
  deleteCacheEntry(key: string): boolean {
    return this.cache.delete(key);
  }

  getCacheEntries(): CacheEntryResponse[] {
    const entries: CacheEntryResponse[] = [];
    const now = Date.now();

    for (const [key, value] of this.cache.entries()) {
      const age = now - value.timestamp;
      const remainingTTL = Math.max(0, this.config.ttl - age);

      entries.push({
        key,
        data: value.data,
        timestamp: value.timestamp,
        age,
        remainingTTL,
        expired: remainingTTL === 0,
        source: 'shared',
      });
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  getConfig(): DNSCacheConfig {
    return { ...this.config };
  }

  getStats(): FullStatsResponse {
    const now = Date.now();
    const ttlPeriodAge = now - this.ttlPeriodStart;
    const ttlPeriodRemaining = Math.max(0, this.config.ttl - ttlPeriodAge);

    return {
      ...this.stats,
      cacheSize: this.cache.size,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? (
              (this.stats.hits / (this.stats.hits + this.stats.misses)) *
              100
            ).toFixed(2)
          : 0,
      ttlPeriodAge,
      ttlPeriodRemaining,
      ttlPeriodProgress: ((ttlPeriodAge / this.config.ttl) * 100).toFixed(1),
    };
  }

  getAnalysisStats(analysisId: string): AnalysisStatsResponse | null {
    if (!analysisId) return null;

    const analysisStats = this.analysisStats.get(analysisId);
    if (!analysisStats) {
      return {
        hits: 0,
        misses: 0,
        errors: 0,
        hitRate: 0,
        hostnameCount: 0,
        hostnames: [],
        cacheKeyCount: 0,
      };
    }

    const total = analysisStats.hits + analysisStats.misses;
    return {
      hits: analysisStats.hits,
      misses: analysisStats.misses,
      errors: analysisStats.errors,
      hitRate: total > 0 ? ((analysisStats.hits / total) * 100).toFixed(2) : 0,
      hostnameCount: analysisStats.hostnames.size,
      hostnames: Array.from(analysisStats.hostnames),
      cacheKeyCount: analysisStats.cacheKeys.size,
    };
  }

  getAllAnalysisStats(): Record<string, AnalysisStatsResponse> {
    const result: Record<string, AnalysisStatsResponse> = {};
    for (const [analysisId, stats] of this.analysisStats.entries()) {
      const total = stats.hits + stats.misses;
      result[analysisId] = {
        hits: stats.hits,
        misses: stats.misses,
        errors: stats.errors,
        hitRate: total > 0 ? ((stats.hits / total) * 100).toFixed(2) : 0,
        hostnameCount: stats.hostnames.size,
        hostnames: Array.from(stats.hostnames),
        cacheKeyCount: stats.cacheKeys.size,
      };
    }
    return result;
  }

  getAnalysisCacheEntries(analysisId: string): CacheEntryResponse[] {
    if (!analysisId) return [];

    const analysisStats = this.analysisStats.get(analysisId);
    if (!analysisStats) return [];

    const entries: CacheEntryResponse[] = [];
    const now = Date.now();

    for (const cacheKey of analysisStats.cacheKeys) {
      const entry = this.cache.get(cacheKey);
      if (entry) {
        const age = now - entry.timestamp;
        const remainingTTL = Math.max(0, this.config.ttl - age);

        entries.push({
          key: cacheKey,
          data: entry.data,
          timestamp: entry.timestamp,
          age,
          remainingTTL,
          expired: remainingTTL === 0,
        });
      }
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  resetAnalysisStats(analysisId: string): void {
    if (analysisId) {
      this.analysisStats.delete(analysisId);
      logger.info({ analysisId }, 'Analysis DNS stats reset');
    }
  }

  cleanupAnalysis(analysisId: string): void {
    if (!analysisId) return;

    this.analysisStats.delete(analysisId);

    for (const [cacheKey, analyses] of this.cacheKeyToAnalyses.entries()) {
      analyses.delete(analysisId);
      if (analyses.size === 0) {
        this.cacheKeyToAnalyses.delete(cacheKey);
      }
    }

    logger.debug({ analysisId }, 'Cleaned up DNS stats for deleted analysis');
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      evictions: 0,
    };
    this.analysisStats.clear();
    this.cacheKeyToAnalyses.clear();
    this.ttlPeriodStart = Date.now();
    logger.info('DNS cache stats reset (global and per-analysis)');
  }
}

// Create singleton instance
const dnsCache = new DNSCacheService();

export { dnsCache };

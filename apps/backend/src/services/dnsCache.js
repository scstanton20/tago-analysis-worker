/**
 * DNS caching service with SSRF protection
 * @module dnsCache
 */
import dns from 'dns';
import { promises as dnsPromises } from 'dns';
import path from 'path';
import { config } from '../config/default.js';
import { safeReadFile, safeWriteFile } from '../utils/safePath.js';
import { createChildLogger } from '../utils/logging/logger.js';
import { dnsCacheHits, dnsCacheMisses } from '../utils/metrics-enhanced.js';
import {
  validateHostname,
  validateResolvedAddress,
  validateResolvedAddresses,
} from '../utils/ssrfProtection.js';
import { DNS_CACHE } from '../constants.js';

const logger = createChildLogger('dns-cache');
const DNS_CONFIG_FILE = path.join(config.paths.config, 'dns-cache-config.json');

class DNSCacheService {
  /**
   * Initialize DNS cache service instance
   * Sets up cache storage, configuration, statistics, and SSE broadcasting
   *
   * Properties:
   * @property {Map} cache - In-memory DNS resolution cache
   * @property {Object} config - Service configuration (enabled, ttl, maxEntries)
   * @property {Object} stats - Cache statistics (hits, misses, errors, evictions)
   * @property {number} ttlPeriodStart - Timestamp of current TTL statistics period start
   * @property {Function|null} originalLookup - Original dns.lookup function reference
   * @property {Function|null} originalResolve4 - Original dnsPromises.resolve4 reference
   * @property {Function|null} originalResolve6 - Original dnsPromises.resolve6 reference
   * @property {Object} lastStatsSnapshot - Last broadcasted stats for change detection
   * @property {NodeJS.Timeout|null} statsBroadcastTimer - Interval timer for stats broadcasting
   */
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
    // Per-analysis stats tracking
    // Map<analysisId, { hits, misses, errors, hostnames: Set<hostname> }>
    this.analysisStats = new Map();
    // Track which cache entries are used by which analyses
    // Map<cacheKey, Set<analysisId>>
    this.cacheKeyToAnalyses = new Map();
    this.ttlPeriodStart = Date.now();
    this.originalLookup = null;
    this.originalResolve4 = null;
    this.originalResolve6 = null;
    this.lastStatsSnapshot = { ...this.stats };
    this.statsBroadcastTimer = null;
  }

  /** Initialize DNS cache (load config, install interceptors if enabled) */
  async initialize() {
    try {
      await this.loadConfig();
      this.updateEnvironmentVariables(); // Set env vars for child processes
      if (this.config.enabled) {
        this.installInterceptors();
        this.startStatsBroadcasting(); // Start periodic stats broadcasting
        logger.info(
          { config: this.config },
          'DNS cache initialized and enabled',
        );
      } else {
        this.stopStatsBroadcasting(); // Stop broadcasting if disabled
        logger.info('DNS cache initialized but disabled');
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize DNS cache');
    }
  }

  /** Load configuration from file */
  async loadConfig() {
    try {
      const data = await safeReadFile(
        DNS_CONFIG_FILE,
        config.paths.config,
        'utf-8',
      );
      const savedConfig = JSON.parse(data);
      this.config = { ...this.config, ...savedConfig };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error({ err: error }, 'Error loading DNS cache config');
      }
      // If file doesn't exist, use defaults and save them
      await this.saveConfig();
    }
  }

  /** Save configuration to file */
  async saveConfig() {
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
  installInterceptors() {
    // Store original functions
    this.originalLookup = dns.lookup;
    this.originalResolve4 = dnsPromises.resolve4;
    this.originalResolve6 = dnsPromises.resolve6;

    // Install individual interceptors
    dns.lookup = this.createCachedLookup();
    dnsPromises.resolve4 = this.createCachedResolve4();
    dnsPromises.resolve6 = this.createCachedResolve6();

    logger.info('DNS interceptors installed');
  }

  /**
   * Create a cached dns.lookup interceptor
   * Handles callback-based DNS lookups with caching and SSRF protection
   * @returns {Function} Interceptor function for dns.lookup
   */
  createCachedLookup() {
    return (hostname, options, callback) => {
      // Handle different function signatures
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      // Validate hostname before attempting resolution
      const hostnameValidation = validateHostname(hostname);
      if (!hostnameValidation.allowed) {
        this.stats.errors++;
        const error = new Error(
          `SSRF Protection: ${hostnameValidation.reason}`,
        );
        error.code = 'ENOTFOUND';
        return process.nextTick(() => callback(error, null, null));
      }

      const family = options?.family || 4;
      const cacheKey = `${hostname}:${family}`;

      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.checkAndResetTTLPeriod();
        this.respondWithCacheHit('lookup', hostname, () =>
          callback(null, cached.address, cached.family),
        );
        return;
      }

      // Cache miss - perform actual lookup
      this.handleLookupCacheMiss(hostname, options, family, cacheKey, callback);
    };
  }

  /**
   * Create a cached dnsPromises.resolve4 interceptor
   * Handles promise-based IPv4 address resolution with caching and SSRF protection
   * @returns {Function} Interceptor function for dnsPromises.resolve4
   */
  createCachedResolve4() {
    return async (hostname) => {
      // Validate hostname before attempting resolution
      const hostnameValidation = validateHostname(hostname);
      if (!hostnameValidation.allowed) {
        this.stats.errors++;
        const error = new Error(
          `SSRF Protection: ${hostnameValidation.reason}`,
        );
        error.code = 'ENOTFOUND';
        throw error;
      }

      const cacheKey = `resolve4:${hostname}`;

      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.checkAndResetTTLPeriod();
        this.recordCacheHit('resolve4', hostname);
        logger.debug({ hostname, cached }, 'DNS resolve4 cache hit');
        return cached.addresses;
      }

      // Cache miss - perform actual resolution
      return this.handleResolve4CacheMiss(hostname, cacheKey);
    };
  }

  /**
   * Create a cached dnsPromises.resolve6 interceptor
   * Handles promise-based IPv6 address resolution with caching and SSRF protection
   * @returns {Function} Interceptor function for dnsPromises.resolve6
   */
  createCachedResolve6() {
    return async (hostname) => {
      // Validate hostname before attempting resolution
      const hostnameValidation = validateHostname(hostname);
      if (!hostnameValidation.allowed) {
        this.stats.errors++;
        const error = new Error(
          `SSRF Protection: ${hostnameValidation.reason}`,
        );
        error.code = 'ENOTFOUND';
        throw error;
      }

      const cacheKey = `resolve6:${hostname}`;

      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.checkAndResetTTLPeriod();
        this.recordCacheHit('resolve6', hostname);
        logger.debug({ hostname, cached }, 'DNS resolve6 cache hit');
        return cached.addresses;
      }

      // Cache miss - perform actual resolution
      return this.handleResolve6CacheMiss(hostname, cacheKey);
    };
  }

  /**
   * Handle cache miss for dns.lookup by performing actual lookup
   * Validates resolved address and updates cache
   * @private
   */
  handleLookupCacheMiss(hostname, options, _family, cacheKey, callback) {
    this.checkAndResetTTLPeriod();
    this.recordCacheMiss();

    this.originalLookup.call(dns, hostname, options, (err, address, family) => {
      if (!err && address) {
        // SSRF Protection: Validate resolved address
        const addressValidation = validateResolvedAddress(
          hostname,
          address,
          family,
        );
        if (!addressValidation.allowed) {
          this.stats.errors++;
          const error = new Error(
            `SSRF Protection: ${addressValidation.reason}`,
          );
          error.code = 'ENOTFOUND';
          return callback(error, null, null);
        }

        this.addToCache(cacheKey, { address, family });
        logger.debug({ hostname, address, family }, 'DNS result cached');
      } else if (err) {
        this.stats.errors++;
      }
      callback(err, address, family);
    });
  }

  /**
   * Handle cache miss for dnsPromises.resolve4 by performing actual resolution
   * Validates resolved addresses and updates cache
   * @private
   */
  async handleResolve4CacheMiss(hostname, cacheKey) {
    try {
      this.checkAndResetTTLPeriod();
      this.recordCacheMiss();
      const addresses = await this.originalResolve4.call(dnsPromises, hostname);

      // SSRF Protection: Validate resolved addresses
      const addressesValidation = validateResolvedAddresses(
        hostname,
        addresses,
      );
      if (!addressesValidation.allowed) {
        this.stats.errors++;
        const error = new Error(
          `SSRF Protection: ${addressesValidation.reason}`,
        );
        error.code = 'ENOTFOUND';
        throw error;
      }

      // Use filtered addresses if some were blocked
      const safeAddresses = addressesValidation.filteredAddresses || addresses;
      this.addToCache(cacheKey, { addresses: safeAddresses });
      logger.debug(
        { hostname, addresses: safeAddresses },
        'DNS resolve4 result cached',
      );
      return safeAddresses;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Handle cache miss for dnsPromises.resolve6 by performing actual resolution
   * Validates resolved addresses and updates cache
   * @private
   */
  async handleResolve6CacheMiss(hostname, cacheKey) {
    try {
      this.checkAndResetTTLPeriod();
      this.recordCacheMiss();
      const addresses = await this.originalResolve6.call(dnsPromises, hostname);

      // SSRF Protection: Validate resolved addresses
      const addressesValidation = validateResolvedAddresses(
        hostname,
        addresses,
      );
      if (!addressesValidation.allowed) {
        this.stats.errors++;
        const error = new Error(
          `SSRF Protection: ${addressesValidation.reason}`,
        );
        error.code = 'ENOTFOUND';
        throw error;
      }

      // Use filtered addresses if some were blocked
      const safeAddresses = addressesValidation.filteredAddresses || addresses;
      this.addToCache(cacheKey, { addresses: safeAddresses });
      logger.debug(
        { hostname, addresses: safeAddresses },
        'DNS resolve6 result cached',
      );
      return safeAddresses;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Record a cache hit and update metrics
   * @private
   */
  recordCacheHit(operation, hostname) {
    this.stats.hits++;
    dnsCacheHits.inc();
    logger.debug({ hostname, operation }, 'DNS cache hit');
  }

  /**
   * Record a cache miss and update metrics
   * @private
   */
  recordCacheMiss() {
    this.stats.misses++;
    dnsCacheMisses.inc();
  }

  /**
   * Respond with cached data asynchronously
   * @private
   */
  respondWithCacheHit(operation, hostname, callback) {
    this.recordCacheHit(operation, hostname);
    return process.nextTick(callback);
  }

  uninstallInterceptors() {
    if (this.originalLookup) {
      dns.lookup = this.originalLookup;
      this.originalLookup = null;
    }
    if (this.originalResolve4) {
      dnsPromises.resolve4 = this.originalResolve4;
      this.originalResolve4 = null;
    }
    if (this.originalResolve6) {
      dnsPromises.resolve6 = this.originalResolve6;
      this.originalResolve6 = null;
    }
    logger.info('DNS interceptors uninstalled');
  }

  /**
   * Get or create per-analysis stats entry
   * @private
   * @param {string} analysisId - Analysis identifier
   * @returns {Object} Stats object for this analysis
   */
  getOrCreateAnalysisStats(analysisId) {
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
    return this.analysisStats.get(analysisId);
  }

  /**
   * Record cache hit for both global and per-analysis stats
   * @private
   */
  recordAnalysisCacheHit(analysisId, hostname, cacheKey) {
    this.stats.hits++;
    dnsCacheHits.inc();

    if (analysisId) {
      const analysisStats = this.getOrCreateAnalysisStats(analysisId);
      analysisStats.hits++;
      analysisStats.hostnames.add(hostname);
      analysisStats.cacheKeys.add(cacheKey);

      // Track which analyses use this cache key
      if (!this.cacheKeyToAnalyses.has(cacheKey)) {
        this.cacheKeyToAnalyses.set(cacheKey, new Set());
      }
      this.cacheKeyToAnalyses.get(cacheKey).add(analysisId);

      // Broadcast stats update to subscribers (debounced)
      this.scheduleBroadcast(analysisId);
    }
  }

  /**
   * Record cache miss for both global and per-analysis stats
   * @private
   */
  recordAnalysisCacheMiss(analysisId, hostname, cacheKey) {
    this.stats.misses++;
    dnsCacheMisses.inc();

    if (analysisId) {
      const analysisStats = this.getOrCreateAnalysisStats(analysisId);
      analysisStats.misses++;
      analysisStats.hostnames.add(hostname);
      analysisStats.cacheKeys.add(cacheKey);

      // Track which analyses use this cache key
      if (!this.cacheKeyToAnalyses.has(cacheKey)) {
        this.cacheKeyToAnalyses.set(cacheKey, new Set());
      }
      this.cacheKeyToAnalyses.get(cacheKey).add(analysisId);

      // Broadcast stats update to subscribers (debounced)
      this.scheduleBroadcast(analysisId);
    }
  }

  /**
   * Record error for both global and per-analysis stats
   * @private
   */
  recordAnalysisError(analysisId) {
    this.stats.errors++;

    if (analysisId) {
      const analysisStats = this.getOrCreateAnalysisStats(analysisId);
      analysisStats.errors++;

      // Broadcast stats update to subscribers (debounced)
      this.scheduleBroadcast(analysisId);
    }
  }

  /**
   * Schedule a debounced broadcast of DNS stats for an analysis
   * Debounces to 500ms to avoid spamming during rapid DNS calls
   * @private
   */
  scheduleBroadcast(analysisId) {
    if (!this.pendingBroadcasts) {
      this.pendingBroadcasts = new Map();
    }

    // Clear existing timeout for this analysis
    if (this.pendingBroadcasts.has(analysisId)) {
      clearTimeout(this.pendingBroadcasts.get(analysisId));
    }

    // Schedule new broadcast
    const timeoutId = setTimeout(async () => {
      this.pendingBroadcasts.delete(analysisId);
      try {
        const { sseManager } = await import('../utils/sse/SSEManager.js');
        if (sseManager.analysisChannels.has(analysisId)) {
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
  async handleDNSLookupRequest(hostname, options = {}, analysisId = null) {
    // SSRF Protection: Validate hostname before resolution
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

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.checkAndResetTTLPeriod();
      this.recordAnalysisCacheHit(analysisId, hostname, cacheKey);
      logger.debug(
        { hostname, family, analysisId, cached },
        'DNS cache hit (IPC)',
      );
      return { success: true, ...cached };
    }

    // Cache miss - perform actual lookup
    this.checkAndResetTTLPeriod();
    this.recordAnalysisCacheMiss(analysisId, hostname, cacheKey);
    return new Promise((resolve) => {
      this.originalLookup.call(
        dns,
        hostname,
        options,
        (err, address, family) => {
          if (!err && address) {
            // SSRF Protection: Validate resolved address
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

  // Handle IPC DNS resolve4 requests
  async handleDNSResolve4Request(hostname, analysisId = null) {
    // SSRF Protection: Validate hostname before resolution
    const hostnameValidation = validateHostname(hostname);
    if (!hostnameValidation.allowed) {
      this.recordAnalysisError(analysisId);
      logger.warn(
        { hostname, analysisId, reason: hostnameValidation.reason },
        'SSRF: Blocked DNS resolve4 from child process',
      );
      return { success: false, error: hostnameValidation.reason };
    }

    const cacheKey = `resolve4:${hostname}`;

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.checkAndResetTTLPeriod();
      this.recordAnalysisCacheHit(analysisId, hostname, cacheKey);
      logger.debug(
        { hostname, analysisId, cached },
        'DNS resolve4 cache hit (IPC)',
      );
      return { success: true, addresses: cached.addresses };
    }

    try {
      this.checkAndResetTTLPeriod();
      this.recordAnalysisCacheMiss(analysisId, hostname, cacheKey);
      const addresses = await this.originalResolve4.call(dnsPromises, hostname);

      // SSRF Protection: Validate resolved addresses
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

      // Use filtered addresses if some were blocked
      const safeAddresses = addressesValidation.filteredAddresses || addresses;
      this.addToCache(cacheKey, { addresses: safeAddresses });
      logger.debug(
        { hostname, analysisId, addresses: safeAddresses },
        'DNS resolve4 result cached (IPC)',
      );
      return { success: true, addresses: safeAddresses };
    } catch (error) {
      this.recordAnalysisError(analysisId);
      logger.debug(
        { hostname, analysisId, error: error.message },
        'DNS resolve4 error (IPC)',
      );
      return { success: false, error: error.message };
    }
  }

  // Handle IPC DNS resolve6 requests
  async handleDNSResolve6Request(hostname, analysisId = null) {
    // SSRF Protection: Validate hostname before resolution
    const hostnameValidation = validateHostname(hostname);
    if (!hostnameValidation.allowed) {
      this.recordAnalysisError(analysisId);
      logger.warn(
        { hostname, analysisId, reason: hostnameValidation.reason },
        'SSRF: Blocked DNS resolve6 from child process',
      );
      return { success: false, error: hostnameValidation.reason };
    }

    const cacheKey = `resolve6:${hostname}`;

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.checkAndResetTTLPeriod();
      this.recordAnalysisCacheHit(analysisId, hostname, cacheKey);
      logger.debug(
        { hostname, analysisId, cached },
        'DNS resolve6 cache hit (IPC)',
      );
      return { success: true, addresses: cached.addresses };
    }

    try {
      this.checkAndResetTTLPeriod();
      this.recordAnalysisCacheMiss(analysisId, hostname, cacheKey);
      const addresses = await this.originalResolve6.call(dnsPromises, hostname);

      // SSRF Protection: Validate resolved addresses
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

      // Use filtered addresses if some were blocked
      const safeAddresses = addressesValidation.filteredAddresses || addresses;
      this.addToCache(cacheKey, { addresses: safeAddresses });
      logger.debug(
        { hostname, analysisId, addresses: safeAddresses },
        'DNS resolve6 result cached (IPC)',
      );
      return { success: true, addresses: safeAddresses };
    } catch (error) {
      this.recordAnalysisError(analysisId);
      logger.debug(
        { hostname, analysisId, error: error.message },
        'DNS resolve6 error (IPC)',
      );
      return { success: false, error: error.message };
    }
  }

  // Check if we're in a new TTL period and reset stats if needed
  checkAndResetTTLPeriod() {
    const now = Date.now();
    const ttlPeriodAge = now - this.ttlPeriodStart;

    // If the current TTL period has expired, start a new one and reset stats
    if (ttlPeriodAge >= this.config.ttl) {
      this.ttlPeriodStart = now;
      this.stats.hits = 0;
      this.stats.misses = 0;
      // Don't reset errors and evictions as they're not TTL-dependent

      logger.debug('TTL period expired, reset hit/miss statistics');
    }
  }

  getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  addToCache(key, data) {
    // Enforce max entries limit
    if (this.cache.size >= this.config.maxEntries) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  async updateConfig(newConfig) {
    const wasEnabled = this.config.enabled;
    const oldTtl = this.config.ttl;
    this.config = { ...this.config, ...newConfig };

    // If TTL changed, reset the TTL period and stats
    if (newConfig.ttl !== undefined && newConfig.ttl !== oldTtl) {
      this.ttlPeriodStart = Date.now();
      this.stats.hits = 0;
      this.stats.misses = 0;
      logger.info(
        { oldTtl, newTtl: newConfig.ttl },
        'TTL changed, reset hit/miss statistics',
      );
    }

    // If enabling/disabling, install/uninstall interceptors and stats broadcasting
    if (wasEnabled && !this.config.enabled) {
      this.uninstallInterceptors();
      this.stopStatsBroadcasting();
      logger.info('DNS cache disabled');
    } else if (!wasEnabled && this.config.enabled) {
      this.installInterceptors();
      this.startStatsBroadcasting();
      logger.info('DNS cache enabled');
    }

    await this.saveConfig();
    this.updateEnvironmentVariables();
    logger.info({ config: this.config }, 'DNS cache config updated');
  }

  // Update environment variables for child processes
  updateEnvironmentVariables() {
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

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info({ entriesCleared: size }, 'DNS cache cleared');
    return size;
  }

  getCacheEntries() {
    const entries = [];
    const now = Date.now();

    // Get all cache entries from shared cache
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

  getConfig() {
    return { ...this.config };
  }

  // Get cache stats (simplified for shared cache)
  getStats() {
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

  /**
   * Get stats for a specific analysis
   * @param {string} analysisId - Analysis identifier
   * @returns {Object|null} Stats for this analysis or null if not found
   */
  getAnalysisStats(analysisId) {
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

  /**
   * Get all per-analysis stats
   * @returns {Object} Map of analysisId to stats
   */
  getAllAnalysisStats() {
    const result = {};
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

  /**
   * Get cache entries used by a specific analysis
   * @param {string} analysisId - Analysis identifier
   * @returns {Array} Cache entries used by this analysis
   */
  getAnalysisCacheEntries(analysisId) {
    if (!analysisId) return [];

    const analysisStats = this.analysisStats.get(analysisId);
    if (!analysisStats) return [];

    const entries = [];
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

  /**
   * Reset stats for a specific analysis
   * @param {string} analysisId - Analysis identifier
   */
  resetAnalysisStats(analysisId) {
    if (analysisId) {
      this.analysisStats.delete(analysisId);
      logger.info({ analysisId }, 'Analysis DNS stats reset');
    }
  }

  /**
   * Clean up stats for analyses that no longer exist
   * Should be called when an analysis is deleted
   * @param {string} analysisId - Analysis identifier
   */
  cleanupAnalysis(analysisId) {
    if (!analysisId) return;

    // Remove from analysisStats
    this.analysisStats.delete(analysisId);

    // Remove from cacheKeyToAnalyses
    for (const [cacheKey, analyses] of this.cacheKeyToAnalyses.entries()) {
      analyses.delete(analysisId);
      if (analyses.size === 0) {
        this.cacheKeyToAnalyses.delete(cacheKey);
      }
    }

    logger.debug({ analysisId }, 'Cleaned up DNS stats for deleted analysis');
  }

  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      evictions: 0,
    };
    // Also reset per-analysis stats
    this.analysisStats.clear();
    this.cacheKeyToAnalyses.clear();
    this.ttlPeriodStart = Date.now();
    this.lastStatsSnapshot = { ...this.stats };
    logger.info('DNS cache stats reset (global and per-analysis)');
  }

  // Stats are included in metricsService.getAllMetrics() and broadcast via metricsUpdate SSE
  // No need for event emission - metrics system polls getStats() periodically
  updateStatsSnapshot() {
    const currentStats = this.getStats();
    this.lastStatsSnapshot = {
      hits: currentStats.hits,
      misses: currentStats.misses,
      errors: currentStats.errors,
      evictions: currentStats.evictions,
      cacheSize: currentStats.cacheSize,
    };
  }

  // Start periodic stats snapshot updates (no SSE broadcasting)
  startStatsBroadcasting() {
    if (this.statsBroadcastTimer) {
      clearInterval(this.statsBroadcastTimer);
    }

    // Update stats snapshot periodically
    this.statsBroadcastTimer = setInterval(() => {
      this.updateStatsSnapshot();
    }, DNS_CACHE.STATS_BROADCAST_INTERVAL_MS);
  }

  // Stop periodic stats broadcasting
  stopStatsBroadcasting() {
    if (this.statsBroadcastTimer) {
      clearInterval(this.statsBroadcastTimer);
      this.statsBroadcastTimer = null;
    }
  }
}

// Create singleton instance
const dnsCache = new DNSCacheService();

export { dnsCache };

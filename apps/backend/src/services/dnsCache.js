/**
 * DNS Cache Service - Performance optimization and SSRF protection
 * Provides DNS result caching with integrated Server-Side Request Forgery protection.
 *
 * This service handles:
 * - DNS result caching (lookup, resolve4, resolve6)
 * - SSRF protection on hostnames and resolved addresses
 * - IPC-based DNS resolution for child processes
 * - TTL-based cache expiration and statistics
 * - Real-time statistics broadcasting via SSE
 * - Configuration persistence
 *
 * Security Features:
 * - Pre-resolution hostname validation (blocks private/local hosts)
 * - Post-resolution address validation (blocks private IP ranges)
 * - Protection against DNS rebinding attacks
 * - Validation for both parent and child processes
 *
 * Caching Strategy:
 * - In-memory Map-based cache with TTL expiration
 * - LRU-style eviction when maxEntries limit reached
 * - Separate cache keys for IPv4/IPv6 lookups
 * - TTL-based statistics periods for accurate hit rate calculation
 *
 * Child Process Integration:
 * - IPC-based DNS resolution requests from analysis processes
 * - Environment variables propagated to child processes
 * - Shared cache between parent and child processes
 *
 * Architecture:
 * - Singleton service pattern (exported as dnsCache)
 * - Monkey-patching of Node.js dns module methods
 * - Periodic SSE stats broadcasting (configurable interval)
 * - Configuration persisted to dns-cache-config.json
 *
 * @module dnsCache
 */
import dns from 'dns';
import { promises as dnsPromises } from 'dns';
import path from 'path';
import config from '../config/default.js';
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

// Import SSE manager for broadcasting stats (lazy import to avoid circular dependency)
let SSEManager = null;
let sseManagerPromise = null;

/**
 * DNS Cache Service class for caching DNS resolutions with SSRF protection
 * Singleton instance manages DNS interception, caching, and statistics.
 *
 * Key Features:
 * - DNS method interception (lookup, resolve4, resolve6)
 * - TTL-based cache expiration with automatic cleanup
 * - SSRF protection validation on all resolutions
 * - IPC handler for child process DNS requests
 * - Real-time statistics with periodic SSE broadcasting
 * - Configuration persistence and environment variable propagation
 *
 * Cache Implementation:
 * - Map-based storage with timestamp tracking
 * - TTL expiration checked on retrieval
 * - LRU eviction when maxEntries exceeded
 * - Separate keys for different resolution types
 *
 * Statistics Tracking:
 * - Hits/misses/errors/evictions counters
 * - TTL period-based statistics for accurate hit rates
 * - Automatic period reset when TTL expires
 * - Periodic SSE broadcasts for real-time monitoring
 *
 * SSRF Protection:
 * - Pre-resolution hostname validation
 * - Post-resolution address validation
 * - Blocks private/local/reserved IP ranges
 * - Protects both parent and child processes
 *
 * @class DNSCacheService
 */
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
    this.ttlPeriodStart = Date.now();
    this.originalLookup = null;
    this.originalResolve4 = null;
    this.originalResolve6 = null;
    this.lastStatsSnapshot = { ...this.stats };
    this.statsBroadcastTimer = null;
  }

  /**
   * Initialize DNS cache service
   * Loads configuration, installs interceptors if enabled, and starts statistics broadcasting
   *
   * @returns {Promise<void>}
   *
   * Process:
   * 1. Loads configuration from dns-cache-config.json
   * 2. Propagates config to environment variables for child processes
   * 3. Installs DNS method interceptors if enabled
   * 4. Starts periodic SSE stats broadcasting if enabled
   *
   * Side Effects:
   * - Modifies process.env variables (DNS_CACHE_*)
   * - Monkey-patches dns.lookup, dnsPromises.resolve4/6 if enabled
   * - Starts interval timer for stats broadcasting
   *
   * Error Handling:
   * - Logs errors but does not throw
   * - Service continues with default configuration on error
   */
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

  /**
   * Load DNS cache configuration from file
   * Creates default configuration file if it doesn't exist
   *
   * @returns {Promise<void>}
   * @throws {Error} Non-ENOENT errors are logged but not thrown
   */
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

  /**
   * Save current DNS cache configuration to file
   *
   * @returns {Promise<void>}
   *
   * Configuration File:
   * - Location: config/dns-cache-config.json
   * - Format: JSON with enabled, ttl, maxEntries
   */
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

  /**
   * Install DNS method interceptors for caching and SSRF protection
   * Monkey-patches dns.lookup, dnsPromises.resolve4, and dnsPromises.resolve6
   *
   * @returns {void}
   *
   * Intercepted Methods:
   * - dns.lookup: Used by most Node.js networking (http, https, net)
   * - dnsPromises.resolve4: IPv4 resolution
   * - dnsPromises.resolve6: IPv6 resolution
   *
   * Protection Features:
   * - Pre-resolution hostname validation (SSRF)
   * - Post-resolution address validation (SSRF)
   * - Cache lookup before actual DNS query
   * - Statistics tracking (hits, misses, errors)
   * - Prometheus metrics updates
   *
   * Cache Strategy:
   * - Check cache first, return immediately if hit
   * - Perform actual DNS resolution on miss
   * - Validate resolved addresses with SSRF protection
   * - Add to cache if validation passes
   *
   * Side Effects:
   * - Replaces global dns.lookup function
   * - Replaces global dnsPromises.resolve4/6 functions
   * - Updates statistics and Prometheus metrics
   */
  installInterceptors() {
    // Store original functions
    this.originalLookup = dns.lookup;
    this.originalResolve4 = dnsPromises.resolve4;
    this.originalResolve6 = dnsPromises.resolve6;

    // Override dns.lookup (used by most Node.js networking)
    dns.lookup = (hostname, options, callback) => {
      // Handle different function signatures
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      // SSRF Protection: Validate hostname before resolution
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
        this.stats.hits++;
        dnsCacheHits.inc(); // Update Prometheus metrics
        logger.debug({ hostname, family, cached }, 'DNS cache hit');
        return process.nextTick(() =>
          callback(null, cached.address, cached.family),
        );
      }

      // Cache miss - perform actual lookup
      this.checkAndResetTTLPeriod();
      this.stats.misses++;
      dnsCacheMisses.inc(); // Update Prometheus metrics
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
        },
      );
    };

    // Override dnsPromises.resolve4
    dnsPromises.resolve4 = async (hostname) => {
      // SSRF Protection: Validate hostname before resolution
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

      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.checkAndResetTTLPeriod();
        this.stats.hits++;
        dnsCacheHits.inc(); // Update Prometheus metrics
        logger.debug({ hostname, cached }, 'DNS resolve4 cache hit');
        return cached.addresses;
      }

      try {
        this.checkAndResetTTLPeriod();
        this.stats.misses++;
        dnsCacheMisses.inc(); // Update Prometheus metrics
        const addresses = await this.originalResolve4.call(
          dnsPromises,
          hostname,
        );

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
        const safeAddresses =
          addressesValidation.filteredAddresses || addresses;
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
    };

    // Override dnsPromises.resolve6
    dnsPromises.resolve6 = async (hostname) => {
      // SSRF Protection: Validate hostname before resolution
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

      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.checkAndResetTTLPeriod();
        this.stats.hits++;
        dnsCacheHits.inc(); // Update Prometheus metrics
        logger.debug({ hostname, cached }, 'DNS resolve6 cache hit');
        return cached.addresses;
      }

      try {
        this.checkAndResetTTLPeriod();
        this.stats.misses++;
        dnsCacheMisses.inc(); // Update Prometheus metrics
        const addresses = await this.originalResolve6.call(
          dnsPromises,
          hostname,
        );

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
        const safeAddresses =
          addressesValidation.filteredAddresses || addresses;
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
    };

    logger.info('DNS interceptors installed');
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

  // Handle IPC DNS lookup requests from child processes
  async handleDNSLookupRequest(hostname, options = {}) {
    // SSRF Protection: Validate hostname before resolution
    const hostnameValidation = validateHostname(hostname);
    if (!hostnameValidation.allowed) {
      this.stats.errors++;
      logger.warn(
        { hostname, reason: hostnameValidation.reason },
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
      this.stats.hits++;
      dnsCacheHits.inc(); // Update Prometheus metrics
      logger.debug({ hostname, family, cached }, 'DNS cache hit (IPC)');
      return { success: true, ...cached };
    }

    // Cache miss - perform actual lookup
    this.checkAndResetTTLPeriod();
    this.stats.misses++;
    dnsCacheMisses.inc(); // Update Prometheus metrics
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
              this.stats.errors++;
              logger.warn(
                {
                  hostname,
                  address,
                  family,
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
              { hostname, address, family },
              'DNS result cached (IPC)',
            );
            resolve({ success: true, ...result });
          } else {
            this.stats.errors++;
            logger.debug({ hostname, error: err?.message }, 'DNS error (IPC)');
            resolve({ success: false, error: err?.message });
          }
        },
      );
    });
  }

  // Handle IPC DNS resolve4 requests
  async handleDNSResolve4Request(hostname) {
    // SSRF Protection: Validate hostname before resolution
    const hostnameValidation = validateHostname(hostname);
    if (!hostnameValidation.allowed) {
      this.stats.errors++;
      logger.warn(
        { hostname, reason: hostnameValidation.reason },
        'SSRF: Blocked DNS resolve4 from child process',
      );
      return { success: false, error: hostnameValidation.reason };
    }

    const cacheKey = `resolve4:${hostname}`;

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.checkAndResetTTLPeriod();
      this.stats.hits++;
      dnsCacheHits.inc(); // Update Prometheus metrics
      logger.debug({ hostname, cached }, 'DNS resolve4 cache hit (IPC)');
      return { success: true, addresses: cached.addresses };
    }

    try {
      this.checkAndResetTTLPeriod();
      this.stats.misses++;
      dnsCacheMisses.inc(); // Update Prometheus metrics
      const addresses = await this.originalResolve4.call(dnsPromises, hostname);

      // SSRF Protection: Validate resolved addresses
      const addressesValidation = validateResolvedAddresses(
        hostname,
        addresses,
      );
      if (!addressesValidation.allowed) {
        this.stats.errors++;
        logger.warn(
          {
            hostname,
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
        { hostname, addresses: safeAddresses },
        'DNS resolve4 result cached (IPC)',
      );
      return { success: true, addresses: safeAddresses };
    } catch (error) {
      this.stats.errors++;
      logger.debug(
        { hostname, error: error.message },
        'DNS resolve4 error (IPC)',
      );
      return { success: false, error: error.message };
    }
  }

  // Handle IPC DNS resolve6 requests
  async handleDNSResolve6Request(hostname) {
    // SSRF Protection: Validate hostname before resolution
    const hostnameValidation = validateHostname(hostname);
    if (!hostnameValidation.allowed) {
      this.stats.errors++;
      logger.warn(
        { hostname, reason: hostnameValidation.reason },
        'SSRF: Blocked DNS resolve6 from child process',
      );
      return { success: false, error: hostnameValidation.reason };
    }

    const cacheKey = `resolve6:${hostname}`;

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.checkAndResetTTLPeriod();
      this.stats.hits++;
      dnsCacheHits.inc(); // Update Prometheus metrics
      logger.debug({ hostname, cached }, 'DNS resolve6 cache hit (IPC)');
      return { success: true, addresses: cached.addresses };
    }

    try {
      this.checkAndResetTTLPeriod();
      this.stats.misses++;
      dnsCacheMisses.inc(); // Update Prometheus metrics
      const addresses = await this.originalResolve6.call(dnsPromises, hostname);

      // SSRF Protection: Validate resolved addresses
      const addressesValidation = validateResolvedAddresses(
        hostname,
        addresses,
      );
      if (!addressesValidation.allowed) {
        this.stats.errors++;
        logger.warn(
          {
            hostname,
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
        { hostname, addresses: safeAddresses },
        'DNS resolve6 result cached (IPC)',
      );
      return { success: true, addresses: safeAddresses };
    } catch (error) {
      this.stats.errors++;
      logger.debug(
        { hostname, error: error.message },
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

  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      evictions: 0,
    };
    this.ttlPeriodStart = Date.now();
    this.lastStatsSnapshot = { ...this.stats };
    logger.info('DNS cache stats reset');
  }

  // Lazy import SSE manager to avoid circular dependency
  async getSSEManager() {
    if (SSEManager) {
      return SSEManager;
    }

    if (sseManagerPromise) {
      await sseManagerPromise;
      return SSEManager;
    }

    sseManagerPromise = (async () => {
      const { sseManager } = await import('../utils/sse.js');
      SSEManager = sseManager;
      sseManagerPromise = null; // Clear the promise after successful load
      return SSEManager;
    })();

    await sseManagerPromise;
    return SSEManager;
  }

  // Check if stats have changed significantly and broadcast if needed
  async checkAndBroadcastStats() {
    const currentStats = this.getStats();
    const lastStats = this.lastStatsSnapshot;

    // Check if stats changed significantly
    const hitsChanged = currentStats.hits !== lastStats.hits;
    const missesChanged = currentStats.misses !== lastStats.misses;
    const errorsChanged = currentStats.errors !== lastStats.errors;
    const sizeChanged = currentStats.cacheSize !== lastStats.cacheSize;

    if (hitsChanged || missesChanged || errorsChanged || sizeChanged) {
      try {
        const sse = await this.getSSEManager();
        sse.broadcastToAdminUsers({
          type: 'dnsStatsUpdate',
          data: {
            stats: currentStats,
          },
        });

        // Update snapshot
        this.lastStatsSnapshot = {
          hits: currentStats.hits,
          misses: currentStats.misses,
          errors: currentStats.errors,
          evictions: currentStats.evictions,
          cacheSize: currentStats.cacheSize,
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to broadcast DNS stats update');
      }
    }
  }

  // Start periodic stats broadcasting
  startStatsBroadcasting() {
    if (this.statsBroadcastTimer) {
      clearInterval(this.statsBroadcastTimer);
    }

    // Broadcast stats periodically if they changed
    this.statsBroadcastTimer = setInterval(() => {
      this.checkAndBroadcastStats();
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

export default dnsCache;

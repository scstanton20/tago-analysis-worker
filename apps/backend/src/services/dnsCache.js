// services/dnsCache.js
import dns from 'dns';
import { promises as dnsPromises } from 'dns';
import path from 'path';
import config from '../config/default.js';
import { safeReadFile, safeWriteFile } from '../utils/safePath.js';
import { createChildLogger } from '../utils/logging/logger.js';
import { dnsCacheHits, dnsCacheMisses } from '../utils/metrics-enhanced.js';

const logger = createChildLogger('dns-cache');
const DNS_CONFIG_FILE = path.join(config.paths.config, 'dns-cache-config.json');

// Import SSE manager for broadcasting stats (lazy import to avoid circular dependency)
let SSEManager = null;
let sseManagerPromise = null;

class DNSCacheService {
  constructor() {
    this.cache = new Map();
    this.config = {
      enabled: false,
      ttl: 300000, // Default 5 minutes in milliseconds
      maxEntries: 1000,
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

  async loadConfig() {
    try {
      const data = await safeReadFile(DNS_CONFIG_FILE, 'utf-8');
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

  async saveConfig() {
    try {
      await safeWriteFile(
        DNS_CONFIG_FILE,
        JSON.stringify(this.config, null, 2),
      );
      logger.debug('DNS cache config saved');
    } catch (error) {
      logger.error({ err: error }, 'Failed to save DNS cache config');
    }
  }

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
        this.addToCache(cacheKey, { addresses });
        logger.debug({ hostname, addresses }, 'DNS resolve4 result cached');
        return addresses;
      } catch (error) {
        this.stats.errors++;
        throw error;
      }
    };

    // Override dnsPromises.resolve6
    dnsPromises.resolve6 = async (hostname) => {
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
        this.addToCache(cacheKey, { addresses });
        logger.debug({ hostname, addresses }, 'DNS resolve6 result cached');
        return addresses;
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
      this.addToCache(cacheKey, { addresses });
      logger.debug({ hostname, addresses }, 'DNS resolve4 result cached (IPC)');
      return { success: true, addresses };
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
      this.addToCache(cacheKey, { addresses });
      logger.debug({ hostname, addresses }, 'DNS resolve6 result cached (IPC)');
      return { success: true, addresses };
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

    logger.debug('Updated environment variables for child processes:', {
      DNS_CACHE_ENABLED: process.env.DNS_CACHE_ENABLED,
      DNS_CACHE_TTL: process.env.DNS_CACHE_TTL,
      DNS_CACHE_MAX_ENTRIES: process.env.DNS_CACHE_MAX_ENTRIES,
    });
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

    sseManagerPromise = import('../utils/sse.js').then(({ sseManager }) => {
      SSEManager = sseManager;
      sseManagerPromise = null; // Clear the promise after successful load
      return SSEManager;
    });

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
        sse.broadcast({
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

    // Broadcast stats every 10 seconds if they changed
    this.statsBroadcastTimer = setInterval(() => {
      this.checkAndBroadcastStats();
    }, 10000);
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

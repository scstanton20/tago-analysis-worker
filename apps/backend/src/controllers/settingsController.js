import { dnsCache } from '../services/dnsCache.js';
import { sseManager } from '../utils/sse/index.js';

/**
 * Controller class for managing application settings
 * Currently focused on DNS cache configuration and management.
 *
 * All methods are static and follow Express route handler pattern (req, res).
 * Request-scoped logging is available via req.log.
 */
export class SettingsController {
  /**
   * Retrieve DNS cache configuration and statistics
   * Returns current DNS cache settings and performance metrics
   *
   * @param {Object} req - Express request object
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with config (enabled, ttl, maxEntries) and stats (hits, misses, size)
   */
  static async getDNSConfig(req, res) {
    req.log.info({ action: 'getDNSConfig' }, 'Getting DNS configuration');

    const config = dnsCache.getConfig();
    const stats = dnsCache.getStats();

    req.log.info(
      { action: 'getDNSConfig', cacheSize: stats.size },
      'DNS configuration retrieved',
    );

    res.json({
      config,
      stats,
    });
  }

  /**
   * Update DNS cache configuration
   * Modifies DNS cache settings and persists to configuration file
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {boolean} [req.body.enabled] - Enable/disable DNS caching
   * @param {number} [req.body.ttl] - Time-to-live in milliseconds
   * @param {number} [req.body.maxEntries] - Maximum cache entries
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Updates DNS cache configuration in memory and on disk
   * - Broadcasts 'dnsConfigUpdated' SSE event to admin users
   *
   * Security:
   * - Validation handled by middleware
   */
  static async updateDNSConfig(req, res) {
    const { enabled, ttl, maxEntries } = req.body;

    // Validation handled by middleware
    const newConfig = {};
    if (enabled !== undefined) newConfig.enabled = enabled;
    if (ttl !== undefined) newConfig.ttl = ttl;
    if (maxEntries !== undefined) newConfig.maxEntries = maxEntries;

    req.log.info(
      { action: 'updateDNSConfig', updates: Object.keys(newConfig) },
      'Updating DNS configuration',
    );

    await dnsCache.updateConfig(newConfig);

    const config = dnsCache.getConfig();
    const stats = dnsCache.getStats();

    req.log.info({ action: 'updateDNSConfig', config }, 'DNS config updated');

    // Broadcast DNS cache config update via SSE (admin only)
    sseManager.broadcastToAdminUsers({
      type: 'dnsConfigUpdated',
      data: {
        config,
        stats,
      },
    });

    res.json({
      message: 'DNS configuration updated successfully',
      config,
      stats,
    });
  }

  /**
   * Retrieve all DNS cache entries
   * Returns list of cached DNS records with hostnames and resolved IPs
   *
   * @param {Object} req - Express request object
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with entries array and total count
   */
  static async getDNSCacheEntries(req, res) {
    req.log.info({ action: 'getDNSCacheEntries' }, 'Getting DNS cache entries');

    const entries = dnsCache.getCacheEntries();

    req.log.info(
      { action: 'getDNSCacheEntries', count: entries.length },
      'DNS cache entries retrieved',
    );

    res.json({
      entries,
      total: entries.length,
    });
  }

  /**
   * Clear all DNS cache entries
   * Removes all cached DNS records from memory
   *
   * @param {Object} req - Express request object
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Clears all DNS cache entries from memory
   * - Broadcasts 'dnsCacheCleared' SSE event to admin users
   *
   * Response:
   * - JSON object with entriesCleared count and updated stats
   */
  static async clearDNSCache(req, res) {
    req.log.info({ action: 'clearDNSCache' }, 'Clearing DNS cache');

    const entriesCleared = dnsCache.clearCache();
    const stats = dnsCache.getStats();

    req.log.info(
      { action: 'clearDNSCache', entriesCleared },
      'DNS cache cleared',
    );

    // Broadcast DNS cache cleared via SSE (admin only)
    sseManager.broadcastToAdminUsers({
      type: 'dnsCacheCleared',
      data: {
        entriesCleared,
        stats,
      },
    });

    res.json({
      message: 'DNS cache cleared successfully',
      entriesCleared,
      stats,
    });
  }

  /**
   * Delete a specific DNS cache entry
   * Removes a single cached DNS record by hostname key
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.key - Hostname key to delete from cache
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - Status 200 with success message if deleted
   * - Status 404 if entry not found
   *
   * Security:
   * - Validation handled by middleware
   */
  static async deleteDNSCacheEntry(req, res) {
    const { key } = req.params;

    // Validation handled by middleware
    req.log.info(
      { action: 'deleteDNSCacheEntry', key },
      'Deleting DNS cache entry',
    );

    const deleted = dnsCache.cache.delete(key);

    if (deleted) {
      req.log.info(
        { action: 'deleteDNSCacheEntry', key },
        'DNS cache entry deleted',
      );
      res.json({
        message: 'DNS cache entry deleted successfully',
        key,
      });
    } else {
      req.log.warn(
        { action: 'deleteDNSCacheEntry', key },
        'Cache entry not found',
      );
      res.status(404).json({ error: 'Cache entry not found' });
    }
  }

  /**
   * Reset DNS cache statistics
   * Resets hit/miss counters and other performance metrics
   *
   * @param {Object} req - Express request object
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Resets DNS cache statistics counters (hits, misses, etc.)
   * - Broadcasts 'dnsStatsReset' SSE event to admin users
   *
   * Response:
   * - JSON object with reset stats
   */
  static async resetDNSStats(req, res) {
    req.log.info({ action: 'resetDNSStats' }, 'Resetting DNS cache statistics');

    dnsCache.resetStats();
    const stats = dnsCache.getStats();

    req.log.info({ action: 'resetDNSStats' }, 'DNS cache stats reset');

    // Broadcast DNS cache stats reset via SSE (admin only)
    sseManager.broadcastToAdminUsers({
      type: 'dnsStatsReset',
      data: {
        stats,
      },
    });

    res.json({
      message: 'DNS cache statistics reset successfully',
      stats,
    });
  }
}

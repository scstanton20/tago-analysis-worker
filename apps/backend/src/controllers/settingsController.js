// backend/src/controllers/settingsController.js
import dnsCache from '../services/dnsCache.js';
import { sseManager } from '../utils/sse.js';
import { handleError } from '../utils/responseHelpers.js';

class SettingsController {
  // DNS Cache Settings

  // Get DNS configuration
  static async getDNSConfig(req, res) {
    req.log.info({ action: 'getDNSConfig' }, 'Getting DNS configuration');

    try {
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
    } catch (error) {
      handleError(res, error, 'getting DNS configuration', {
        logger: req.logger,
      });
    }
  }

  // Update DNS configuration
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

    try {
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
    } catch (error) {
      handleError(res, error, 'updating DNS configuration', {
        logger: req.logger,
      });
    }
  }

  // Get DNS cache entries
  static async getDNSCacheEntries(req, res) {
    req.log.info({ action: 'getDNSCacheEntries' }, 'Getting DNS cache entries');

    try {
      const entries = dnsCache.getCacheEntries();

      req.log.info(
        { action: 'getDNSCacheEntries', count: entries.length },
        'DNS cache entries retrieved',
      );

      res.json({
        entries,
        total: entries.length,
      });
    } catch (error) {
      handleError(res, error, 'getting DNS cache entries', {
        logger: req.logger,
      });
    }
  }

  // Clear DNS cache
  static async clearDNSCache(req, res) {
    req.log.info({ action: 'clearDNSCache' }, 'Clearing DNS cache');

    try {
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
    } catch (error) {
      handleError(res, error, 'clearing DNS cache', { logger: req.logger });
    }
  }

  // Delete DNS cache entry
  static async deleteDNSCacheEntry(req, res) {
    const { key } = req.params;

    // Validation handled by middleware
    req.log.info(
      { action: 'deleteDNSCacheEntry', key },
      'Deleting DNS cache entry',
    );

    try {
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
    } catch (error) {
      handleError(res, error, 'deleting DNS cache entry', {
        logger: req.logger,
      });
    }
  }

  // Reset DNS statistics
  static async resetDNSStats(req, res) {
    req.log.info({ action: 'resetDNSStats' }, 'Resetting DNS cache statistics');

    try {
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
    } catch (error) {
      handleError(res, error, 'resetting DNS statistics', {
        logger: req.logger,
      });
    }
  }
}

export default SettingsController;

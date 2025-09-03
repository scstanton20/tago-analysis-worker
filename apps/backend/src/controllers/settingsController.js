// controllers/settingsController.js
import dnsCache from '../services/dnsCache.js';
import { createChildLogger } from '../utils/logging/logger.js';
import { sseManager } from '../utils/sse.js';

const logger = createChildLogger('settings-controller');

// DNS Cache Settings
export const getDNSConfig = async (req, res) => {
  try {
    const config = dnsCache.getConfig();
    const stats = dnsCache.getStats();
    res.json({
      config,
      stats,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get DNS config');
    res.status(500).json({ error: 'Failed to get DNS configuration' });
  }
};

export const updateDNSConfig = async (req, res) => {
  try {
    const { enabled, ttl, maxEntries } = req.body;

    // Validate input
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    if (ttl !== undefined) {
      if (typeof ttl !== 'number' || ttl < 1000 || ttl > 86400000) {
        return res.status(400).json({
          error: 'ttl must be between 1000ms and 86400000ms (1 day)',
        });
      }
    }
    if (maxEntries !== undefined) {
      if (
        typeof maxEntries !== 'number' ||
        maxEntries < 10 ||
        maxEntries > 10000
      ) {
        return res
          .status(400)
          .json({ error: 'maxEntries must be between 10 and 10000' });
      }
    }

    const newConfig = {};
    if (enabled !== undefined) newConfig.enabled = enabled;
    if (ttl !== undefined) newConfig.ttl = ttl;
    if (maxEntries !== undefined) newConfig.maxEntries = maxEntries;

    await dnsCache.updateConfig(newConfig);

    const config = dnsCache.getConfig();
    const stats = dnsCache.getStats();

    logger.info({ config }, 'DNS config updated');

    // Broadcast DNS cache config update via SSE
    sseManager.broadcast({
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
    logger.error({ err: error }, 'Failed to update DNS config');
    res.status(500).json({ error: 'Failed to update DNS configuration' });
  }
};

export const getDNSCacheEntries = async (req, res) => {
  try {
    const entries = dnsCache.getCacheEntries();
    res.json({
      entries,
      total: entries.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get DNS cache entries');
    res.status(500).json({ error: 'Failed to get DNS cache entries' });
  }
};

export const clearDNSCache = async (req, res) => {
  try {
    const entriesCleared = dnsCache.clearCache();
    const stats = dnsCache.getStats();

    logger.info({ entriesCleared }, 'DNS cache cleared');

    // Broadcast DNS cache cleared via SSE
    sseManager.broadcast({
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
    logger.error({ err: error }, 'Failed to clear DNS cache');
    res.status(500).json({ error: 'Failed to clear DNS cache' });
  }
};

export const deleteDNSCacheEntry = async (req, res) => {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({ error: 'Cache key is required' });
    }

    const deleted = dnsCache.cache.delete(key);

    if (deleted) {
      logger.info({ key }, 'DNS cache entry deleted');
      res.json({
        message: 'DNS cache entry deleted successfully',
        key,
      });
    } else {
      res.status(404).json({ error: 'Cache entry not found' });
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete DNS cache entry');
    res.status(500).json({ error: 'Failed to delete DNS cache entry' });
  }
};

export const resetDNSStats = async (req, res) => {
  try {
    dnsCache.resetStats();
    const stats = dnsCache.getStats();

    logger.info('DNS cache stats reset');

    // Broadcast DNS cache stats reset via SSE
    sseManager.broadcast({
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
    logger.error({ err: error }, 'Failed to reset DNS stats');
    res.status(500).json({ error: 'Failed to reset DNS statistics' });
  }
};

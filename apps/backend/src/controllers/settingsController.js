// controllers/settingsController.js
import dnsCache from '../services/dnsCache.js';
import { sseManager } from '../utils/sse.js';
import { handleError } from '../utils/responseHelpers.js';

// DNS Cache Settings
export const getDNSConfig = async (req, res) => {
  const logger =
    req.logger?.child({ controller: 'SettingsController' }) || console;

  logger.info({ action: 'getDNSConfig' }, 'Getting DNS configuration');

  try {
    const config = dnsCache.getConfig();
    const stats = dnsCache.getStats();

    logger.info(
      { action: 'getDNSConfig', cacheSize: stats.size },
      'DNS configuration retrieved',
    );

    res.json({
      config,
      stats,
    });
  } catch (error) {
    handleError(res, error, 'getting DNS configuration');
  }
};

export const updateDNSConfig = async (req, res) => {
  const logger =
    req.logger?.child({ controller: 'SettingsController' }) || console;
  const { enabled, ttl, maxEntries } = req.body;

  // Validate input
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    logger.warn(
      { action: 'updateDNSConfig' },
      'Update failed: enabled must be boolean',
    );
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }
  if (ttl !== undefined) {
    if (typeof ttl !== 'number' || ttl < 1000 || ttl > 86400000) {
      logger.warn(
        { action: 'updateDNSConfig', ttl },
        'Update failed: invalid ttl value',
      );
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
      logger.warn(
        { action: 'updateDNSConfig', maxEntries },
        'Update failed: invalid maxEntries value',
      );
      return res
        .status(400)
        .json({ error: 'maxEntries must be between 10 and 10000' });
    }
  }

  const newConfig = {};
  if (enabled !== undefined) newConfig.enabled = enabled;
  if (ttl !== undefined) newConfig.ttl = ttl;
  if (maxEntries !== undefined) newConfig.maxEntries = maxEntries;

  logger.info(
    { action: 'updateDNSConfig', updates: Object.keys(newConfig) },
    'Updating DNS configuration',
  );

  try {
    await dnsCache.updateConfig(newConfig);

    const config = dnsCache.getConfig();
    const stats = dnsCache.getStats();

    logger.info({ action: 'updateDNSConfig', config }, 'DNS config updated');

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
    handleError(res, error, 'updating DNS configuration');
  }
};

export const getDNSCacheEntries = async (req, res) => {
  const logger =
    req.logger?.child({ controller: 'SettingsController' }) || console;

  logger.info({ action: 'getDNSCacheEntries' }, 'Getting DNS cache entries');

  try {
    const entries = dnsCache.getCacheEntries();

    logger.info(
      { action: 'getDNSCacheEntries', count: entries.length },
      'DNS cache entries retrieved',
    );

    res.json({
      entries,
      total: entries.length,
    });
  } catch (error) {
    handleError(res, error, 'getting DNS cache entries');
  }
};

export const clearDNSCache = async (req, res) => {
  const logger =
    req.logger?.child({ controller: 'SettingsController' }) || console;

  logger.info({ action: 'clearDNSCache' }, 'Clearing DNS cache');

  try {
    const entriesCleared = dnsCache.clearCache();
    const stats = dnsCache.getStats();

    logger.info(
      { action: 'clearDNSCache', entriesCleared },
      'DNS cache cleared',
    );

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
    handleError(res, error, 'clearing DNS cache');
  }
};

export const deleteDNSCacheEntry = async (req, res) => {
  const logger =
    req.logger?.child({ controller: 'SettingsController' }) || console;
  const { key } = req.params;

  if (!key) {
    logger.warn(
      { action: 'deleteDNSCacheEntry' },
      'Delete failed: missing cache key',
    );
    return res.status(400).json({ error: 'Cache key is required' });
  }

  logger.info(
    { action: 'deleteDNSCacheEntry', key },
    'Deleting DNS cache entry',
  );

  try {
    const deleted = dnsCache.cache.delete(key);

    if (deleted) {
      logger.info(
        { action: 'deleteDNSCacheEntry', key },
        'DNS cache entry deleted',
      );
      res.json({
        message: 'DNS cache entry deleted successfully',
        key,
      });
    } else {
      logger.warn(
        { action: 'deleteDNSCacheEntry', key },
        'Cache entry not found',
      );
      res.status(404).json({ error: 'Cache entry not found' });
    }
  } catch (error) {
    handleError(res, error, 'deleting DNS cache entry');
  }
};

export const resetDNSStats = async (req, res) => {
  const logger =
    req.logger?.child({ controller: 'SettingsController' }) || console;

  logger.info({ action: 'resetDNSStats' }, 'Resetting DNS cache statistics');

  try {
    dnsCache.resetStats();
    const stats = dnsCache.getStats();

    logger.info({ action: 'resetDNSStats' }, 'DNS cache stats reset');

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
    handleError(res, error, 'resetting DNS statistics');
  }
};

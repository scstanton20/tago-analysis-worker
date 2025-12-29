import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { dnsCache } from '../services/dnsCache.ts';
import { sseManager } from '../utils/sse/index.ts';

/** Express request with request-scoped logger */
interface RequestWithLogger extends Request {
  log: Logger;
}

/** Update DNS config request body */
interface UpdateDNSConfigBody {
  enabled?: boolean;
  ttl?: number;
  maxEntries?: number;
}

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
   */
  static async getDNSConfig(
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
    req.log.info({ action: 'getDNSConfig' }, 'Getting DNS configuration');

    const config = dnsCache.getConfig();
    const stats = dnsCache.getStats();

    req.log.info(
      { action: 'getDNSConfig', cacheSize: stats.cacheSize },
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
   */
  static async updateDNSConfig(
    req: RequestWithLogger & { body: UpdateDNSConfigBody },
    res: Response,
  ): Promise<void> {
    const { enabled, ttl, maxEntries } = req.body;

    // Validation handled by middleware
    const newConfig: Partial<UpdateDNSConfigBody> = {};
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
   */
  static async getDNSCacheEntries(
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
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
   */
  static async clearDNSCache(
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
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
   */
  static async deleteDNSCacheEntry(
    req: RequestWithLogger & { params: { key: string } },
    res: Response,
  ): Promise<void> {
    const { key } = req.params;

    // Validation handled by middleware
    req.log.info(
      { action: 'deleteDNSCacheEntry', key },
      'Deleting DNS cache entry',
    );

    const deleted = dnsCache.deleteCacheEntry(key);

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
   */
  static async resetDNSStats(
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
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

  /**
   * Get DNS statistics for all analyses
   * Returns per-analysis DNS cache usage statistics
   */
  static async getAllAnalysisDNSStats(
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
    req.log.info(
      { action: 'getAllAnalysisDNSStats' },
      'Getting all analysis DNS stats',
    );

    const analysisStats = dnsCache.getAllAnalysisStats();

    req.log.info(
      {
        action: 'getAllAnalysisDNSStats',
        count: Object.keys(analysisStats).length,
      },
      'All analysis DNS stats retrieved',
    );

    res.json({
      analysisStats,
    });
  }

  /**
   * Get DNS statistics for a specific analysis
   * Returns DNS cache usage statistics for the specified analysis
   */
  static async getAnalysisDNSStats(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.info(
      { action: 'getAnalysisDNSStats', analysisId },
      'Getting analysis DNS stats',
    );

    const stats = dnsCache.getAnalysisStats(analysisId);

    req.log.info(
      { action: 'getAnalysisDNSStats', analysisId, stats },
      'Analysis DNS stats retrieved',
    );

    res.json({
      analysisId,
      stats,
    });
  }

  /**
   * Get DNS cache entries for a specific analysis
   * Returns cache entries used by the specified analysis
   */
  static async getAnalysisDNSCacheEntries(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.info(
      { action: 'getAnalysisDNSCacheEntries', analysisId },
      'Getting analysis DNS cache entries',
    );

    const entries = dnsCache.getAnalysisCacheEntries(analysisId);

    req.log.info(
      {
        action: 'getAnalysisDNSCacheEntries',
        analysisId,
        count: entries.length,
      },
      'Analysis DNS cache entries retrieved',
    );

    res.json({
      analysisId,
      entries,
      total: entries.length,
    });
  }
}

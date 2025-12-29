import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createControllerRequest,
  createControllerResponse,
  type MockResponse,
} from '../utils/testHelpers.ts';
import type {
  DNSCacheEntry,
  DNSCacheConfig,
} from '@tago-analysis-worker/types';

// Mock dependencies before importing the controller
vi.mock('../../src/services/dnsCache.ts', () => ({
  dnsCache: {
    getConfig: vi.fn(),
    getStats: vi.fn(),
    updateConfig: vi.fn(),
    getCacheEntries: vi.fn(),
    clearCache: vi.fn(),
    deleteCacheEntry: vi.fn(),
    cache: {
      delete: vi.fn(),
    },
    resetStats: vi.fn(),
  },
}));

vi.mock('../../src/utils/sse/index.ts', () => ({
  sseManager: {
    broadcastToAdminUsers: vi.fn(),
  },
}));

vi.mock('../../src/utils/responseHelpers.ts', () => ({
  handleError: vi.fn((res: MockResponse, error: Error) => {
    res.status(500).json({ error: error.message });
  }),
}));

// Type definitions for mocked services
interface MockDNSCache {
  getConfig: Mock;
  getStats: Mock;
  updateConfig: Mock;
  getCacheEntries: Mock;
  clearCache: Mock;
  deleteCacheEntry: Mock;
  cache: {
    delete: Mock;
  };
  resetStats: Mock;
}

interface MockSSEManager {
  broadcastToAdminUsers: Mock;
}

// Import after mocks
const { dnsCache } = (await import(
  '../../src/services/dnsCache.ts'
)) as unknown as {
  dnsCache: MockDNSCache;
};
const { sseManager } = (await import(
  '../../src/utils/sse/index.ts'
)) as unknown as {
  sseManager: MockSSEManager;
};
const { SettingsController } = await import(
  '../../src/controllers/settingsController.ts'
);

describe('SettingsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDNSConfig', () => {
    it('should get DNS configuration and stats successfully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockConfig: DNSCacheConfig = {
        enabled: true,
        ttl: 60000,
        maxEntries: 1000,
      };

      const mockStats = {
        hits: 150,
        misses: 50,
        cacheSize: 75,
        errors: 0,
        evictions: 0,
        hitRate: 0.75,
        ttlPeriodAge: 5000,
        ttlPeriodRemaining: 5000,
        ttlPeriodProgress: '50%',
      };

      dnsCache.getConfig.mockReturnValue(mockConfig);
      dnsCache.getStats.mockReturnValue(mockStats);

      await SettingsController.getDNSConfig(req, res);

      expect(dnsCache.getConfig).toHaveBeenCalled();
      expect(dnsCache.getStats).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        config: mockConfig,
        stats: mockStats,
      });
    });
  });

  describe('updateDNSConfig', () => {
    it('should update DNS configuration successfully with all fields', async () => {
      const req = createControllerRequest({
        body: {
          enabled: false,
          ttl: 120000,
          maxEntries: 500,
        },
      });
      const res = createControllerResponse();

      const updatedConfig: DNSCacheConfig = {
        enabled: false,
        ttl: 120000,
        maxEntries: 500,
      };

      const mockStats = {
        hits: 200,
        misses: 30,
        cacheSize: 100,
        errors: 0,
        evictions: 0,
        hitRate: 0.87,
        ttlPeriodAge: 5000,
        ttlPeriodRemaining: 5000,
        ttlPeriodProgress: '50%',
      };

      dnsCache.updateConfig.mockResolvedValue(undefined);
      dnsCache.getConfig.mockReturnValue(updatedConfig);
      dnsCache.getStats.mockReturnValue(mockStats);

      await SettingsController.updateDNSConfig(req, res);

      expect(dnsCache.updateConfig).toHaveBeenCalledWith({
        enabled: false,
        ttl: 120000,
        maxEntries: 500,
      });
      expect(res.json).toHaveBeenCalledWith({
        message: 'DNS configuration updated successfully',
        config: updatedConfig,
        stats: mockStats,
      });
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'dnsConfigUpdated',
        data: {
          config: updatedConfig,
          stats: mockStats,
        },
      });
    });

    it('should update DNS configuration with partial fields', async () => {
      const req = createControllerRequest({
        body: {
          enabled: true,
        },
      });
      const res = createControllerResponse();

      const updatedConfig: DNSCacheConfig = {
        enabled: true,
        ttl: 60000,
        maxEntries: 1000,
      };

      dnsCache.updateConfig.mockResolvedValue(undefined);
      dnsCache.getConfig.mockReturnValue(updatedConfig);
      dnsCache.getStats.mockReturnValue({ hits: 0, misses: 0, cacheSize: 0 });

      await SettingsController.updateDNSConfig(req, res);

      expect(dnsCache.updateConfig).toHaveBeenCalledWith({
        enabled: true,
      });
    });

    it('should handle undefined values in request body', async () => {
      const req = createControllerRequest({
        body: {
          enabled: undefined,
          ttl: 30000,
        },
      });
      const res = createControllerResponse();

      dnsCache.updateConfig.mockResolvedValue(undefined);
      dnsCache.getConfig.mockReturnValue({ enabled: true, ttl: 30000 });
      dnsCache.getStats.mockReturnValue({ hits: 0, misses: 0, cacheSize: 0 });

      await SettingsController.updateDNSConfig(req, res);

      expect(dnsCache.updateConfig).toHaveBeenCalledWith({
        ttl: 30000,
      });
    });
  });

  describe('getDNSCacheEntries', () => {
    it('should get all DNS cache entries successfully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockEntries: DNSCacheEntry[] = [
        {
          key: 'example.com',
          data: { address: '1.2.3.4', family: 4 },
          timestamp: Date.now(),
          age: 1000,
          remainingTTL: 9000,
          expired: false,
        },
        {
          key: 'test.com',
          data: { address: '5.6.7.8', family: 4 },
          timestamp: Date.now(),
          age: 2000,
          remainingTTL: 8000,
          expired: false,
        },
      ];

      dnsCache.getCacheEntries.mockReturnValue(mockEntries);

      await SettingsController.getDNSCacheEntries(req, res);

      expect(dnsCache.getCacheEntries).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        entries: mockEntries,
        total: 2,
      });
    });

    it('should return empty array when no entries exist', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      dnsCache.getCacheEntries.mockReturnValue([]);

      await SettingsController.getDNSCacheEntries(req, res);

      expect(res.json).toHaveBeenCalledWith({
        entries: [],
        total: 0,
      });
    });
  });

  describe('clearDNSCache', () => {
    it('should clear DNS cache successfully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockStats = {
        hits: 0,
        misses: 0,
        cacheSize: 0,
        errors: 0,
        evictions: 0,
        hitRate: 0,
        ttlPeriodAge: 0,
        ttlPeriodRemaining: 0,
        ttlPeriodProgress: '0%',
      };

      dnsCache.clearCache.mockReturnValue(10);
      dnsCache.getStats.mockReturnValue(mockStats);

      await SettingsController.clearDNSCache(req, res);

      expect(dnsCache.clearCache).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: 'DNS cache cleared successfully',
        entriesCleared: 10,
        stats: mockStats,
      });
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'dnsCacheCleared',
        data: {
          entriesCleared: 10,
          stats: mockStats,
        },
      });
    });

    it('should handle clearing empty cache', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      dnsCache.clearCache.mockReturnValue(0);
      dnsCache.getStats.mockReturnValue({ hits: 0, misses: 0, cacheSize: 0 });

      await SettingsController.clearDNSCache(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entriesCleared: 0,
        }),
      );
    });
  });

  describe('deleteDNSCacheEntry', () => {
    it('should delete DNS cache entry successfully', async () => {
      const req = createControllerRequest({
        params: { key: 'example.com' },
      });
      const res = createControllerResponse();

      dnsCache.deleteCacheEntry.mockReturnValue(true);

      await SettingsController.deleteDNSCacheEntry(req, res);

      expect(dnsCache.deleteCacheEntry).toHaveBeenCalledWith('example.com');
      expect(res.json).toHaveBeenCalledWith({
        message: 'DNS cache entry deleted successfully',
        key: 'example.com',
      });
    });

    it('should return 404 when entry not found', async () => {
      const req = createControllerRequest({
        params: { key: 'nonexistent.com' },
      });
      const res = createControllerResponse();

      dnsCache.deleteCacheEntry.mockReturnValue(false);

      await SettingsController.deleteDNSCacheEntry(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cache entry not found',
      });
    });

    it('should handle special characters in key', async () => {
      const req = createControllerRequest({
        params: { key: 'sub-domain.example.com' },
      });
      const res = createControllerResponse();

      dnsCache.deleteCacheEntry.mockReturnValue(true);

      await SettingsController.deleteDNSCacheEntry(req, res);

      expect(dnsCache.deleteCacheEntry).toHaveBeenCalledWith(
        'sub-domain.example.com',
      );
    });
  });

  describe('resetDNSStats', () => {
    it('should reset DNS statistics successfully', async () => {
      const req = createControllerRequest();
      const res = createControllerResponse();

      const mockStats = {
        hits: 0,
        misses: 0,
        cacheSize: 0,
        errors: 0,
        evictions: 0,
        hitRate: 0,
        ttlPeriodAge: 0,
        ttlPeriodRemaining: 0,
        ttlPeriodProgress: '0%',
      };

      dnsCache.resetStats.mockReturnValue(undefined);
      dnsCache.getStats.mockReturnValue(mockStats);

      await SettingsController.resetDNSStats(req, res);

      expect(dnsCache.resetStats).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: 'DNS cache statistics reset successfully',
        stats: mockStats,
      });
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'dnsStatsReset',
        data: {
          stats: mockStats,
        },
      });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../utils/testHelpers.js';

// Mock dependencies before importing the controller
vi.mock('../../src/services/dnsCache.js', () => ({
  dnsCache: {
    getConfig: vi.fn(),
    getStats: vi.fn(),
    updateConfig: vi.fn(),
    getCacheEntries: vi.fn(),
    clearCache: vi.fn(),
    cache: {
      delete: vi.fn(),
    },
    resetStats: vi.fn(),
  },
}));

vi.mock('../../src/utils/sse/index.js', () => ({
  sseManager: {
    broadcastToAdminUsers: vi.fn(),
  },
}));

vi.mock('../../src/utils/responseHelpers.js', () => ({
  handleError: vi.fn((res, error) => {
    res.status(500).json({ error: error.message });
  }),
}));

// Import after mocks
const { dnsCache } = await import('../../src/services/dnsCache.js');
const { sseManager } = await import('../../src/utils/sse/index.js');
const { SettingsController } = await import(
  '../../src/controllers/settingsController.js'
);

describe('SettingsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDNSConfig', () => {
    it('should get DNS configuration and stats successfully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockConfig = {
        enabled: true,
        ttl: 60000,
        maxEntries: 1000,
      };

      const mockStats = {
        hits: 150,
        misses: 50,
        size: 75,
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
      const req = createMockRequest({
        body: {
          enabled: false,
          ttl: 120000,
          maxEntries: 500,
        },
      });
      const res = createMockResponse();

      const updatedConfig = {
        enabled: false,
        ttl: 120000,
        maxEntries: 500,
      };

      const mockStats = {
        hits: 200,
        misses: 30,
        size: 100,
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
      const req = createMockRequest({
        body: {
          enabled: true,
        },
      });
      const res = createMockResponse();

      const updatedConfig = {
        enabled: true,
        ttl: 60000,
        maxEntries: 1000,
      };

      dnsCache.updateConfig.mockResolvedValue(undefined);
      dnsCache.getConfig.mockReturnValue(updatedConfig);
      dnsCache.getStats.mockReturnValue({ hits: 0, misses: 0, size: 0 });

      await SettingsController.updateDNSConfig(req, res);

      expect(dnsCache.updateConfig).toHaveBeenCalledWith({
        enabled: true,
      });
    });

    it('should handle undefined values in request body', async () => {
      const req = createMockRequest({
        body: {
          enabled: undefined,
          ttl: 30000,
        },
      });
      const res = createMockResponse();

      dnsCache.updateConfig.mockResolvedValue(undefined);
      dnsCache.getConfig.mockReturnValue({ enabled: true, ttl: 30000 });
      dnsCache.getStats.mockReturnValue({ hits: 0, misses: 0, size: 0 });

      await SettingsController.updateDNSConfig(req, res);

      expect(dnsCache.updateConfig).toHaveBeenCalledWith({
        ttl: 30000,
      });
    });
  });

  describe('getDNSCacheEntries', () => {
    it('should get all DNS cache entries successfully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockEntries = [
        { hostname: 'example.com', ip: '1.2.3.4', timestamp: Date.now() },
        { hostname: 'test.com', ip: '5.6.7.8', timestamp: Date.now() },
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
      const req = createMockRequest();
      const res = createMockResponse();

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
      const req = createMockRequest();
      const res = createMockResponse();

      const mockStats = {
        hits: 0,
        misses: 0,
        size: 0,
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
      const req = createMockRequest();
      const res = createMockResponse();

      dnsCache.clearCache.mockReturnValue(0);
      dnsCache.getStats.mockReturnValue({ hits: 0, misses: 0, size: 0 });

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
      const req = createMockRequest({
        params: { key: 'example.com' },
      });
      const res = createMockResponse();

      dnsCache.cache.delete.mockReturnValue(true);

      await SettingsController.deleteDNSCacheEntry(req, res);

      expect(dnsCache.cache.delete).toHaveBeenCalledWith('example.com');
      expect(res.json).toHaveBeenCalledWith({
        message: 'DNS cache entry deleted successfully',
        key: 'example.com',
      });
    });

    it('should return 404 when entry not found', async () => {
      const req = createMockRequest({
        params: { key: 'nonexistent.com' },
      });
      const res = createMockResponse();

      dnsCache.cache.delete.mockReturnValue(false);

      await SettingsController.deleteDNSCacheEntry(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cache entry not found',
      });
    });

    it('should handle special characters in key', async () => {
      const req = createMockRequest({
        params: { key: 'sub-domain.example.com' },
      });
      const res = createMockResponse();

      dnsCache.cache.delete.mockReturnValue(true);

      await SettingsController.deleteDNSCacheEntry(req, res);

      expect(dnsCache.cache.delete).toHaveBeenCalledWith(
        'sub-domain.example.com',
      );
    });
  });

  describe('resetDNSStats', () => {
    it('should reset DNS statistics successfully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockStats = {
        hits: 0,
        misses: 0,
        size: 0,
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

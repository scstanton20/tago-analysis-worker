import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import type {
  DNSCacheConfig,
  DNSCacheExtendedStats,
} from '@tago-analysis-worker/types';

// Mock dependencies
vi.mock('dns', async () => {
  const mockLookup = vi.fn();
  const mockResolve4 = vi.fn();
  const mockResolve6 = vi.fn();
  return {
    default: {
      lookup: mockLookup,
    },
    lookup: mockLookup,
    promises: {
      resolve4: mockResolve4,
      resolve6: mockResolve6,
    },
  };
});

vi.mock('../../src/utils/safePath.ts', () => ({
  safeReadFile: vi.fn(),
  safeWriteFile: vi.fn(),
}));

vi.mock('../../src/utils/ssrfProtection.ts', () => ({
  validateHostname: vi.fn((hostname: string) => ({ allowed: true, hostname })),
  validateResolvedAddress: vi.fn(() => ({ allowed: true })),
  validateResolvedAddresses: vi.fn(() => ({ allowed: true })),
}));

vi.mock('../../src/utils/metrics-enhanced.ts', () => ({
  dnsCacheHits: { inc: vi.fn() },
  dnsCacheMisses: { inc: vi.fn() },
}));

vi.mock('../../src/config/default.ts', () => ({
  config: {
    paths: {
      config: '/tmp/config',
    },
  },
}));

vi.mock('../../src/constants.ts', () => ({
  DNS_CACHE: {
    DEFAULT_TTL_MS: 300000,
    DEFAULT_MAX_ENTRIES: 1000,
    STATS_BROADCAST_INTERVAL_MS: 5000,
  },
}));

vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

type SafePathMock = {
  safeReadFile: Mock;
  safeWriteFile: Mock;
};

type SSRFProtectionMock = {
  validateHostname: Mock;
  validateResolvedAddress: Mock;
  validateResolvedAddresses: Mock;
};

type CacheEntry<T = unknown> = {
  data: T;
  timestamp: number;
};

// Use shared types from @tago-analysis-worker/types
type DNSCacheStats = DNSCacheExtendedStats;

/** Per-analysis stats tracking (internal) */
type AnalysisStatsEntry = {
  hits: number;
  misses: number;
  errors: number;
  hostnames: Set<string>;
  cacheKeys: Set<string>;
};

type DNSCacheType = {
  cache: Map<string, CacheEntry>;
  config: DNSCacheConfig;
  stats: DNSCacheStats;
  ttlPeriodStart: number;
  originalLookup: Mock | null;
  originalResolve4: Mock | null;
  originalResolve6: Mock | null;
  analysisStats: Map<string, AnalysisStatsEntry>;
  cacheKeyToAnalyses: Map<string, Set<string>>;
  lastStatsSnapshot: {
    hits: number;
    misses: number;
    errors: number;
    evictions: number;
    cacheSize: number;
  };
  initialize: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  getFromCache: (key: string) => unknown | null;
  addToCache: (key: string, data: unknown) => void;
  clearCache: () => number;
  getCacheEntries: () => Array<{
    key: string;
    data: unknown;
    age: number;
    remainingTTL: number;
    expired: boolean;
    source: string;
  }>;
  updateConfig: (config: Partial<DNSCacheConfig>) => Promise<void>;
  updateEnvironmentVariables: () => void;
  checkAndResetTTLPeriod: () => void;
  getStats: () => {
    hits: number;
    misses: number;
    cacheSize: number;
    hitRate: string | number;
    ttlPeriodAge: number;
    ttlPeriodRemaining: number;
    ttlPeriodProgress: number;
  };
  resetStats: () => void;
  getConfig: () => DNSCacheConfig;
  installInterceptors: () => void;
  uninstallInterceptors: () => void;
  handleDNSLookupRequest: (
    hostname: string,
    options?: { family?: number },
  ) => Promise<{
    success: boolean;
    address?: string;
    family?: number;
    error?: string;
  }>;
  handleDNSResolve4Request: (
    hostname: string,
  ) => Promise<{ success: boolean; addresses?: string[]; error?: string }>;
  handleDNSResolve6Request: (
    hostname: string,
  ) => Promise<{ success: boolean; addresses?: string[]; error?: string }>;
};

const { safeReadFile, safeWriteFile } =
  (await import('../../src/utils/safePath.ts')) as unknown as SafePathMock;
const { validateHostname, validateResolvedAddress, validateResolvedAddresses } =
  (await import('../../src/utils/ssrfProtection.ts')) as unknown as SSRFProtectionMock;

describe('DNSCacheService', () => {
  let dnsCache: DNSCacheType;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset environment variables
    process.env.DNS_CACHE_ENABLED = 'false';
    process.env.DNS_CACHE_TTL = '300000';
    process.env.DNS_CACHE_MAX_ENTRIES = '1000';

    // Re-import to get fresh instance
    const { dnsCache: cache } = await import('../../src/services/dnsCache.ts');
    dnsCache = cache as unknown as DNSCacheType;

    // Reset service state
    dnsCache.cache.clear();
    dnsCache.config = {
      enabled: false,
      ttl: 300000,
      maxEntries: 1000,
    };
    dnsCache.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      evictions: 0,
    };
    dnsCache.ttlPeriodStart = Date.now();
    dnsCache.originalLookup = null;
    dnsCache.originalResolve4 = null;
    dnsCache.originalResolve6 = null;
    dnsCache.analysisStats.clear();
    dnsCache.cacheKeyToAnalyses.clear();

    // Mock SSRF validation to allow by default
    validateHostname.mockReturnValue({ allowed: true });
    validateResolvedAddress.mockReturnValue({ allowed: true });
    validateResolvedAddresses.mockReturnValue({ allowed: true });
  });

  afterEach(() => {
    // Clean up interceptors
    if (dnsCache.originalLookup) {
      dnsCache.uninstallInterceptors();
    }
  });

  describe('initialize', () => {
    it('should initialize with default config', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      await dnsCache.initialize();

      expect(safeWriteFile).toHaveBeenCalled();
      expect(process.env.DNS_CACHE_ENABLED).toBe('false');
    });

    it('should load existing config', async () => {
      safeReadFile.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          ttl: 600000,
          maxEntries: 500,
        }),
      );

      await dnsCache.initialize();

      expect(dnsCache.config.enabled).toBe(true);
      expect(dnsCache.config.ttl).toBe(600000);
      expect(dnsCache.config.maxEntries).toBe(500);
    });

    it('should install interceptors if enabled', async () => {
      safeReadFile.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          ttl: 300000,
          maxEntries: 1000,
        }),
      );

      await dnsCache.initialize();

      expect(dnsCache.originalLookup).not.toBeNull();
    });
  });

  describe('loadConfig', () => {
    it('should load configuration from file', async () => {
      safeReadFile.mockResolvedValue(
        JSON.stringify({
          enabled: true,
          ttl: 600000,
          maxEntries: 2000,
        }),
      );

      await dnsCache.loadConfig();

      expect(dnsCache.config.enabled).toBe(true);
      expect(dnsCache.config.ttl).toBe(600000);
      expect(dnsCache.config.maxEntries).toBe(2000);
    });

    it('should create default config if file not found', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      safeReadFile.mockRejectedValue(error);

      await dnsCache.loadConfig();

      expect(safeWriteFile).toHaveBeenCalled();
    });

    it('should handle JSON parse error', async () => {
      safeReadFile.mockResolvedValue('invalid json');

      await dnsCache.loadConfig();

      // Should save default config on parse error
      expect(safeWriteFile).toHaveBeenCalled();
    });
  });

  describe('saveConfig', () => {
    it('should save configuration to file', async () => {
      dnsCache.config = {
        enabled: true,
        ttl: 600000,
        maxEntries: 500,
      };

      await dnsCache.saveConfig();

      expect(safeWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('dns-cache-config.json'),
        expect.stringContaining('"enabled"'),
        expect.any(String),
      );
    });
  });

  describe('cache operations', () => {
    describe('getFromCache', () => {
      it('should return cached entry if not expired', () => {
        const data = { address: '1.2.3.4', family: 4 };
        dnsCache.addToCache('example.com:4', data);

        const result = dnsCache.getFromCache('example.com:4');

        expect(result).toEqual(data);
      });

      it('should return null if entry expired', () => {
        const data = { address: '1.2.3.4', family: 4 };
        dnsCache.config.ttl = 100;
        dnsCache.addToCache('example.com:4', data);

        // Wait for expiration
        vi.useFakeTimers();
        vi.advanceTimersByTime(200);

        const result = dnsCache.getFromCache('example.com:4');

        expect(result).toBeNull();
        expect(dnsCache.cache.has('example.com:4')).toBe(false);

        vi.useRealTimers();
      });

      it('should return null if entry not found', () => {
        const result = dnsCache.getFromCache('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('addToCache', () => {
      it('should add entry to cache', () => {
        const data = { address: '1.2.3.4', family: 4 };

        dnsCache.addToCache('example.com:4', data);

        expect(dnsCache.cache.has('example.com:4')).toBe(true);
        expect(dnsCache.getFromCache('example.com:4')).toEqual(data);
      });

      it('should evict oldest entry when max entries reached', () => {
        dnsCache.config.maxEntries = 2;

        dnsCache.addToCache('key1', { value: 1 });
        dnsCache.addToCache('key2', { value: 2 });
        dnsCache.addToCache('key3', { value: 3 });

        expect(dnsCache.cache.size).toBe(2);
        expect(dnsCache.getFromCache('key1')).toBeNull();
        expect(dnsCache.stats.evictions).toBe(1);
      });
    });

    describe('clearCache', () => {
      it('should clear all cache entries', () => {
        dnsCache.addToCache('key1', { value: 1 });
        dnsCache.addToCache('key2', { value: 2 });

        const cleared = dnsCache.clearCache();

        expect(cleared).toBe(2);
        expect(dnsCache.cache.size).toBe(0);
      });
    });

    describe('getCacheEntries', () => {
      it('should return all cache entries with metadata', () => {
        dnsCache.config.ttl = 300000;
        dnsCache.addToCache('key1', { value: 1 });
        dnsCache.addToCache('key2', { value: 2 });

        const entries = dnsCache.getCacheEntries();

        expect(entries).toHaveLength(2);
        expect(entries[0]).toHaveProperty('key');
        expect(entries[0]).toHaveProperty('data');
        expect(entries[0]).toHaveProperty('age');
        expect(entries[0]).toHaveProperty('remainingTTL');
        expect(entries[0]).toHaveProperty('expired');
        expect(entries[0]).toHaveProperty('source', 'shared');
      });

      it('should sort entries by timestamp descending', () => {
        vi.useFakeTimers();

        dnsCache.addToCache('old', { value: 1 });
        vi.advanceTimersByTime(1000);
        dnsCache.addToCache('new', { value: 2 });

        const entries = dnsCache.getCacheEntries();

        expect(entries[0].key).toBe('new');
        expect(entries[1].key).toBe('old');

        vi.useRealTimers();
      });
    });
  });

  describe('updateConfig', () => {
    it('should update configuration and save', async () => {
      await dnsCache.updateConfig({
        enabled: true,
        ttl: 600000,
        maxEntries: 500,
      });

      expect(dnsCache.config.enabled).toBe(true);
      expect(dnsCache.config.ttl).toBe(600000);
      expect(safeWriteFile).toHaveBeenCalled();
    });

    it('should reset stats when TTL changes', async () => {
      dnsCache.stats.hits = 10;
      dnsCache.stats.misses = 5;

      await dnsCache.updateConfig({ ttl: 600000 });

      expect(dnsCache.stats.hits).toBe(0);
      expect(dnsCache.stats.misses).toBe(0);
    });

    it('should install interceptors when enabling', async () => {
      dnsCache.config.enabled = false;

      await dnsCache.updateConfig({ enabled: true });

      expect(dnsCache.originalLookup).not.toBeNull();
    });

    it('should uninstall interceptors when disabling', async () => {
      dnsCache.config.enabled = true;
      dnsCache.installInterceptors();

      await dnsCache.updateConfig({ enabled: false });

      expect(dnsCache.originalLookup).toBeNull();
    });
  });

  describe('updateEnvironmentVariables', () => {
    it('should update environment variables', () => {
      dnsCache.config = {
        enabled: true,
        ttl: 600000,
        maxEntries: 500,
      };

      dnsCache.updateEnvironmentVariables();

      expect(process.env.DNS_CACHE_ENABLED).toBe('true');
      expect(process.env.DNS_CACHE_TTL).toBe('600000');
      expect(process.env.DNS_CACHE_MAX_ENTRIES).toBe('500');
    });
  });

  describe('checkAndResetTTLPeriod', () => {
    it('should reset stats when TTL period expires', () => {
      vi.useFakeTimers();

      dnsCache.config.ttl = 1000;
      dnsCache.ttlPeriodStart = Date.now();
      dnsCache.stats.hits = 10;
      dnsCache.stats.misses = 5;

      vi.advanceTimersByTime(1500);

      dnsCache.checkAndResetTTLPeriod();

      expect(dnsCache.stats.hits).toBe(0);
      expect(dnsCache.stats.misses).toBe(0);

      vi.useRealTimers();
    });

    it('should not reset stats if period not expired', () => {
      dnsCache.config.ttl = 300000;
      dnsCache.ttlPeriodStart = Date.now();
      dnsCache.stats.hits = 10;

      dnsCache.checkAndResetTTLPeriod();

      expect(dnsCache.stats.hits).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return statistics with hit rate', () => {
      dnsCache.stats.hits = 80;
      dnsCache.stats.misses = 20;
      dnsCache.addToCache('key1', { value: 1 });

      const stats = dnsCache.getStats();

      expect(stats.hits).toBe(80);
      expect(stats.misses).toBe(20);
      expect(stats.cacheSize).toBe(1);
      expect(stats.hitRate).toBe('80.00');
    });

    it('should return 0 hit rate with no requests', () => {
      const stats = dnsCache.getStats();

      expect(stats.hitRate).toBe(0);
    });

    it('should include TTL period information', () => {
      dnsCache.config.ttl = 300000;

      const stats = dnsCache.getStats();

      expect(stats).toHaveProperty('ttlPeriodAge');
      expect(stats).toHaveProperty('ttlPeriodRemaining');
      expect(stats).toHaveProperty('ttlPeriodProgress');
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      dnsCache.stats.hits = 10;
      dnsCache.stats.misses = 5;
      dnsCache.stats.errors = 2;
      dnsCache.stats.evictions = 1;

      dnsCache.resetStats();

      expect(dnsCache.stats).toEqual({
        hits: 0,
        misses: 0,
        errors: 0,
        evictions: 0,
      });
    });
  });

  describe('getConfig', () => {
    it('should return copy of configuration', () => {
      dnsCache.config = {
        enabled: true,
        ttl: 600000,
        maxEntries: 500,
      };

      const config = dnsCache.getConfig();

      expect(config).toEqual(dnsCache.config);
      expect(config).not.toBe(dnsCache.config); // Should be a copy
    });
  });

  describe('IPC DNS handlers', () => {
    describe('handleDNSLookupRequest', () => {
      it('should return cached result', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();
        dnsCache.addToCache('example.com:4', { address: '1.2.3.4', family: 4 });

        const result = await dnsCache.handleDNSLookupRequest('example.com', {
          family: 4,
        });

        expect(result.success).toBe(true);
        expect(result.address).toBe('1.2.3.4');
        expect(result.family).toBe(4);
        expect(dnsCache.stats.hits).toBe(1);
      });

      it('should perform lookup on cache miss', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        // Mock original lookup
        dnsCache.originalLookup = vi
          .fn()
          .mockImplementation(
            (
              _hostname: string,
              _options: unknown,
              callback: (
                err: Error | null,
                address: string,
                family: number,
              ) => void,
            ) => {
              callback(null, '1.2.3.4', 4);
            },
          );

        const result = await dnsCache.handleDNSLookupRequest('example.com', {
          family: 4,
        });

        expect(result.success).toBe(true);
        expect(result.address).toBe('1.2.3.4');
        expect(dnsCache.stats.misses).toBe(1);
      });

      it('should block SSRF attempts', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({
          allowed: false,
          reason: 'Private hostname blocked',
        });

        const result = await dnsCache.handleDNSLookupRequest('localhost');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Private hostname blocked');
        expect(dnsCache.stats.errors).toBe(1);
      });

      it('should block resolved private addresses', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({ allowed: true });
        validateResolvedAddress.mockReturnValue({
          allowed: false,
          reason: 'Private IP address blocked',
        });

        dnsCache.originalLookup = vi
          .fn()
          .mockImplementation(
            (
              _hostname: string,
              _options: unknown,
              callback: (
                err: Error | null,
                address: string,
                family: number,
              ) => void,
            ) => {
              callback(null, '127.0.0.1', 4);
            },
          );

        const result = await dnsCache.handleDNSLookupRequest('example.com');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Private IP address blocked');
      });

      it('should handle DNS lookup errors', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        const dnsError = new Error('ENOTFOUND') as NodeJS.ErrnoException;
        dnsError.code = 'ENOTFOUND';

        dnsCache.originalLookup = vi
          .fn()
          .mockImplementation(
            (
              _hostname: string,
              _options: unknown,
              callback: (
                err: Error | null,
                address: string,
                family: number,
              ) => void,
            ) => {
              callback(dnsError, '', 0);
            },
          );

        const result = await dnsCache.handleDNSLookupRequest(
          'nonexistent.example.com',
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('ENOTFOUND');
        expect(dnsCache.stats.errors).toBe(1);
      });

      it('should track stats with analysisId on cache hit', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();
        dnsCache.addToCache('example.com:4', { address: '1.2.3.4', family: 4 });

        const result = await (
          dnsCache as unknown as {
            handleDNSLookupRequest: (
              hostname: string,
              options: { family?: number },
              analysisId: string | null,
            ) => Promise<{
              success: boolean;
              address?: string;
              family?: number;
            }>;
          }
        ).handleDNSLookupRequest(
          'example.com',
          { family: 4 },
          'test-analysis-1',
        );

        expect(result.success).toBe(true);
        expect(result.address).toBe('1.2.3.4');
        expect(dnsCache.analysisStats.has('test-analysis-1')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-1')!.hits).toBe(1);
      });

      it('should track stats with analysisId on cache miss', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalLookup = vi
          .fn()
          .mockImplementation(
            (
              _hostname: string,
              _options: unknown,
              callback: (
                err: Error | null,
                address: string,
                family: number,
              ) => void,
            ) => {
              callback(null, '1.2.3.4', 4);
            },
          );

        const result = await (
          dnsCache as unknown as {
            handleDNSLookupRequest: (
              hostname: string,
              options: { family?: number },
              analysisId: string | null,
            ) => Promise<{
              success: boolean;
              address?: string;
              family?: number;
            }>;
          }
        ).handleDNSLookupRequest(
          'example.com',
          { family: 4 },
          'test-analysis-2',
        );

        expect(result.success).toBe(true);
        expect(dnsCache.analysisStats.has('test-analysis-2')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-2')!.misses).toBe(1);
      });

      it('should track errors with analysisId', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({
          allowed: false,
          reason: 'Private hostname blocked',
        });

        const result = await (
          dnsCache as unknown as {
            handleDNSLookupRequest: (
              hostname: string,
              options: { family?: number },
              analysisId: string | null,
            ) => Promise<{ success: boolean; error?: string }>;
          }
        ).handleDNSLookupRequest('localhost', {}, 'test-analysis-3');

        expect(result.success).toBe(false);
        expect(dnsCache.analysisStats.has('test-analysis-3')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-3')!.errors).toBe(1);
      });
    });

    describe('handleDNSResolve4Request', () => {
      it('should return cached result', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();
        dnsCache.addToCache('resolve4:example.com', {
          addresses: ['1.2.3.4', '5.6.7.8'],
        });

        const result = await dnsCache.handleDNSResolve4Request('example.com');

        expect(result.success).toBe(true);
        expect(result.addresses).toEqual(['1.2.3.4', '5.6.7.8']);
        expect(dnsCache.stats.hits).toBe(1);
      });

      it('should perform resolve4 on cache miss', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalResolve4 = vi.fn().mockResolvedValue(['1.2.3.4']);

        const result = await dnsCache.handleDNSResolve4Request('example.com');

        expect(result.success).toBe(true);
        expect(result.addresses).toEqual(['1.2.3.4']);
        expect(dnsCache.stats.misses).toBe(1);
      });

      it('should block SSRF attempts', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({
          allowed: false,
          reason: 'Private hostname blocked',
        });

        const result = await dnsCache.handleDNSResolve4Request('localhost');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Private hostname blocked');
      });

      it('should block resolved private addresses', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({
          allowed: true,
          hostname: 'example.com',
        });
        validateResolvedAddresses.mockReturnValue({
          allowed: false,
          reason: 'Private IPv4 address blocked',
        });

        dnsCache.originalResolve4 = vi.fn().mockResolvedValue(['127.0.0.1']);

        const result = await dnsCache.handleDNSResolve4Request('example.com');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Private IPv4 address blocked');
        expect(dnsCache.stats.errors).toBe(1);
      });

      it('should handle resolution errors', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalResolve4 = vi
          .fn()
          .mockRejectedValue(new Error('ENOTFOUND'));

        const result = await dnsCache.handleDNSResolve4Request('example.com');

        expect(result.success).toBe(false);
        expect(result.error).toBe('ENOTFOUND');
        expect(dnsCache.stats.errors).toBe(1);
      });

      it('should track stats with analysisId on cache hit', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();
        dnsCache.addToCache('resolve4:example.com', { addresses: ['1.2.3.4'] });

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve4Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; addresses?: string[] }>;
          }
        ).handleDNSResolve4Request('example.com', 'test-analysis-r4-1');

        expect(result.success).toBe(true);
        expect(dnsCache.analysisStats.has('test-analysis-r4-1')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r4-1')!.hits).toBe(1);
      });

      it('should track stats with analysisId on cache miss', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalResolve4 = vi.fn().mockResolvedValue(['1.2.3.4']);

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve4Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; addresses?: string[] }>;
          }
        ).handleDNSResolve4Request('example.com', 'test-analysis-r4-2');

        expect(result.success).toBe(true);
        expect(dnsCache.analysisStats.has('test-analysis-r4-2')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r4-2')!.misses).toBe(
          1,
        );
      });

      it('should track errors with analysisId on SSRF block', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({
          allowed: false,
          reason: 'Private hostname blocked',
        });

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve4Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; error?: string }>;
          }
        ).handleDNSResolve4Request('localhost', 'test-analysis-r4-3');

        expect(result.success).toBe(false);
        expect(dnsCache.analysisStats.has('test-analysis-r4-3')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r4-3')!.errors).toBe(
          1,
        );
      });

      it('should track errors with analysisId on resolution failure', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalResolve4 = vi
          .fn()
          .mockRejectedValue(new Error('ENOTFOUND'));

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve4Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; error?: string }>;
          }
        ).handleDNSResolve4Request(
          'nonexistent.example.com',
          'test-analysis-r4-4',
        );

        expect(result.success).toBe(false);
        expect(dnsCache.analysisStats.has('test-analysis-r4-4')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r4-4')!.errors).toBe(
          1,
        );
      });

      it('should track errors with analysisId on SSRF resolved address block', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({
          allowed: true,
          hostname: 'example.com',
        });
        validateResolvedAddresses.mockReturnValue({
          allowed: false,
          reason: 'Private IPv4 address blocked',
        });

        dnsCache.originalResolve4 = vi.fn().mockResolvedValue(['127.0.0.1']);

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve4Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; error?: string }>;
          }
        ).handleDNSResolve4Request('example.com', 'test-analysis-r4-5');

        expect(result.success).toBe(false);
        expect(dnsCache.analysisStats.has('test-analysis-r4-5')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r4-5')!.errors).toBe(
          1,
        );
      });
    });

    describe('handleDNSResolve6Request', () => {
      it('should return cached result', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();
        dnsCache.addToCache('resolve6:example.com', {
          addresses: ['2001:db8::1'],
        });

        const result = await dnsCache.handleDNSResolve6Request('example.com');

        expect(result.success).toBe(true);
        expect(result.addresses).toEqual(['2001:db8::1']);
        expect(dnsCache.stats.hits).toBe(1);
      });

      it('should perform resolve6 on cache miss', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalResolve6 = vi.fn().mockResolvedValue(['2001:db8::1']);

        const result = await dnsCache.handleDNSResolve6Request('example.com');

        expect(result.success).toBe(true);
        expect(result.addresses).toEqual(['2001:db8::1']);
        expect(dnsCache.stats.misses).toBe(1);
      });

      it('should handle resolution errors', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalResolve6 = vi
          .fn()
          .mockRejectedValue(new Error('ENOTFOUND'));

        const result = await dnsCache.handleDNSResolve6Request('example.com');

        expect(result.success).toBe(false);
        expect(result.error).toBe('ENOTFOUND');
        expect(dnsCache.stats.errors).toBe(1);
      });

      it('should block SSRF attempts', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        const ssrfMock = await import('../../src/utils/ssrfProtection.ts');
        vi.mocked(ssrfMock.validateHostname).mockReturnValue({
          allowed: false,
          reason: 'Private hostname blocked',
        });

        const result = await dnsCache.handleDNSResolve6Request('localhost');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Private hostname blocked');
      });

      it('should block resolved private addresses', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        const ssrfMock = await import('../../src/utils/ssrfProtection.ts');
        vi.mocked(ssrfMock.validateHostname).mockReturnValue({
          allowed: true,
        });
        vi.mocked(ssrfMock.validateResolvedAddresses).mockReturnValue({
          allowed: false,
          reason: 'Private IPv6 address blocked',
        });

        dnsCache.originalResolve6 = vi.fn().mockResolvedValue(['::1']);

        const result = await dnsCache.handleDNSResolve6Request('example.com');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Private IPv6 address blocked');
      });

      it('should track stats with analysisId on cache hit', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();
        dnsCache.addToCache('resolve6:example.com', {
          addresses: ['2001:db8::1'],
        });

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve6Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; addresses?: string[] }>;
          }
        ).handleDNSResolve6Request('example.com', 'test-analysis-r6-1');

        expect(result.success).toBe(true);
        expect(dnsCache.analysisStats.has('test-analysis-r6-1')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r6-1')!.hits).toBe(1);
      });

      it('should track stats with analysisId on cache miss', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalResolve6 = vi.fn().mockResolvedValue(['2001:db8::1']);

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve6Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; addresses?: string[] }>;
          }
        ).handleDNSResolve6Request('example.com', 'test-analysis-r6-2');

        expect(result.success).toBe(true);
        expect(dnsCache.analysisStats.has('test-analysis-r6-2')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r6-2')!.misses).toBe(
          1,
        );
      });

      it('should track errors with analysisId on SSRF block', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({
          allowed: false,
          reason: 'Private hostname blocked',
        });

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve6Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; error?: string }>;
          }
        ).handleDNSResolve6Request('localhost', 'test-analysis-r6-3');

        expect(result.success).toBe(false);
        expect(dnsCache.analysisStats.has('test-analysis-r6-3')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r6-3')!.errors).toBe(
          1,
        );
      });

      it('should track errors with analysisId on resolution failure', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        dnsCache.originalResolve6 = vi
          .fn()
          .mockRejectedValue(new Error('ENOTFOUND'));

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve6Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; error?: string }>;
          }
        ).handleDNSResolve6Request(
          'nonexistent.example.com',
          'test-analysis-r6-4',
        );

        expect(result.success).toBe(false);
        expect(dnsCache.analysisStats.has('test-analysis-r6-4')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r6-4')!.errors).toBe(
          1,
        );
      });

      it('should track errors with analysisId on SSRF resolved address block', async () => {
        dnsCache.config.enabled = true;
        dnsCache.installInterceptors();

        validateHostname.mockReturnValue({
          allowed: true,
          hostname: 'example.com',
        });
        validateResolvedAddresses.mockReturnValue({
          allowed: false,
          reason: 'Private IPv6 address blocked',
        });

        dnsCache.originalResolve6 = vi.fn().mockResolvedValue(['::1']);

        const result = await (
          dnsCache as unknown as {
            handleDNSResolve6Request: (
              hostname: string,
              analysisId: string | null,
            ) => Promise<{ success: boolean; error?: string }>;
          }
        ).handleDNSResolve6Request('example.com', 'test-analysis-r6-5');

        expect(result.success).toBe(false);
        expect(dnsCache.analysisStats.has('test-analysis-r6-5')).toBe(true);
        expect(dnsCache.analysisStats.get('test-analysis-r6-5')!.errors).toBe(
          1,
        );
      });
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent cache additions', () => {
      dnsCache.config.maxEntries = 100;

      for (let i = 0; i < 50; i++) {
        dnsCache.addToCache(`key-${i}`, { value: i });
      }

      expect(dnsCache.cache.size).toBe(50);
      expect(dnsCache.stats.evictions).toBe(0);
    });

    it('should handle zero TTL', () => {
      vi.useFakeTimers();

      dnsCache.config.ttl = 0;
      dnsCache.addToCache('key1', { value: 1 });

      vi.advanceTimersByTime(1);

      const result = dnsCache.getFromCache('key1');

      expect(result).toBeNull();

      vi.useRealTimers();
    });

    it('should handle large cache sizes', () => {
      dnsCache.config.maxEntries = 10000;

      for (let i = 0; i < 10000; i++) {
        dnsCache.addToCache(`key-${i}`, { value: i });
      }

      expect(dnsCache.cache.size).toBe(10000);
    });

    it('should handle special characters in cache keys', () => {
      const data = { address: '1.2.3.4', family: 4 };
      const specialKey = 'host-with-dash.example.com:4';

      dnsCache.addToCache(specialKey, data);

      const result = dnsCache.getFromCache(specialKey);

      expect(result).toEqual(data);
    });

    it('should handle rapid TTL period resets', () => {
      vi.useFakeTimers();

      dnsCache.config.ttl = 100;
      dnsCache.stats.hits = 10;

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(150);
        dnsCache.checkAndResetTTLPeriod();
      }

      expect(dnsCache.stats.hits).toBe(0);

      vi.useRealTimers();
    });
  });

  // Note: updateStatsSnapshot was removed from the service
  // DNS stats are now available via getStats() and broadcast via metricsUpdate SSE

  describe('per-analysis statistics', () => {
    describe('deleteCacheEntry', () => {
      it('should delete an existing cache entry', () => {
        dnsCache.addToCache('test-key', { value: 1 });
        expect(dnsCache.cache.has('test-key')).toBe(true);

        const result = (
          dnsCache as unknown as { deleteCacheEntry: (key: string) => boolean }
        ).deleteCacheEntry('test-key');

        expect(result).toBe(true);
        expect(dnsCache.cache.has('test-key')).toBe(false);
      });

      it('should return false for non-existent cache entry', () => {
        const result = (
          dnsCache as unknown as { deleteCacheEntry: (key: string) => boolean }
        ).deleteCacheEntry('non-existent');

        expect(result).toBe(false);
      });
    });

    describe('getAnalysisStats', () => {
      it('should return null for empty analysisId', () => {
        const result = (
          dnsCache as unknown as {
            getAnalysisStats: (id: string) => unknown | null;
          }
        ).getAnalysisStats('');

        expect(result).toBeNull();
      });

      it('should return default stats for unknown analysis', () => {
        const result = (
          dnsCache as unknown as {
            getAnalysisStats: (id: string) => {
              hits: number;
              misses: number;
              errors: number;
              hitRate: number;
              hostnameCount: number;
              hostnames: string[];
              cacheKeyCount: number;
            } | null;
          }
        ).getAnalysisStats('unknown-analysis');

        expect(result).toEqual({
          hits: 0,
          misses: 0,
          errors: 0,
          hitRate: 0,
          hostnameCount: 0,
          hostnames: [],
          cacheKeyCount: 0,
        });
      });

      it('should return stats for tracked analysis', () => {
        // Add analysis stats directly
        (
          dnsCache as unknown as {
            analysisStats: Map<
              string,
              {
                hits: number;
                misses: number;
                errors: number;
                hostnames: Set<string>;
                cacheKeys: Set<string>;
              }
            >;
          }
        ).analysisStats.set('test-analysis', {
          hits: 10,
          misses: 5,
          errors: 2,
          hostnames: new Set(['example.com', 'test.com']),
          cacheKeys: new Set(['example.com:4', 'test.com:4']),
        });

        const result = (
          dnsCache as unknown as {
            getAnalysisStats: (id: string) => {
              hits: number;
              misses: number;
              errors: number;
              hitRate: string | number;
              hostnameCount: number;
              hostnames: string[];
              cacheKeyCount: number;
            } | null;
          }
        ).getAnalysisStats('test-analysis');

        expect(result).not.toBeNull();
        expect(result!.hits).toBe(10);
        expect(result!.misses).toBe(5);
        expect(result!.errors).toBe(2);
        expect(result!.hostnameCount).toBe(2);
        expect(result!.hostnames).toContain('example.com');
        expect(result!.cacheKeyCount).toBe(2);
        expect(result!.hitRate).toBe('66.67');
      });
    });

    describe('getAllAnalysisStats', () => {
      it('should return empty object when no analysis stats exist', () => {
        const result = (
          dnsCache as unknown as {
            getAllAnalysisStats: () => Record<string, unknown>;
          }
        ).getAllAnalysisStats();

        expect(result).toEqual({});
      });

      it('should return stats for all tracked analyses', () => {
        const analysisStats = (
          dnsCache as unknown as {
            analysisStats: Map<
              string,
              {
                hits: number;
                misses: number;
                errors: number;
                hostnames: Set<string>;
                cacheKeys: Set<string>;
              }
            >;
          }
        ).analysisStats;

        analysisStats.set('analysis-1', {
          hits: 10,
          misses: 5,
          errors: 0,
          hostnames: new Set(['a.com']),
          cacheKeys: new Set(['a.com:4']),
        });
        analysisStats.set('analysis-2', {
          hits: 0,
          misses: 0,
          errors: 1,
          hostnames: new Set(),
          cacheKeys: new Set(),
        });

        const result = (
          dnsCache as unknown as {
            getAllAnalysisStats: () => Record<
              string,
              { hits: number; misses: number; errors: number; hitRate: unknown }
            >;
          }
        ).getAllAnalysisStats();

        expect(Object.keys(result)).toHaveLength(2);
        expect(result['analysis-1'].hits).toBe(10);
        expect(result['analysis-2'].errors).toBe(1);
        expect(result['analysis-2'].hitRate).toBe(0);
      });
    });

    describe('getAnalysisCacheEntries', () => {
      it('should return empty array for empty analysisId', () => {
        const result = (
          dnsCache as unknown as {
            getAnalysisCacheEntries: (id: string) => unknown[];
          }
        ).getAnalysisCacheEntries('');

        expect(result).toEqual([]);
      });

      it('should return empty array for unknown analysis', () => {
        const result = (
          dnsCache as unknown as {
            getAnalysisCacheEntries: (id: string) => unknown[];
          }
        ).getAnalysisCacheEntries('unknown');

        expect(result).toEqual([]);
      });

      it('should return cache entries for tracked analysis', () => {
        // Add cache entry
        dnsCache.addToCache('example.com:4', { address: '1.2.3.4', family: 4 });

        // Add analysis stats with cache key
        (
          dnsCache as unknown as {
            analysisStats: Map<
              string,
              {
                hits: number;
                misses: number;
                errors: number;
                hostnames: Set<string>;
                cacheKeys: Set<string>;
              }
            >;
          }
        ).analysisStats.set('test-analysis', {
          hits: 1,
          misses: 0,
          errors: 0,
          hostnames: new Set(['example.com']),
          cacheKeys: new Set(['example.com:4']),
        });

        const result = (
          dnsCache as unknown as {
            getAnalysisCacheEntries: (id: string) => Array<{
              key: string;
              data: unknown;
            }>;
          }
        ).getAnalysisCacheEntries('test-analysis');

        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('example.com:4');
        expect(result[0].data).toEqual({ address: '1.2.3.4', family: 4 });
      });
    });

    describe('resetAnalysisStats', () => {
      it('should not throw for empty analysisId', () => {
        expect(() =>
          (
            dnsCache as unknown as { resetAnalysisStats: (id: string) => void }
          ).resetAnalysisStats(''),
        ).not.toThrow();
      });

      it('should reset stats for specific analysis', () => {
        const analysisStats = (
          dnsCache as unknown as {
            analysisStats: Map<string, unknown>;
          }
        ).analysisStats;

        analysisStats.set('test-analysis', {
          hits: 10,
          misses: 5,
          errors: 0,
          hostnames: new Set(['example.com']),
          cacheKeys: new Set(['example.com:4']),
        });

        expect(analysisStats.has('test-analysis')).toBe(true);

        (
          dnsCache as unknown as { resetAnalysisStats: (id: string) => void }
        ).resetAnalysisStats('test-analysis');

        expect(analysisStats.has('test-analysis')).toBe(false);
      });
    });

    describe('cleanupAnalysis', () => {
      it('should not throw for empty analysisId', () => {
        expect(() =>
          (
            dnsCache as unknown as { cleanupAnalysis: (id: string) => void }
          ).cleanupAnalysis(''),
        ).not.toThrow();
      });

      it('should cleanup analysis stats and cache key mappings', () => {
        const analysisStats = (
          dnsCache as unknown as {
            analysisStats: Map<string, unknown>;
          }
        ).analysisStats;

        const cacheKeyToAnalyses = (
          dnsCache as unknown as {
            cacheKeyToAnalyses: Map<string, Set<string>>;
          }
        ).cacheKeyToAnalyses;

        // Set up analysis stats
        analysisStats.set('test-analysis', {
          hits: 10,
          misses: 5,
          errors: 0,
          hostnames: new Set(['example.com']),
          cacheKeys: new Set(['example.com:4']),
        });

        // Set up cache key to analyses mapping
        cacheKeyToAnalyses.set(
          'example.com:4',
          new Set(['test-analysis', 'other-analysis']),
        );

        (
          dnsCache as unknown as { cleanupAnalysis: (id: string) => void }
        ).cleanupAnalysis('test-analysis');

        expect(analysisStats.has('test-analysis')).toBe(false);
        expect(
          cacheKeyToAnalyses.get('example.com:4')?.has('test-analysis'),
        ).toBe(false);
        expect(
          cacheKeyToAnalyses.get('example.com:4')?.has('other-analysis'),
        ).toBe(true);
      });

      it('should delete cache key mapping when no analyses remain', () => {
        const analysisStats = (
          dnsCache as unknown as {
            analysisStats: Map<string, unknown>;
          }
        ).analysisStats;

        const cacheKeyToAnalyses = (
          dnsCache as unknown as {
            cacheKeyToAnalyses: Map<string, Set<string>>;
          }
        ).cacheKeyToAnalyses;

        // Set up analysis stats
        analysisStats.set('only-analysis', {
          hits: 10,
          misses: 5,
          errors: 0,
          hostnames: new Set(['example.com']),
          cacheKeys: new Set(['example.com:4']),
        });

        // Set up cache key to analyses mapping with only one analysis
        cacheKeyToAnalyses.set('example.com:4', new Set(['only-analysis']));

        (
          dnsCache as unknown as { cleanupAnalysis: (id: string) => void }
        ).cleanupAnalysis('only-analysis');

        expect(cacheKeyToAnalyses.has('example.com:4')).toBe(false);
      });
    });
  });
});

/**
 * LazyLoader Tests
 *
 * Tests for lazy-loading utilities that help break circular dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLazyLoader } from '../../src/utils/lazyLoader.ts';

describe('lazyLoader', () => {
  describe('createLazyLoader', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should load module on first call', async () => {
      const mockModule = { value: 'test' };
      const loader = vi.fn().mockResolvedValue(mockModule);

      const getLazyModule = createLazyLoader({ loader });
      const result = await getLazyModule();

      expect(result).toBe(mockModule);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should cache module and return cached value on subsequent calls', async () => {
      const mockModule = { value: 'test' };
      const loader = vi.fn().mockResolvedValue(mockModule);

      const getLazyModule = createLazyLoader({ loader });

      // First call
      const result1 = await getLazyModule();
      expect(result1).toBe(mockModule);
      expect(loader).toHaveBeenCalledTimes(1);

      // Second call should return cached value
      const result2 = await getLazyModule();
      expect(result2).toBe(mockModule);
      expect(loader).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should handle concurrent calls and only load once', async () => {
      const mockModule = { value: 'test' };
      let resolveLoader: (value: typeof mockModule) => void;
      const loaderPromise = new Promise<typeof mockModule>((resolve) => {
        resolveLoader = resolve;
      });
      const loader = vi.fn().mockReturnValue(loaderPromise);

      const getLazyModule = createLazyLoader({ loader });

      // Start multiple concurrent calls
      const promise1 = getLazyModule();
      const promise2 = getLazyModule();
      const promise3 = getLazyModule();

      // Resolve the loader
      resolveLoader!(mockModule);

      // All promises should resolve to the same value
      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      expect(result1).toBe(mockModule);
      expect(result2).toBe(mockModule);
      expect(result3).toBe(mockModule);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should handle loader that throws', async () => {
      const loader = vi.fn().mockRejectedValue(new Error('Load failed'));

      const getLazyModule = createLazyLoader({ loader });

      await expect(getLazyModule()).rejects.toThrow('Load failed');
    });

    it('should preserve module type', async () => {
      type TestModule = { foo: string; bar: number };
      const mockModule: TestModule = { foo: 'hello', bar: 42 };
      const loader = vi.fn().mockResolvedValue(mockModule);

      const getLazyModule = createLazyLoader<TestModule>({ loader });
      const result = await getLazyModule();

      expect(result.foo).toBe('hello');
      expect(result.bar).toBe(42);
    });

    it('should handle module with methods', async () => {
      const mockModule = {
        getValue: () => 'value',
        processData: (data: string) => data.toUpperCase(),
      };
      const loader = vi.fn().mockResolvedValue(mockModule);

      const getLazyModule = createLazyLoader<typeof mockModule>({ loader });
      const result = await getLazyModule();

      expect(result.getValue()).toBe('value');
      expect(result.processData('test')).toBe('TEST');
    });

    it('should handle module that returns primitive values', async () => {
      const loader = vi.fn().mockResolvedValue('primitive string');

      const getLazyModule = createLazyLoader({ loader });
      const result = await getLazyModule();

      expect(result).toBe('primitive string');
    });

    it('should handle module that returns null (edge case)', async () => {
      // When cached is null, it will load again since the check is `cached !== null`
      // This tests that behavior
      let callCount = 0;
      const loader = vi.fn().mockImplementation(() => {
        callCount++;
        // First call returns null, subsequent calls return an object
        if (callCount === 1) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ value: 'loaded' });
      });

      const getLazyModule = createLazyLoader({ loader });

      // First call returns null
      const result1 = await getLazyModule();
      expect(result1).toBe(null);

      // Since null is cached as a valid value (cached !== null check),
      // but actually null === null is true, so it will be "not cached"
      // This is actually a quirk in the implementation
      // Let's verify the actual behavior - call again to verify reload
      await getLazyModule();
      // This depends on implementation - null would cause reload
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('should create independent lazy loaders', async () => {
      const mockModule1 = { id: 1 };
      const mockModule2 = { id: 2 };

      const loader1 = vi.fn().mockResolvedValue(mockModule1);
      const loader2 = vi.fn().mockResolvedValue(mockModule2);

      const getLazyModule1 = createLazyLoader({ loader: loader1 });
      const getLazyModule2 = createLazyLoader({ loader: loader2 });

      const result1 = await getLazyModule1();
      const result2 = await getLazyModule2();

      expect(result1).toBe(mockModule1);
      expect(result2).toBe(mockModule2);
      expect(loader1).toHaveBeenCalledTimes(1);
      expect(loader2).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid sequential calls after loading', async () => {
      const mockModule = { value: 'test' };
      const loader = vi.fn().mockResolvedValue(mockModule);

      const getLazyModule = createLazyLoader({ loader });

      // Load module first
      await getLazyModule();

      // Rapid sequential calls should all return cached value
      for (let i = 0; i < 100; i++) {
        const result = await getLazyModule();
        expect(result).toBe(mockModule);
      }

      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('pre-configured lazy loaders', () => {
    // Test that the exported lazy loaders are functions
    it('should export getSseManager as function', async () => {
      const { getSseManager } = await import('../../src/utils/lazyLoader.ts');
      expect(typeof getSseManager).toBe('function');
    });

    it('should export getDnsCache as function', async () => {
      const { getDnsCache } = await import('../../src/utils/lazyLoader.ts');
      expect(typeof getDnsCache).toBe('function');
    });

    it('should export getAnalysisService as function', async () => {
      const { getAnalysisService } =
        await import('../../src/utils/lazyLoader.ts');
      expect(typeof getAnalysisService).toBe('function');
    });

    it('should export getTeamService as function', async () => {
      const { getTeamService } = await import('../../src/utils/lazyLoader.ts');
      expect(typeof getTeamService).toBe('function');
    });

    it('should export getAuth as function', async () => {
      const { getAuth } = await import('../../src/utils/lazyLoader.ts');
      expect(typeof getAuth).toBe('function');
    });

    it('should export getAuthDatabase as function', async () => {
      const { getAuthDatabase } = await import('../../src/utils/lazyLoader.ts');
      expect(typeof getAuthDatabase).toBe('function');
    });

    it('should export getTeamPermissionHelpers as function', async () => {
      const { getTeamPermissionHelpers } =
        await import('../../src/utils/lazyLoader.ts');
      expect(typeof getTeamPermissionHelpers).toBe('function');
    });

    it('should export getMs as function', async () => {
      const { getMs } = await import('../../src/utils/lazyLoader.ts');
      expect(typeof getMs).toBe('function');
    });
  });
});

/**
 * Lazy-loading utilities for breaking circular dependencies.
 *
 * When modules have circular dependencies (A imports B which imports A),
 * dynamic imports can defer loading until first use, breaking the cycle.
 *
 * This module provides a type-safe factory for creating lazy loaders
 * that cache their results and handle concurrent initialization.
 */

/**
 * Configuration for creating a lazy loader.
 *
 * @template T - The type of the module being loaded
 */
type LazyLoaderConfig<T> = {
  /** Async function that imports and returns the module */
  readonly loader: () => Promise<T>;
};

/**
 * Create a lazy loader for a module with circular dependency issues.
 *
 * Features:
 * - Caches the loaded module for subsequent calls
 * - Prevents duplicate imports during concurrent calls
 * - Type-safe: preserves the module type
 *
 * @template T - The type of the module being loaded
 * @param config - Loader configuration
 * @returns Async getter function that returns the cached module
 *
 * @example
 * // Create a lazy loader for the SSE manager
 * const getSseManager = createLazyLoader({
 *   loader: async () => {
 *     const { sseManager } = await import('../utils/sse/index.ts');
 *     return sseManager as SSEManagerInterface;
 *   },
 * });
 *
 * // Use in async context
 * const manager = await getSseManager();
 * manager.broadcastUpdate('log', data);
 */
export function createLazyLoader<T>(
  config: LazyLoaderConfig<T>,
): () => Promise<T> {
  let cached: T | null = null;
  let pending: Promise<T> | null = null;

  return async function getLazyModule(): Promise<T> {
    // Return cached value if available
    if (cached !== null) {
      return cached;
    }

    // Wait for existing load if in progress
    if (pending !== null) {
      return pending;
    }

    // Start new load
    pending = (async () => {
      const result = await config.loader();
      cached = result;
      pending = null;
      return result;
    })();

    return pending;
  };
}

/**
 * Pre-configured lazy loader for the SSE manager.
 *
 * Use this in any module that needs SSE broadcasting but would create
 * a circular dependency with a static import.
 *
 * @example
 * const sseManager = await getSseManager();
 * await sseManager.broadcastUpdate('log', data);
 */
export const getSseManager = createLazyLoader({
  loader: async () => {
    const { sseManager } = await import('./sse/index.ts');
    return sseManager;
  },
});

/**
 * Pre-configured lazy loader for the DNS cache.
 *
 * Use this in any module that needs DNS cache but would create
 * a circular dependency with a static import.
 *
 * @example
 * const cache = await getDnsCache();
 * const result = await cache.lookup(hostname);
 */
export const getDnsCache = createLazyLoader({
  loader: async () => {
    const { dnsCache } = await import('../services/dnsCache.ts');
    return dnsCache;
  },
});

/**
 * Pre-configured lazy loader for the analysis service.
 *
 * Use this in any module that needs analysis data but would create
 * a circular dependency with a static import.
 *
 * @example
 * const service = await getAnalysisService();
 * const analysis = service.getAnalysisById(id);
 */
export const getAnalysisService = createLazyLoader({
  loader: async () => {
    const { analysisService } = await import('../services/analysis/index.ts');
    return analysisService;
  },
});

/**
 * Pre-configured lazy loader for the team service.
 *
 * Use this in any module that needs team data but would create
 * a circular dependency with a static import.
 *
 * @example
 * const service = await getTeamService();
 * const team = await service.getTeamById(teamId);
 */
export const getTeamService = createLazyLoader({
  loader: async () => {
    const { teamService } = await import('../services/teamService.ts');
    return teamService;
  },
});

/**
 * Pre-configured lazy loader for auth module.
 *
 * Use this in services that need auth but would create
 * a circular dependency with a static import.
 *
 * @example
 * const authModule = await getAuth();
 * const session = await authModule.auth.api.getSession({ headers });
 */
export const getAuth = createLazyLoader({
  loader: async () => {
    const { auth } = await import('../lib/auth.ts');
    return auth;
  },
});

/**
 * Pre-configured lazy loader for auth database utilities.
 *
 * Use this for database queries that need to avoid circular imports.
 *
 * @example
 * const { executeQuery, executeQueryAll } = await getAuthDatabase();
 * const results = executeQueryAll<User>('SELECT * FROM user');
 */
export const getAuthDatabase = createLazyLoader({
  loader: async () => {
    const db = await import('./authDatabase.ts');
    return {
      executeQuery: db.executeQuery,
      executeQueryAll: db.executeQueryAll,
    };
  },
});

/**
 * Pre-configured lazy loader for getUserTeamIds helper.
 *
 * Use this in modules that need team permission checking but would create
 * a circular dependency with a static import.
 *
 * @example
 * const { getUserTeamIds } = await getTeamPermissionHelpers();
 * const teamIds = await getUserTeamIds(userId);
 */
export const getTeamPermissionHelpers = createLazyLoader({
  loader: async () => {
    const { getUserTeamIds, getUsersWithTeamAccess } =
      await import('../middleware/betterAuthMiddleware.ts');
    return { getUserTeamIds, getUsersWithTeamAccess };
  },
});

/**
 * Pre-configured lazy loader for the ms (milliseconds) library.
 *
 * Use this for human-readable time formatting.
 *
 * @example
 * const ms = await getMs();
 * const formatted = ms(3600000, { long: true }); // "1 hour"
 */
export const getMs = createLazyLoader({
  loader: async () => {
    const ms = (await import('ms')).default;
    return ms;
  },
});

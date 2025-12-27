// services/dnsService.js
import {
  createServiceLogger,
  createGetMethod,
  createPutMethod,
  createDeleteMethod,
  createPostMethod,
} from '../utils/serviceFactory';

const logger = createServiceLogger('dnsService');

export const dnsService = {
  // Get DNS cache configuration and stats
  getConfig: createGetMethod(
    logger,
    'fetch DNS cache configuration',
    '/settings/dns/config',
    {
      debugMessage: 'Fetching DNS cache configuration',
      successMessage: 'DNS cache configuration fetched successfully',
    },
  ),

  // Update DNS cache configuration
  updateConfig: createPutMethod(
    logger,
    'update DNS cache configuration',
    '/settings/dns/config',
    (config) => config,
    {
      debugMessage: 'Updating DNS cache configuration',
      successMessage: 'DNS cache configuration updated successfully',
      getDebugParams: (config) => ({ config }),
    },
  ),

  // Get all cache entries
  getCacheEntries: createGetMethod(
    logger,
    'fetch DNS cache entries',
    '/settings/dns/entries',
    {
      debugMessage: 'Fetching DNS cache entries',
      successMessage: 'DNS cache entries fetched successfully',
      getSuccessParams: (result) => ({ count: result?.entries?.length }),
    },
  ),

  // Clear entire cache
  clearCache: createDeleteMethod(
    logger,
    'clear DNS cache',
    '/settings/dns/cache',
    null,
    {
      debugMessage: 'Clearing DNS cache',
      successMessage: 'DNS cache cleared successfully',
    },
  ),

  // Delete specific cache entry
  deleteCacheEntry: createDeleteMethod(
    logger,
    'delete DNS cache entry',
    (key) => `/settings/dns/cache/${encodeURIComponent(key)}`,
    null,
    {
      debugMessage: 'Deleting DNS cache entry',
      successMessage: 'DNS cache entry deleted successfully',
      getDebugParams: (key) => ({ key }),
      getSuccessParams: (_result, key) => ({ key }),
    },
  ),

  // Reset statistics
  resetStats: createPostMethod(
    logger,
    'reset DNS statistics',
    '/settings/dns/stats/reset',
    () => ({}),
    {
      debugMessage: 'Resetting DNS statistics',
      successMessage: 'DNS statistics reset successfully',
    },
  ),

  // Get DNS stats for all analyses
  getAllAnalysisStats: createGetMethod(
    logger,
    'fetch all analysis DNS stats',
    '/settings/dns/analysis',
    {
      debugMessage: 'Fetching all analysis DNS stats',
      successMessage: 'All analysis DNS stats fetched successfully',
      getSuccessParams: (result) => ({
        count: Object.keys(result?.analysisStats || {}).length,
      }),
    },
  ),

  // Get DNS stats for a specific analysis
  getAnalysisStats: createGetMethod(
    logger,
    'fetch analysis DNS stats',
    (analysisId) => `/settings/dns/analysis/${analysisId}`,
    {
      debugMessage: 'Fetching analysis DNS stats',
      successMessage: 'Analysis DNS stats fetched successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
    },
  ),

  // Get cache entries for a specific analysis
  getAnalysisCacheEntries: createGetMethod(
    logger,
    'fetch analysis DNS cache entries',
    (analysisId) => `/settings/dns/analysis/${analysisId}/entries`,
    {
      debugMessage: 'Fetching analysis DNS cache entries',
      successMessage: 'Analysis DNS cache entries fetched successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
      getSuccessParams: (result) => ({ count: result?.entries?.length }),
    },
  ),
};

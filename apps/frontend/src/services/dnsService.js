// services/dnsService.js
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('dnsService');

export const dnsService = {
  // Get DNS cache configuration and stats
  async getConfig() {
    logger.debug('Fetching DNS cache configuration');
    try {
      const response = await fetchWithHeaders('/settings/dns/config', {
        method: 'GET',
      });
      const result = await handleResponse(response);
      logger.info('DNS cache configuration fetched successfully');
      return result;
    } catch (error) {
      logger.error('Failed to fetch DNS cache configuration', { error });
      throw error;
    }
  },

  // Update DNS cache configuration
  async updateConfig(config) {
    logger.debug('Updating DNS cache configuration', { config });
    try {
      const response = await fetchWithHeaders('/settings/dns/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      const result = await handleResponse(response);
      logger.info('DNS cache configuration updated successfully');
      return result;
    } catch (error) {
      logger.error('Failed to update DNS cache configuration', { error });
      throw error;
    }
  },

  // Get all cache entries
  async getCacheEntries() {
    logger.debug('Fetching DNS cache entries');
    try {
      const response = await fetchWithHeaders('/settings/dns/entries', {
        method: 'GET',
      });
      const result = await handleResponse(response);
      logger.info('DNS cache entries fetched successfully', {
        count: result?.entries?.length,
      });
      return result;
    } catch (error) {
      logger.error('Failed to fetch DNS cache entries', { error });
      throw error;
    }
  },

  // Clear entire cache
  async clearCache() {
    logger.debug('Clearing DNS cache');
    try {
      const response = await fetchWithHeaders('/settings/dns/cache', {
        method: 'DELETE',
      });
      const result = await handleResponse(response);
      logger.info('DNS cache cleared successfully');
      return result;
    } catch (error) {
      logger.error('Failed to clear DNS cache', { error });
      throw error;
    }
  },

  // Delete specific cache entry
  async deleteCacheEntry(key) {
    logger.debug('Deleting DNS cache entry', { key });
    try {
      const url = `/settings/dns/cache/${encodeURIComponent(key)}`;
      const response = await fetchWithHeaders(url, {
        method: 'DELETE',
      });
      const result = await handleResponse(response);
      logger.info('DNS cache entry deleted successfully', { key });
      return result;
    } catch (error) {
      logger.error('Failed to delete DNS cache entry', { error, key });
      throw error;
    }
  },

  // Reset statistics
  async resetStats() {
    logger.debug('Resetting DNS statistics');
    try {
      const response = await fetchWithHeaders('/settings/dns/stats/reset', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const result = await handleResponse(response);
      logger.info('DNS statistics reset successfully');
      return result;
    } catch (error) {
      logger.error('Failed to reset DNS statistics', { error });
      throw error;
    }
  },
};

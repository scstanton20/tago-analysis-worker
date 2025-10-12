// services/dnsService.js
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils';

export const dnsService = {
  // Get DNS cache configuration and stats
  async getConfig() {
    const response = await fetchWithHeaders('/settings/dns/config', {
      method: 'GET',
    });
    return handleResponse(response);
  },

  // Update DNS cache configuration
  async updateConfig(config) {
    const response = await fetchWithHeaders('/settings/dns/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    return handleResponse(response);
  },

  // Get all cache entries
  async getCacheEntries() {
    const response = await fetchWithHeaders('/settings/dns/entries', {
      method: 'GET',
    });
    return handleResponse(response);
  },

  // Clear entire cache
  async clearCache() {
    const response = await fetchWithHeaders('/settings/dns/cache', {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  // Delete specific cache entry
  async deleteCacheEntry(key) {
    const url = `/settings/dns/cache/${encodeURIComponent(key)}`;
    const response = await fetchWithHeaders(url, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  // Reset statistics
  async resetStats() {
    const response = await fetchWithHeaders('/settings/dns/stats/reset', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return handleResponse(response);
  },
};

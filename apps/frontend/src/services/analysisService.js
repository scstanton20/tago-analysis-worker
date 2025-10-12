// frontend/src/services/analysisService.js
import {
  fetchWithHeaders,
  handleResponse,
  downloadBlob,
  parseErrorResponse,
} from '../utils/apiUtils';
import sanitize from 'sanitize-filename';

export const analysisService = {
  async getAnalyses() {
    const response = await fetchWithHeaders('/analyses', {
      method: 'GET',
    });
    return handleResponse(response);
  },

  async uploadAnalysis(file, teamId = null) {
    const formData = new FormData();
    formData.append('analysis', file);

    // Add teamId if provided (backend will default to Uncategorized if not)
    if (teamId) {
      formData.append('teamId', teamId);
    }

    const response = await fetchWithHeaders('/analyses/upload', {
      method: 'POST',
      body: formData,
    });
    return handleResponse(response);
  },

  async runAnalysis(fileName) {
    const response = await fetchWithHeaders(`/analyses/${fileName}/run`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async stopAnalysis(fileName) {
    const response = await fetchWithHeaders(`/analyses/${fileName}/stop`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async deleteAnalysis(fileName) {
    const response = await fetchWithHeaders(`/analyses/${fileName}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  async getAnalysisContent(fileName, version = null) {
    const versionParam = version !== null ? `?version=${version}` : '';
    const response = await fetchWithHeaders(
      `/analyses/${fileName}/content${versionParam}`,
      {
        method: 'GET',
      },
    );

    if (!response.ok) {
      const errorData = await parseErrorResponse(
        response,
        'Failed to fetch analysis content',
      );
      throw new Error(errorData.error);
    }

    return await response.text();
  },

  async updateAnalysis(fileName, content) {
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }

    if (!content.trim()) {
      throw new Error('Content cannot be empty');
    }

    const response = await fetchWithHeaders(`/analyses/${fileName}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    return handleResponse(response);
  },

  async renameAnalysis(fileName, newFileName) {
    if (typeof newFileName !== 'string') {
      throw new Error('New Filename must be a string');
    }

    if (!newFileName.trim()) {
      throw new Error('New Filename cannot be empty');
    }

    const response = await fetchWithHeaders(`/analyses/${fileName}/rename`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newFileName }),
    });
    return handleResponse(response);
  },

  async getLogs(fileName, params = {}) {
    const { page = 1, limit = 100 } = params;
    const queryParams = new URLSearchParams({ page, limit }).toString();
    const response = await fetchWithHeaders(
      `/analyses/${fileName}/logs?${queryParams}`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error('Failed to fetch logs');
    }

    return await response.json();
  },

  async downloadLogs(fileName, timeRange) {
    // Sanitize the filename to prevent XSS
    const safeFileName = sanitize(fileName);

    const response = await fetchWithHeaders(
      `/analyses/${fileName}/logs/download?timeRange=${timeRange}`,
      { method: 'GET' },
    );

    if (!response.ok) {
      throw new Error('Failed to download logs');
    }

    const blob = await response.blob();
    downloadBlob(safeFileName, blob, '.log');
  },

  async deleteLogs(fileName) {
    const response = await fetchWithHeaders(`/analyses/${fileName}/logs`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleResponse(response);
  },

  async getEnvFile(fileName) {
    const response = await fetchWithHeaders(
      `/analyses/${fileName}/environment`,
      { method: 'GET' },
    );

    if (!response.ok) {
      return {};
    }

    return await response.json();
  },

  async getAnalysisENVContent(fileName) {
    const envData = await this.getEnvFile(fileName);
    if (!envData || typeof envData !== 'object') {
      return '';
    }

    // Convert env object to a formatted .env string
    return Object.entries(envData)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  },

  async updateAnalysisENV(fileName, envContent) {
    if (typeof envContent !== 'string') {
      throw new Error('Invalid .env content format');
    }

    const envObject = envContent
      .split('\n')
      .filter((line) => line.includes('=') && !line.startsWith('#'))
      .reduce((acc, line) => {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        acc[key.trim()] = value || '';
        return acc;
      }, {});

    const response = await fetchWithHeaders(
      `/analyses/${fileName}/environment`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env: envObject }),
      },
    );
    return handleResponse(response);
  },

  async downloadAnalysis(fileName, version = null) {
    // Sanitize the filename to prevent XSS
    const safeFileName = sanitize(fileName);

    const versionParam = version ? `?version=${version}` : '';
    const response = await fetchWithHeaders(
      `/analyses/${fileName}/download${versionParam}`,
      { method: 'GET' },
    );

    if (!response.ok) {
      throw new Error('Failed to download analysis');
    }

    const blob = await response.blob();
    const versionSuffix = version ? `_v${version}` : '';
    downloadBlob(`${safeFileName}${versionSuffix}`, blob, '.js');
  },

  async getVersions(fileName) {
    const response = await fetchWithHeaders(`/analyses/${fileName}/versions`, {
      method: 'GET',
    });
    return handleResponse(response);
  },

  async rollbackToVersion(fileName, version) {
    const response = await fetchWithHeaders(`/analyses/${fileName}/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version }),
    });
    return handleResponse(response);
  },
};

export default analysisService;

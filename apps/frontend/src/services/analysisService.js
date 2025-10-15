// frontend/src/services/analysisService.js
import {
  fetchWithHeaders,
  handleResponse,
  downloadBlob,
  parseErrorResponse,
} from '../utils/apiUtils';
import sanitize from 'sanitize-filename';
import { createLogger } from '../utils/logger';

const logger = createLogger('analysisService');

export const analysisService = {
  async getAnalyses() {
    logger.debug('Fetching analyses list');
    try {
      const response = await fetchWithHeaders('/analyses', {
        method: 'GET',
      });
      const result = await handleResponse(response);
      logger.info('Analyses list fetched successfully', {
        count: result?.analyses?.length,
      });
      return result;
    } catch (error) {
      logger.error('Failed to fetch analyses list', { error });
      throw error;
    }
  },

  async uploadAnalysis(file, teamId = null) {
    logger.debug('Uploading analysis', {
      fileName: file.name,
      fileSize: file.size,
      teamId,
    });
    try {
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
      const result = await handleResponse(response);
      logger.info('Analysis uploaded successfully', { fileName: file.name });
      return result;
    } catch (error) {
      logger.error('Failed to upload analysis', {
        error,
        fileName: file.name,
      });
      throw error;
    }
  },

  async runAnalysis(fileName) {
    logger.debug('Starting analysis', { fileName });
    try {
      const response = await fetchWithHeaders(`/analyses/${fileName}/run`, {
        method: 'POST',
      });
      const result = await handleResponse(response);
      logger.info('Analysis started successfully', { fileName });
      return result;
    } catch (error) {
      logger.error('Failed to start analysis', { error, fileName });
      throw error;
    }
  },

  async stopAnalysis(fileName) {
    logger.debug('Stopping analysis', { fileName });
    try {
      const response = await fetchWithHeaders(`/analyses/${fileName}/stop`, {
        method: 'POST',
      });
      const result = await handleResponse(response);
      logger.info('Analysis stopped successfully', { fileName });
      return result;
    } catch (error) {
      logger.error('Failed to stop analysis', { error, fileName });
      throw error;
    }
  },

  async deleteAnalysis(fileName) {
    logger.debug('Deleting analysis', { fileName });
    try {
      const response = await fetchWithHeaders(`/analyses/${fileName}`, {
        method: 'DELETE',
      });
      const result = await handleResponse(response);
      logger.info('Analysis deleted successfully', { fileName });
      return result;
    } catch (error) {
      logger.error('Failed to delete analysis', { error, fileName });
      throw error;
    }
  },

  async getAnalysisContent(fileName, version = null) {
    const versionParam = version !== null ? `?version=${version}` : '';
    const response = await fetchWithHeaders(
      `/analyses/${fileName}/content${versionParam}`,
      {
        method: 'GET',
      },
    );

    // For text responses, check status and return text directly
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
    logger.debug('Updating analysis content', {
      fileName,
      contentLength: content?.length,
    });

    if (typeof content !== 'string') {
      logger.error('Invalid content type for analysis update', { fileName });
      throw new Error('Content must be a string');
    }

    if (!content.trim()) {
      logger.error('Empty content for analysis update', { fileName });
      throw new Error('Content cannot be empty');
    }

    try {
      const response = await fetchWithHeaders(`/analyses/${fileName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
      const result = await handleResponse(response);
      logger.info('Analysis content updated successfully', { fileName });
      return result;
    } catch (error) {
      logger.error('Failed to update analysis content', { error, fileName });
      throw error;
    }
  },

  async renameAnalysis(fileName, newFileName) {
    logger.debug('Renaming analysis', { fileName, newFileName });

    if (typeof newFileName !== 'string') {
      logger.error('Invalid new filename type', { fileName, newFileName });
      throw new Error('New Filename must be a string');
    }

    if (!newFileName.trim()) {
      logger.error('Empty new filename', { fileName });
      throw new Error('New Filename cannot be empty');
    }

    try {
      const response = await fetchWithHeaders(`/analyses/${fileName}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newFileName }),
      });
      const result = await handleResponse(response);
      logger.info('Analysis renamed successfully', { fileName, newFileName });
      return result;
    } catch (error) {
      logger.error('Failed to rename analysis', {
        error,
        fileName,
        newFileName,
      });
      throw error;
    }
  },

  async getLogs(fileName, params = {}) {
    const { page = 1, limit = 100 } = params;
    logger.debug('Fetching analysis logs', { fileName, page, limit });
    try {
      const queryParams = new URLSearchParams({ page, limit }).toString();
      const response = await fetchWithHeaders(
        `/analyses/${fileName}/logs?${queryParams}`,
      );
      const result = await handleResponse(response);
      logger.info('Analysis logs fetched successfully', {
        fileName,
        page,
        logsCount: result?.logs?.length,
      });
      return result;
    } catch (error) {
      logger.error('Failed to fetch analysis logs', { error, fileName, page });
      throw error;
    }
  },

  async downloadLogs(fileName, timeRange) {
    logger.debug('Downloading analysis logs', { fileName, timeRange });
    try {
      // Sanitize the filename to prevent XSS
      const safeFileName = sanitize(fileName);

      const response = await fetchWithHeaders(
        `/analyses/${fileName}/logs/download?timeRange=${timeRange}`,
        { method: 'GET' },
      );

      if (!response.ok) {
        const errorData = await parseErrorResponse(
          response,
          'Failed to download logs',
        );
        throw new Error(errorData.error);
      }

      const blob = await response.blob();
      downloadBlob(safeFileName, blob, '.log');
      logger.info('Analysis logs downloaded successfully', {
        fileName,
        timeRange,
      });
    } catch (error) {
      logger.error('Failed to download analysis logs', {
        error,
        fileName,
        timeRange,
      });
      throw error;
    }
  },

  async deleteLogs(fileName) {
    logger.debug('Deleting analysis logs', { fileName });
    try {
      const response = await fetchWithHeaders(`/analyses/${fileName}/logs`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const result = await handleResponse(response);
      logger.info('Analysis logs deleted successfully', { fileName });
      return result;
    } catch (error) {
      logger.error('Failed to delete analysis logs', { error, fileName });
      throw error;
    }
  },

  async getEnvFile(fileName) {
    const response = await fetchWithHeaders(
      `/analyses/${fileName}/environment`,
      { method: 'GET' },
    );

    return handleResponse(response);
  },

  async getAnalysisENVContent(fileName) {
    try {
      const envData = await this.getEnvFile(fileName);
      if (!envData || typeof envData !== 'object') {
        return '';
      }

      // Convert env object to a formatted .env string
      return Object.entries(envData)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    } catch {
      // Return empty string for missing env files (404) or other errors
      return '';
    }
  },

  async updateAnalysisENV(fileName, envContent) {
    logger.debug('Updating analysis environment variables', {
      fileName,
      contentLength: envContent?.length,
    });

    if (typeof envContent !== 'string') {
      logger.error('Invalid env content type', { fileName });
      throw new Error('Invalid .env content format');
    }

    try {
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
      const result = await handleResponse(response);
      logger.info('Analysis environment variables updated successfully', {
        fileName,
        varsCount: Object.keys(envObject).length,
      });
      return result;
    } catch (error) {
      logger.error('Failed to update analysis environment variables', {
        error,
        fileName,
      });
      throw error;
    }
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
      const errorData = await parseErrorResponse(
        response,
        'Failed to download analysis',
      );
      throw new Error(errorData.error);
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
    logger.debug('Rolling back analysis to version', { fileName, version });
    try {
      const response = await fetchWithHeaders(
        `/analyses/${fileName}/rollback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ version }),
        },
      );
      const result = await handleResponse(response);
      logger.info('Analysis rolled back successfully', { fileName, version });
      return result;
    } catch (error) {
      logger.error('Failed to rollback analysis', {
        error,
        fileName,
        version,
      });
      throw error;
    }
  },
};

export default analysisService;

// frontend/src/services/analysisService.js
import {
  fetchWithHeaders,
  handleResponse,
  downloadBlob,
  parseErrorResponse,
  withErrorHandling,
} from '../utils/apiUtils';
import sanitize from 'sanitize-filename';
import {
  createServiceLogger,
  createGetMethod,
  createPostMethod,
  createDeleteMethod,
} from '../utils/serviceFactory';

const logger = createServiceLogger('analysisService');

export const analysisService = {
  getAnalyses: createGetMethod(logger, 'fetch analyses list', '/analyses', {
    debugMessage: 'Fetching analyses list',
    successMessage: 'Analyses list fetched successfully',
    getSuccessParams: (result) => ({ count: result?.analyses?.length }),
  }),

  uploadAnalysis: withErrorHandling(async (file, teamId = null) => {
    logger.debug('Uploading analysis', {
      fileName: file.name,
      fileSize: file.size,
      teamId,
    });

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
  }, 'upload analysis'),

  runAnalysis: createPostMethod(
    logger,
    'start analysis',
    (fileName) => `/analyses/${fileName}/run`,
    () => null,
    {
      debugMessage: 'Starting analysis',
      successMessage: 'Analysis started successfully',
      getDebugParams: (fileName) => ({ fileName }),
      getSuccessParams: (_result, fileName) => ({ fileName }),
    },
  ),

  stopAnalysis: createPostMethod(
    logger,
    'stop analysis',
    (fileName) => `/analyses/${fileName}/stop`,
    () => null,
    {
      debugMessage: 'Stopping analysis',
      successMessage: 'Analysis stopped successfully',
      getDebugParams: (fileName) => ({ fileName }),
      getSuccessParams: (_result, fileName) => ({ fileName }),
    },
  ),

  deleteAnalysis: createDeleteMethod(
    logger,
    'delete analysis',
    (fileName) => `/analyses/${fileName}`,
    null,
    {
      debugMessage: 'Deleting analysis',
      successMessage: 'Analysis deleted successfully',
      getDebugParams: (fileName) => ({ fileName }),
      getSuccessParams: (_result, fileName) => ({ fileName }),
    },
  ),

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

  updateAnalysis: withErrorHandling(async (fileName, content) => {
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
  }, 'update analysis content'),

  renameAnalysis: withErrorHandling(async (fileName, newFileName) => {
    logger.debug('Renaming analysis', { fileName, newFileName });

    if (typeof newFileName !== 'string') {
      logger.error('Invalid new filename type', { fileName, newFileName });
      throw new Error('New Filename must be a string');
    }

    if (!newFileName.trim()) {
      logger.error('Empty new filename', { fileName });
      throw new Error('New Filename cannot be empty');
    }

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
  }, 'rename analysis'),

  getLogs: withErrorHandling(async (fileName, params = {}) => {
    const { page = 1, limit = 100 } = params;
    logger.debug('Fetching analysis logs', { fileName, page, limit });
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
  }, 'fetch analysis logs'),

  downloadLogs: withErrorHandling(async (fileName, timeRange) => {
    logger.debug('Downloading analysis logs', { fileName, timeRange });

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
    await downloadBlob(sanitize(fileName), blob, '.log');
    logger.info('Analysis logs downloaded successfully', {
      fileName,
      timeRange,
    });
  }, 'download analysis logs'),

  deleteLogs: createDeleteMethod(
    logger,
    'delete analysis logs',
    (fileName) => `/analyses/${fileName}/logs`,
    null,
    {
      debugMessage: 'Deleting analysis logs',
      successMessage: 'Analysis logs deleted successfully',
      getDebugParams: (fileName) => ({ fileName }),
      getSuccessParams: (_result, fileName) => ({ fileName }),
    },
  ),

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

  updateAnalysisENV: withErrorHandling(async (fileName, envContent) => {
    logger.debug('Updating analysis environment variables', {
      fileName,
      contentLength: envContent?.length,
    });

    if (typeof envContent !== 'string') {
      logger.error('Invalid env content type', { fileName });
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
    const result = await handleResponse(response);
    logger.info('Analysis environment variables updated successfully', {
      fileName,
      varsCount: Object.keys(envObject).length,
    });
    return result;
  }, 'update analysis environment variables'),

  async downloadAnalysis(fileName, version = null) {
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
    // Sanitize version to prevent XSS - only allow numbers
    const safeVersion = version ? String(version).replace(/[^0-9]/g, '') : '';
    const versionSuffix = safeVersion ? `_v${safeVersion}` : '';
    await downloadBlob(sanitize(`${fileName}${versionSuffix}`), blob, '.js');
  },

  async getVersions(fileName) {
    const response = await fetchWithHeaders(`/analyses/${fileName}/versions`, {
      method: 'GET',
    });
    return handleResponse(response);
  },

  rollbackToVersion: createPostMethod(
    logger,
    'rollback analysis to version',
    (fileName) => `/analyses/${fileName}/rollback`,
    (fileName, version) => ({ version }),
    {
      debugMessage: 'Rolling back analysis to version',
      successMessage: 'Analysis rolled back successfully',
      getDebugParams: (fileName, version) => ({ fileName, version }),
      getSuccessParams: (_result, fileName, version) => ({ fileName, version }),
    },
  ),
};

export default analysisService;

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
  createPostMethod,
  createDeleteMethod,
  createGetMethod,
  createPutMethod,
} from '../utils/serviceFactory';

const logger = createServiceLogger('analysisService');

export const analysisService = {
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
    (analysisId) => `/analyses/${analysisId}/run`,
    () => null,
    {
      debugMessage: 'Starting analysis',
      successMessage: 'Analysis started successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
      getSuccessParams: (_result, analysisId) => ({ analysisId }),
    },
  ),

  stopAnalysis: createPostMethod(
    logger,
    'stop analysis',
    (analysisId) => `/analyses/${analysisId}/stop`,
    () => null,
    {
      debugMessage: 'Stopping analysis',
      successMessage: 'Analysis stopped successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
      getSuccessParams: (_result, analysisId) => ({ analysisId }),
    },
  ),

  deleteAnalysis: createDeleteMethod(
    logger,
    'delete analysis',
    (analysisId) => `/analyses/${analysisId}`,
    null,
    {
      debugMessage: 'Deleting analysis',
      successMessage: 'Analysis deleted successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
      getSuccessParams: (_result, analysisId) => ({ analysisId }),
    },
  ),

  async getAnalysisContent(analysisId, version = null) {
    const versionParam = version !== null ? `?version=${version}` : '';
    const response = await fetchWithHeaders(
      `/analyses/${analysisId}/content${versionParam}`,
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

  updateAnalysis: withErrorHandling(async (analysisId, content) => {
    logger.debug('Updating analysis content', {
      analysisId,
      contentLength: content?.length,
    });

    if (typeof content !== 'string') {
      logger.error('Invalid content type for analysis update', { analysisId });
      throw new Error('Content must be a string');
    }

    if (!content.trim()) {
      logger.error('Empty content for analysis update', { analysisId });
      throw new Error('Content cannot be empty');
    }

    const response = await fetchWithHeaders(`/analyses/${analysisId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    const result = await handleResponse(response);
    logger.info('Analysis content updated successfully', { analysisId });
    return result;
  }, 'update analysis content'),

  renameAnalysis: withErrorHandling(async (analysisId, newName) => {
    logger.debug('Renaming analysis', { analysisId, newName });

    if (typeof newName !== 'string') {
      logger.error('Invalid new name type', { analysisId, newName });
      throw new Error('New name must be a string');
    }

    if (!newName.trim()) {
      logger.error('Empty new name', { analysisId });
      throw new Error('New name cannot be empty');
    }

    const response = await fetchWithHeaders(`/analyses/${analysisId}/rename`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newName }),
    });
    const result = await handleResponse(response);
    logger.info('Analysis renamed successfully', { analysisId, newName });
    return result;
  }, 'rename analysis'),

  getLogs: withErrorHandling(async (analysisId, params = {}) => {
    const { page = 1, limit = 100 } = params;
    logger.debug('Fetching analysis logs', { analysisId, page, limit });
    const queryParams = new URLSearchParams({ page, limit }).toString();
    const response = await fetchWithHeaders(
      `/analyses/${analysisId}/logs?${queryParams}`,
    );
    const result = await handleResponse(response);
    logger.info('Analysis logs fetched successfully', {
      analysisId,
      page,
      logsCount: result?.logs?.length,
    });
    return result;
  }, 'fetch analysis logs'),

  downloadLogs: withErrorHandling(
    async (analysisId, analysisName, timeRange) => {
      logger.debug('Downloading analysis logs', { analysisId, timeRange });

      const response = await fetchWithHeaders(
        `/analyses/${analysisId}/logs/download?timeRange=${timeRange}`,
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
      await downloadBlob(sanitize(analysisName), blob, '.log');
      logger.info('Analysis logs downloaded successfully', {
        analysisId,
        timeRange,
      });
    },
    'download analysis logs',
  ),

  getLogDownloadOptions: withErrorHandling(async (analysisId) => {
    logger.debug('Fetching log download options', { analysisId });

    const response = await fetchWithHeaders(
      `/analyses/${analysisId}/logs/options`,
      { method: 'GET' },
    );

    if (!response.ok) {
      const errorData = await parseErrorResponse(
        response,
        'Failed to fetch log download options',
      );
      throw new Error(errorData.error);
    }

    const result = await response.json();
    logger.debug('Log download options fetched', {
      analysisId,
      optionsCount: result?.timeRangeOptions?.length,
    });
    return result;
  }, 'fetch log download options'),

  deleteLogs: createDeleteMethod(
    logger,
    'delete analysis logs',
    (analysisId) => `/analyses/${analysisId}/logs`,
    null,
    {
      debugMessage: 'Deleting analysis logs',
      successMessage: 'Analysis logs deleted successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
      getSuccessParams: (_result, analysisId) => ({ analysisId }),
    },
  ),

  async getEnvFile(analysisId) {
    const response = await fetchWithHeaders(
      `/analyses/${analysisId}/environment`,
      { method: 'GET' },
    );

    return handleResponse(response);
  },

  async getAnalysisENVContent(analysisId) {
    try {
      const envData = await this.getEnvFile(analysisId);
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

  updateAnalysisENV: withErrorHandling(async (analysisId, envContent) => {
    logger.debug('Updating analysis environment variables', {
      analysisId,
      contentLength: envContent?.length,
    });

    if (typeof envContent !== 'string') {
      logger.error('Invalid env content type', { analysisId });
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
      `/analyses/${analysisId}/environment`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env: envObject }),
      },
    );
    const result = await handleResponse(response);
    logger.info('Analysis environment variables updated successfully', {
      analysisId,
      varsCount: Object.keys(envObject).length,
    });
    return result;
  }, 'update analysis environment variables'),

  async downloadAnalysis(analysisId, analysisName, version = null) {
    const versionParam = version ? `?version=${version}` : '';
    const response = await fetchWithHeaders(
      `/analyses/${analysisId}/download${versionParam}`,
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
    await downloadBlob(
      sanitize(`${analysisName}${versionSuffix}`),
      blob,
      '.js',
    );
  },

  async getVersions(analysisId, { page = 1, limit = 10 } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    const response = await fetchWithHeaders(
      `/analyses/${analysisId}/versions?${params}`,
      {
        method: 'GET',
      },
    );
    return handleResponse(response);
  },

  rollbackToVersion: createPostMethod(
    logger,
    'rollback analysis to version',
    (analysisId) => `/analyses/${analysisId}/rollback`,
    (_analysisId, version) => ({ version }),
    {
      debugMessage: 'Rolling back analysis to version',
      successMessage: 'Analysis rolled back successfully',
      getDebugParams: (analysisId, version) => ({ analysisId, version }),
      getSuccessParams: (_result, analysisId, version) => ({
        analysisId,
        version,
      }),
    },
  ),

  getAnalysisMeta: createGetMethod(
    logger,
    'fetch analysis metadata',
    (analysisId) => `/analyses/${analysisId}/info/meta`,
    {
      debugMessage: 'Fetching analysis metadata',
      successMessage: 'Analysis metadata fetched successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
      getSuccessParams: (_result, analysisId) => ({ analysisId }),
    },
  ),

  getAnalysisNotes: createGetMethod(
    logger,
    'fetch analysis notes',
    (analysisId) => `/analyses/${analysisId}/info`,
    {
      debugMessage: 'Fetching analysis notes',
      successMessage: 'Analysis notes fetched successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
      getSuccessParams: (_result, analysisId) => ({ analysisId }),
    },
  ),

  updateAnalysisNotes: createPutMethod(
    logger,
    'update analysis notes',
    (analysisId) => `/analyses/${analysisId}/info`,
    (_analysisId, content) => ({ content }),
    {
      debugMessage: 'Updating analysis notes',
      successMessage: 'Analysis notes updated successfully',
      getDebugParams: (analysisId) => ({ analysisId }),
      getSuccessParams: (_result, analysisId) => ({ analysisId }),
    },
  ),
};

export default analysisService;

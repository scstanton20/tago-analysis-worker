/**
 * Analysis Info Service - Aggregates metadata and manages analysis notes
 * @module analysisInfoService
 */
import path from 'path';
import { config } from '../config/default.js';
import { createChildLogger } from '../utils/logging/logger.js';
import { safeReadFile, safeWriteFile, safeStat } from '../utils/safePath.js';
import { analysisService } from './analysisService.js';
import { teamService } from './teamService.js';
import { dnsCache } from './dnsCache.js';
import { metricsService } from './metricsService.js';

const moduleLogger = createChildLogger('analysis-info-service');

// Default template for analysis notes
const DEFAULT_NOTES_TEMPLATE = `# Analysis Notes

## Description
<!-- Describe what this analysis does -->

## Triggers & Tago Information
<!-- Document what action triggers this analysis, what approved API access as delegated in Tago.io cloud, etc -->
  - Tago analysis ID:
  - AM policies:
  - Action and Trigger Types
    - Type:
    - Action Name:

## Dependencies
<!-- List external APIs or services this analysis depends on -->

## Additional Notes
<!-- Any other relevant information -->

`;

class AnalysisInfoService {
  constructor() {
    this.notesFilename = 'information.md';
  }

  /**
   * Get the path to the notes file for an analysis
   * @param {string} analysisId - The analysis UUID
   * @returns {string} Full path to the information.md file
   */
  getNotesPath(analysisId) {
    return path.join(config.paths.analysis, analysisId, this.notesFilename);
  }

  /**
   * Count lines in a file
   * @param {string} content - File content
   * @returns {number} Number of lines
   */
  countLines(content) {
    if (!content || content.length === 0) return 0;
    return content.split('\n').length;
  }

  /**
   * Get comprehensive metadata for an analysis
   * @param {string} analysisId - The analysis UUID
   * @param {object} logger - Logger instance
   * @returns {Promise<object>} Analysis metadata
   */
  async getAnalysisMeta(analysisId, logger = moduleLogger) {
    logger.info(
      { action: 'getAnalysisMeta', analysisId },
      'Getting analysis metadata',
    );

    const analysis = analysisService.getAnalysisProcess(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const basePath = path.join(config.paths.analysis, analysisId);
    const indexPath = path.join(basePath, 'index.js');
    const envPath = path.join(basePath, 'env', '.env');
    const logPath = path.join(basePath, 'logs', 'analysis.log');
    const versionsPath = path.join(basePath, 'versions', 'metadata.json');

    // Gather all metadata in parallel
    const [
      indexStats,
      indexContent,
      envStats,
      envContent,
      logStats,
      versionsData,
      teamInfo,
      processMetrics,
    ] = await Promise.all([
      this.safeFileStat(indexPath),
      this.safeReadContent(indexPath),
      this.safeFileStat(envPath),
      this.safeReadContent(envPath),
      this.safeFileStat(logPath),
      this.safeReadVersions(versionsPath),
      this.getTeamInfo(analysis.teamId),
      this.getProcessMetricsForAnalysis(analysisId),
    ]);

    // Calculate line counts
    const analysisLineCount = this.countLines(indexContent);
    const envLineCount = this.countLines(envContent);
    const envVarCount = envContent
      ? envContent.split('\n').filter((line) => line.includes('=')).length
      : 0;

    // Build metadata object
    const meta = {
      // Identity
      analysisId,
      analysisName: analysis.analysisName,

      // File statistics
      file: {
        size: indexStats?.size || 0,
        sizeFormatted: this.formatFileSize(indexStats?.size || 0),
        lineCount: analysisLineCount,
        created: indexStats?.birthtime?.toISOString() || null,
        modified: indexStats?.mtime?.toISOString() || null,
      },

      // Environment
      environment: {
        size: envStats?.size || 0,
        sizeFormatted: this.formatFileSize(envStats?.size || 0),
        lineCount: envLineCount,
        variableCount: envVarCount,
      },

      // Logs
      logs: {
        size: logStats?.size || 0,
        sizeFormatted: this.formatFileSize(logStats?.size || 0),
        totalCount: analysis.totalLogCount || 0,
      },

      // Version history
      versions: {
        count: versionsData?.versions?.length || 0,
        currentVersion: versionsData?.currentVersion || 1,
        nextVersion: versionsData?.nextVersionNumber || 1,
        firstVersionDate: versionsData?.versions?.[0]?.timestamp || null,
        lastVersionDate:
          versionsData?.versions?.[versionsData?.versions?.length - 1]
            ?.timestamp || null,
      },

      // Team ownership
      team: teamInfo,

      // Process state
      process: {
        status: analysis.status,
        enabled: analysis.enabled,
        intendedState: analysis.intendedState,
        lastStartTime: analysis.lastStartTime,
        restartAttempts: analysis.restartAttempts || 0,
        isConnected: analysis.isConnected || false,
        reconnectionAttempts: analysis.reconnectionAttempts || 0,
      },

      // Performance metrics (if running)
      metrics: processMetrics,

      // DNS usage (global stats for now)
      dns: this.getDnsUsage(),

      // Notes file status
      notes: {
        exists: await this.notesExist(analysisId),
        path: this.notesFilename,
      },
    };

    logger.info(
      {
        action: 'getAnalysisMeta',
        analysisId,
        analysisName: meta.analysisName,
      },
      'Analysis metadata retrieved',
    );

    return meta;
  }

  /**
   * Get analysis notes content
   * @param {string} analysisId - The analysis UUID
   * @param {object} logger - Logger instance
   * @returns {Promise<object>} Notes content and metadata
   */
  async getAnalysisNotes(analysisId, logger = moduleLogger) {
    logger.info(
      { action: 'getAnalysisNotes', analysisId },
      'Getting analysis notes',
    );

    const analysis = analysisService.getAnalysisProcess(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const notesPath = this.getNotesPath(analysisId);
    let content;
    let isNew = false;

    try {
      content = await safeReadFile(notesPath, config.paths.analysis, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create default notes file
        content = DEFAULT_NOTES_TEMPLATE;
        await safeWriteFile(notesPath, content, config.paths.analysis, 'utf8');
        isNew = true;
        logger.info({ analysisId }, 'Created default notes file');
      } else {
        throw error;
      }
    }

    const stats = await this.safeFileStat(notesPath);

    return {
      analysisId,
      analysisName: analysis.analysisName,
      content,
      isNew,
      lineCount: this.countLines(content),
      size: stats?.size || 0,
      sizeFormatted: this.formatFileSize(stats?.size || 0),
      lastModified: stats?.mtime?.toISOString() || null,
    };
  }

  /**
   * Update analysis notes content
   * @param {string} analysisId - The analysis UUID
   * @param {string} content - New notes content
   * @param {object} logger - Logger instance
   * @returns {Promise<object>} Updated notes metadata
   */
  async updateAnalysisNotes(analysisId, content, logger = moduleLogger) {
    logger.info(
      { action: 'updateAnalysisNotes', analysisId },
      'Updating analysis notes',
    );

    const analysis = analysisService.getAnalysisProcess(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const notesPath = this.getNotesPath(analysisId);
    await safeWriteFile(notesPath, content, config.paths.analysis, 'utf8');

    const stats = await this.safeFileStat(notesPath);

    logger.info(
      {
        action: 'updateAnalysisNotes',
        analysisId,
        lineCount: this.countLines(content),
      },
      'Analysis notes updated',
    );

    return {
      success: true,
      analysisId,
      analysisName: analysis.analysisName,
      lineCount: this.countLines(content),
      size: stats?.size || 0,
      sizeFormatted: this.formatFileSize(stats?.size || 0),
      lastModified: stats?.mtime?.toISOString() || null,
    };
  }

  /**
   * Check if notes file exists
   * @param {string} analysisId - The analysis UUID
   * @returns {Promise<boolean>}
   */
  async notesExist(analysisId) {
    const stats = await this.safeFileStat(this.getNotesPath(analysisId));
    return stats !== null;
  }

  /**
   * Get default notes template
   * @returns {string} Default template content
   */
  getDefaultTemplate() {
    return DEFAULT_NOTES_TEMPLATE;
  }

  // Helper methods

  async safeFileStat(filePath) {
    try {
      return await safeStat(filePath, config.paths.analysis);
    } catch {
      return null;
    }
  }

  async safeReadContent(filePath) {
    try {
      return await safeReadFile(filePath, config.paths.analysis, 'utf8');
    } catch {
      return null;
    }
  }

  async safeReadVersions(versionsPath) {
    try {
      const content = await safeReadFile(
        versionsPath,
        config.paths.analysis,
        'utf8',
      );
      return JSON.parse(content);
    } catch {
      return { versions: [], currentVersion: 1, nextVersionNumber: 1 };
    }
  }

  async getTeamInfo(teamId) {
    if (!teamId) {
      return { id: null, name: 'Uncategorized' };
    }
    try {
      const team = await teamService.getTeam(teamId);
      return {
        id: teamId,
        name: team?.name || 'Unknown',
      };
    } catch {
      return { id: teamId, name: 'Unknown' };
    }
  }

  async getProcessMetricsForAnalysis(analysisId) {
    try {
      const allProcessMetrics = await metricsService.getProcessMetrics();
      const processData = allProcessMetrics.find(
        (p) => p.analysis_id === analysisId,
      );
      if (processData) {
        return {
          cpu: processData.cpu || 0,
          memory: processData.memory || 0,
          uptime: processData.uptime || 0,
        };
      }
    } catch {
      // Metrics collection failed, return null
    }
    return null;
  }

  getDnsUsage() {
    try {
      const stats = dnsCache.getStats();
      const config = dnsCache.getConfig();
      return {
        enabled: config.enabled,
        cacheSize: stats.cacheSize,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hitRate,
      };
    } catch {
      return { enabled: false, cacheSize: 0, hits: 0, misses: 0, hitRate: 0 };
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

const analysisInfoService = new AnalysisInfoService();
export { analysisInfoService };

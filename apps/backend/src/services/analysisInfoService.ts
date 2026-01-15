/**
 * Analysis Info Service - Aggregates metadata and manages analysis notes
 */
import path from 'path';
import type { Stats } from 'fs';
import type { Logger } from 'pino';
import type {
  AnalysisInfoResponse,
  AnalysisNotesResponse,
  UpdateAnalysisNotesResponse,
  AnalysisTeamInfo,
  AnalysisProcessMetrics,
  AnalysisDnsUsage,
} from '@tago-analysis-worker/types/api';
import { config } from '../config/default.ts';
import { createChildLogger } from '../utils/logging/logger.ts';
import { safeReadFile, safeWriteFile, safeStat } from '../utils/safePath.ts';
import { formatFileSize } from '../utils/formatters.ts';
import { analysisService } from './analysis/index.ts';
import { teamService } from './teamService.ts';
import { dnsCache } from './dnsCache.ts';
import { metricsService } from './metricsService.ts';

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

/** Internal type for version metadata file */
type VersionsData = {
  versions: Array<{ timestamp: string }>;
  currentVersion: number;
  nextVersionNumber: number;
};

class AnalysisInfoService {
  private notesFilename: string;

  constructor() {
    this.notesFilename = 'information.md';
  }

  /**
   * Get the path to the notes file for an analysis
   */
  getNotesPath(analysisId: string): string {
    return path.join(config.paths.analysis, analysisId, this.notesFilename);
  }

  /**
   * Count lines in a file
   */
  countLines(content: string | null): number {
    if (!content || content.length === 0) return 0;
    return content.split('\n').length;
  }

  /**
   * Count log entries in NDJSON log file (non-empty lines only)
   * Each line is a JSON log entry, so counting non-empty lines gives accurate count
   */
  countLogEntries(content: string | null): number {
    if (!content || content.length === 0) return 0;
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  }

  /**
   * Get comprehensive metadata for an analysis
   */
  async getAnalysisMeta(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<AnalysisInfoResponse> {
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
      logContent,
      versionsData,
      teamInfo,
      processMetrics,
    ] = await Promise.all([
      this.safeFileStat(indexPath),
      this.safeReadContent(indexPath),
      this.safeFileStat(envPath),
      this.safeReadContent(envPath),
      this.safeFileStat(logPath),
      this.safeReadContent(logPath),
      this.safeReadVersions(versionsPath),
      this.getTeamInfo(analysis.teamId),
      this.getProcessMetricsForAnalysis(analysisId),
    ]);

    // Calculate line counts
    const analysisLineCount = this.countLines(indexContent);
    const envLineCount = this.countLines(envContent);
    const envVarCount = envContent
      ? envContent.split('\n').filter((line: string) => line.includes('='))
          .length
      : 0;

    // Build metadata object
    const meta: AnalysisInfoResponse = {
      // Identity
      analysisId,
      analysisName: analysis.analysisName,

      // File statistics
      file: {
        size: indexStats?.size || 0,
        sizeFormatted: formatFileSize(indexStats?.size || 0),
        lineCount: analysisLineCount,
        created: indexStats?.birthtime?.toISOString() || null,
        modified: indexStats?.mtime?.toISOString() || null,
      },

      // Environment
      environment: {
        size: envStats?.size || 0,
        sizeFormatted: formatFileSize(envStats?.size || 0),
        lineCount: envLineCount,
        variableCount: envVarCount,
      },

      // Logs (count from file for accuracy - in-memory count resets on stop)
      logs: {
        size: logStats?.size || 0,
        sizeFormatted: formatFileSize(logStats?.size || 0),
        totalCount: this.countLogEntries(logContent),
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
   */
  async getAnalysisNotes(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<AnalysisNotesResponse> {
    logger.info(
      { action: 'getAnalysisNotes', analysisId },
      'Getting analysis notes',
    );

    const analysis = analysisService.getAnalysisProcess(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const notesPath = this.getNotesPath(analysisId);
    let content: string;
    let isNew = false;

    try {
      content = (await safeReadFile(notesPath, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Create default notes file
        content = DEFAULT_NOTES_TEMPLATE;
        await safeWriteFile(notesPath, content, config.paths.analysis);
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
      sizeFormatted: formatFileSize(stats?.size || 0),
      lastModified: stats?.mtime?.toISOString() || null,
    };
  }

  /**
   * Update analysis notes content
   */
  async updateAnalysisNotes(
    analysisId: string,
    content: string,
    logger: Logger = moduleLogger,
  ): Promise<UpdateAnalysisNotesResponse> {
    logger.info(
      { action: 'updateAnalysisNotes', analysisId },
      'Updating analysis notes',
    );

    const analysis = analysisService.getAnalysisProcess(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const notesPath = this.getNotesPath(analysisId);
    await safeWriteFile(notesPath, content, config.paths.analysis);

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
      sizeFormatted: formatFileSize(stats?.size || 0),
      lastModified: stats?.mtime?.toISOString() || null,
    };
  }

  /**
   * Check if notes file exists
   */
  async notesExist(analysisId: string): Promise<boolean> {
    const stats = await this.safeFileStat(this.getNotesPath(analysisId));
    return stats !== null;
  }

  /**
   * Get default notes template
   */
  getDefaultTemplate(): string {
    return DEFAULT_NOTES_TEMPLATE;
  }

  // Helper methods

  private async safeFileStat(filePath: string): Promise<Stats | null> {
    try {
      return await safeStat(filePath, config.paths.analysis);
    } catch {
      return null;
    }
  }

  private async safeReadContent(filePath: string): Promise<string | null> {
    try {
      return (await safeReadFile(filePath, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;
    } catch {
      return null;
    }
  }

  private async safeReadVersions(
    versionsPath: string,
  ): Promise<VersionsData | null> {
    try {
      const content = (await safeReadFile(versionsPath, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;
      return JSON.parse(content);
    } catch {
      return { versions: [], currentVersion: 1, nextVersionNumber: 1 };
    }
  }

  private async getTeamInfo(teamId: string | null): Promise<AnalysisTeamInfo> {
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

  private async getProcessMetricsForAnalysis(
    analysisId: string,
  ): Promise<AnalysisProcessMetrics | null> {
    try {
      const allProcessMetrics = await metricsService.getProcessMetrics();
      const processData = allProcessMetrics.find(
        (p: { analysis_id: string }) => p.analysis_id === analysisId,
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

  private getDnsUsage(): AnalysisDnsUsage {
    try {
      const stats = dnsCache.getStats();
      const dnsConfig = dnsCache.getConfig();
      return {
        enabled: dnsConfig.enabled,
        cacheSize: stats.cacheSize,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hitRate,
      };
    } catch {
      return { enabled: false, cacheSize: 0, hits: 0, misses: 0, hitRate: 0 };
    }
  }
}

const analysisInfoService = new AnalysisInfoService();
export { analysisInfoService };

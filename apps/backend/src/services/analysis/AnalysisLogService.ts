/**
 * AnalysisLogService - Log management for analysis processes
 *
 * Handles all log-related operations:
 * - Adding logs to analysis processes
 * - Retrieving logs from memory and file storage
 * - Clearing logs
 * - Downloading logs with time range filtering
 */

import path from 'path';
import { promises as fs, createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { Logger } from 'pino';
import { config } from '../../config/default.ts';
import { safeReadFile, safeWriteFile } from '../../utils/safePath.ts';
import { parseLogLine, createChildLogger } from '../../utils/logging/logger.ts';
import { getSseManager } from '../../utils/lazyLoader.ts';
import { ANALYSIS_SERVICE } from '../../constants.ts';
import { LOG_TIME_RANGE_VALUES } from '../../validation/analysisSchemas.ts';
import type {
  IAnalysisConfigService,
  LogEntry,
  LogsResult,
  InitialLogsResult,
  ClearLogsResult,
  DownloadLogsResult,
  LogTimeRange,
} from './types.ts';

const moduleLogger = createChildLogger('analysis-log-service');

/**
 * Service for managing analysis log operations.
 */
export class AnalysisLogService {
  private readonly configService: IAnalysisConfigService;

  constructor(configService: IAnalysisConfigService) {
    this.configService = configService;
  }

  /**
   * Validate a time range string
   */
  validateTimeRange(
    timeRange: string,
  ): timeRange is (typeof LOG_TIME_RANGE_VALUES)[number] {
    return (LOG_TIME_RANGE_VALUES as readonly string[]).includes(timeRange);
  }

  /**
   * Add a log entry to an analysis
   */
  async addLog(analysisId: string, message: string): Promise<void> {
    const analysis = this.configService.getAnalysisProcess(analysisId);
    if (analysis) {
      await analysis.addLog(message);
    }
  }

  /**
   * Get initial logs for an analysis (from memory)
   */
  async getInitialLogs(
    analysisId: string,
    limit: number = ANALYSIS_SERVICE.DEFAULT_LOGS_LIMIT,
  ): Promise<InitialLogsResult> {
    const analysis = this.configService.getAnalysisProcess(analysisId);
    if (!analysis) {
      return { logs: [], totalCount: 0 };
    }

    const result = analysis.getMemoryLogs(1, limit);
    return {
      logs: [...result.logs],
      totalCount: result.totalCount,
    };
  }

  /**
   * Get paginated logs for an analysis
   */
  async getLogs(
    analysisId: string,
    page: number = 1,
    limit: number = ANALYSIS_SERVICE.DEFAULT_PAGINATION_LIMIT,
    logger: Logger = moduleLogger,
  ): Promise<LogsResult> {
    logger.debug(
      { action: 'getLogs', analysisId, page, limit },
      'Getting logs',
    );

    const analysis = this.configService.getAnalysisProcess(analysisId);

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // For page 1, try memory first
    if (page === 1) {
      const memoryResult = analysis.getMemoryLogs(page, limit);
      if (memoryResult.logs.length > 0) {
        return {
          logs: [...memoryResult.logs],
          hasMore: memoryResult.totalCount > limit,
          totalCount: memoryResult.totalCount,
          source: 'memory',
        };
      }
    }

    // For page 2+ or if no memory logs, always use file reading
    return this.getLogsFromFile(analysisId, page, limit);
  }

  /**
   * Get logs from file storage
   */
  private async getLogsFromFile(
    analysisId: string,
    page: number = 1,
    limit: number = ANALYSIS_SERVICE.DEFAULT_PAGINATION_LIMIT,
  ): Promise<LogsResult> {
    try {
      const logFile = path.join(
        config.paths.analysis,
        analysisId,
        'logs',
        'analysis.log',
      );

      // Check if file exists
      try {
        await fs.access(logFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { logs: [], hasMore: false, totalCount: 0, source: 'file' };
        }
        throw error;
      }

      // Use streaming approach for large files
      return await this.streamLogsFromFile(logFile, page, limit);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { logs: [], hasMore: false, totalCount: 0, source: 'file' };
      }
      throw new Error(`Failed to retrieve logs: ${(error as Error).message}`);
    }
  }

  /**
   * Stream logs from file efficiently without loading entire file into memory
   */
  private async streamLogsFromFile(
    logFile: string,
    page: number = 1,
    limit: number = ANALYSIS_SERVICE.DEFAULT_PAGINATION_LIMIT,
  ): Promise<LogsResult> {
    return new Promise((resolve, reject) => {
      const lines: LogEntry[] = [];
      let totalCount = 0;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by getLogFilePath
      const fileStream = createReadStream(logFile, { encoding: 'utf8' });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity, // Handle Windows line endings
      });

      rl.on('line', (line) => {
        if (line.trim()) {
          totalCount++;

          // Only collect lines we need for this page (plus some buffer for sorting)
          if (
            lines.length <
            endIndex + ANALYSIS_SERVICE.LOG_REVERSE_SORT_BUFFER
          ) {
            const parsed = parseLogLine(line, true);
            if (parsed) {
              lines.push({
                sequence: totalCount,
                timestamp: parsed.timestamp,
                message: parsed.message,
                createdAt: parsed.date.getTime(),
              });
            }
          }
        }
      });

      rl.on('close', () => {
        // Reverse for most recent first, then paginate
        const allLogs = lines.reverse();
        const paginatedLogs = allLogs.slice(startIndex, endIndex);

        resolve({
          logs: paginatedLogs,
          hasMore: endIndex < totalCount,
          totalCount,
          source: 'file-stream',
        });
      });

      rl.on('error', (error) => {
        reject(error);
      });

      fileStream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Clear logs for an analysis
   */
  async clearLogs(
    analysisId: string,
    options: { broadcast?: boolean; logger?: Logger } = {},
  ): Promise<ClearLogsResult> {
    const { broadcast = true, logger = moduleLogger } = options;
    try {
      const analysis = this.configService.getAnalysisProcess(analysisId);
      if (!analysis) {
        throw new Error('Analysis not found');
      }

      const logFilePath = path.join(
        config.paths.analysis,
        analysisId,
        'logs',
        'analysis.log',
      );

      // Clear file (logs are stored in NDJSON format: one JSON object per line)
      await safeWriteFile(logFilePath, '', config.paths.analysis);

      // Reset in-memory state
      analysis.logs = [];
      analysis.logSequence = 0;
      analysis.totalLogCount = 0;

      // Broadcast logsCleared event so frontend clears its state
      // Skip broadcast if caller handles it (e.g., rollback has its own event)
      if (broadcast) {
        const sseManager = await getSseManager();
        sseManager.broadcastAnalysisUpdate(analysisId, {
          type: 'logsCleared',
          data: {
            analysisId,
            analysisName: analysis.analysisName,
            clearMessage: {
              timestamp: new Date().toLocaleString(),
              message: 'Log file cleared',
              level: 'info',
            },
          },
        });
      }

      return { success: true, message: 'Logs cleared successfully' };
    } catch (error) {
      logger.error({ error, analysisId }, 'Error clearing logs');
      throw new Error(`Failed to clear logs: ${(error as Error).message}`);
    }
  }

  /**
   * Get filtered logs for download based on time range
   * Logs are stored in NDJSON format and converted to human-readable format: [timestamp] message
   */
  async getLogsForDownload(
    analysisId: string,
    timeRange: LogTimeRange,
    logger: Logger = moduleLogger,
  ): Promise<DownloadLogsResult> {
    logger.debug(
      { action: 'getLogsForDownload', analysisId, timeRange },
      'Getting logs for download',
    );

    try {
      const logFile = path.join(
        config.paths.analysis,
        analysisId,
        'logs',
        'analysis.log',
      );

      // Ensure the log file exists
      await fs.access(logFile);

      const content = (await safeReadFile(logFile, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      if (timeRange === 'all') {
        // Format all logs for human-readable download
        const formattedContent = lines
          .map((line) => parseLogLine(line, false))
          .filter(Boolean)
          .join('\n');
        return { logFile, content: formattedContent };
      }

      // Filter logs based on timestamp
      const cutoffDate = this.calculateCutoffDate(timeRange);

      // Filter logs and format for human-readable download
      const filteredLogs = lines
        .map((line) => {
          const parsed = parseLogLine(line, true);
          if (parsed && parsed.date >= cutoffDate) {
            return parseLogLine(line, false); // Return formatted string
          }
          return null;
        })
        .filter(Boolean);

      return { logFile, content: filteredLogs.join('\n') };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Log file not found for analysis: ${analysisId}`);
      }
      throw error;
    }
  }

  /**
   * Calculate the cutoff date based on time range
   */
  private calculateCutoffDate(timeRange: Exclude<LogTimeRange, 'all'>): Date {
    const cutoffDate = new Date();

    switch (timeRange) {
      case '1h':
        cutoffDate.setHours(cutoffDate.getHours() - 1);
        break;
      case '24h':
        cutoffDate.setHours(cutoffDate.getHours() - 24);
        break;
      case '7d':
        cutoffDate.setDate(cutoffDate.getDate() - 7);
        break;
      case '30d':
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        break;
      default: {
        // TypeScript exhaustiveness check
        const _exhaustiveCheck: never = timeRange;
        throw new Error(`Invalid time range: ${_exhaustiveCheck}`);
      }
    }

    return cutoffDate;
  }
}

/**
 * Factory function to create an AnalysisLogService instance
 */
export function createAnalysisLogService(
  configService: IAnalysisConfigService,
): AnalysisLogService {
  return new AnalysisLogService(configService);
}

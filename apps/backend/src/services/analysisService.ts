/**
 * Analysis Service - Core business logic for analysis management
 * @module analysisService
 */
import path from 'path';
import { promises as fs, createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { Logger } from 'pino';
import type {
  AnalysisStatus,
  AnalysisIntendedState,
  Analysis,
  AnalysesMap,
  AnalysisVersion,
  AnalysisVersionsResponse,
} from '@tago-analysis-worker/types/domain';
import { config } from '../config/default.ts';
import { encrypt, decrypt } from '../utils/cryptoUtils.ts';
import {
  safeMkdir,
  safeWriteFile,
  safeReadFile,
  safeReaddir,
  safeStat,
} from '../utils/safePath.ts';
import { LOG_TIME_RANGE_VALUES } from '../validation/analysisSchemas.ts';
import { AnalysisProcess } from '../models/analysisProcess/index.ts';
import { teamService, type NewStructureItem } from './teamService.ts';

/** Simple type for uploaded file (from express-fileupload) */
type UploadedFile = {
  readonly name: string;
  mv: (path: string) => Promise<void>;
};
import { createChildLogger, parseLogLine } from '../utils/logging/logger.ts';
import { collectChildProcessMetrics } from '../utils/metrics-enhanced.ts';
import { FILE_SIZE, ANALYSIS_SERVICE } from '../constants.ts';
import {
  runAnalysisConfigMigrations,
  getCurrentConfigVersion,
} from '../migrations/analysisConfigMigrations.ts';
import { generateId } from '../utils/generateId.ts';

const moduleLogger = createChildLogger('analysis-service');

// Lazy-loaded SSE manager to avoid circular dependencies
// Uses singleton pattern with promise caching for thread safety
type SSEManagerType = {
  broadcastAnalysisUpdate: (
    analysisId: string,
    data: object,
    teamId?: string,
  ) => void;
};

let _sseManager: SSEManagerType | null = null;
let _sseManagerPromise: Promise<SSEManagerType> | null = null;

async function getSseManager(): Promise<SSEManagerType> {
  if (_sseManager) return _sseManager;
  if (_sseManagerPromise) {
    await _sseManagerPromise;
    return _sseManager!;
  }

  _sseManagerPromise = (async () => {
    const { sseManager } = await import('../utils/sse/index.ts');
    _sseManager = sseManager as unknown as SSEManagerType;
    _sseManagerPromise = null;
    return _sseManager;
  })();

  await _sseManagerPromise;
  return _sseManager!;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/** Config entry for a single analysis */
type AnalysisConfigEntry = {
  id: string;
  name: string;
  enabled: boolean;
  intendedState: AnalysisIntendedState;
  lastStartTime: string | null;
  teamId: string | null;
};

/** Full configuration structure */
type AnalysesConfig = {
  version: string;
  analyses: Record<string, AnalysisConfigEntry>;
  teamStructure: Record<string, TeamStructureEntry>;
};

/** Team structure entry in config */
type TeamStructureEntry = {
  items: Array<NewStructureItem>;
};

/** Options for getAllAnalyses */
type GetAllAnalysesOptions = {
  readonly allowedTeamIds?: ReadonlyArray<string> | null;
  readonly search?: string;
  readonly status?: AnalysisStatus | null;
  readonly teamId?: string | null;
  readonly page?: number | null;
  readonly limit?: number | null;
};

/** Paginated analyses response */
type PaginatedAnalysesResponse = {
  readonly analyses: AnalysesMap;
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
    readonly hasMore: boolean;
  };
};

/** Upload result */
type UploadResult = {
  readonly analysisId: string;
  readonly analysisName: string;
};

/** Rename result */
type RenameResult = {
  readonly success: boolean;
  readonly restarted: boolean;
  readonly oldName: string;
  readonly newName: string;
};

/** Logs response */
type LogsResult = {
  logs: Array<LogEntry>;
  readonly hasMore: boolean;
  readonly totalCount: number;
  readonly source: string;
};

/** Log entry structure */
type LogEntry = {
  readonly sequence: number;
  readonly timestamp: string;
  readonly message: string;
  readonly createdAt?: number;
};

/** Initial logs response */
type InitialLogsResult = {
  logs: Array<LogEntry>;
  readonly totalCount: number;
};

/** Clear logs result */
type ClearLogsResult = {
  readonly success: boolean;
  readonly message: string;
};

/** Run analysis result */
type RunAnalysisResult = {
  readonly success: boolean;
  readonly status: AnalysisStatus;
  logs: Array<LogEntry>;
  readonly alreadyRunning?: boolean;
};

/** Stop analysis result */
type StopAnalysisResult = {
  readonly success: boolean;
};

/** Delete analysis result */
type DeleteAnalysisResult = {
  readonly message: string;
};

/** Update analysis options */
type UpdateAnalysisOptions = {
  content?: string;
  teamId?: string;
  [key: string]: unknown;
};

/** Update analysis result */
type UpdateAnalysisResult = {
  readonly success: boolean;
  readonly restarted: boolean;
  readonly savedVersion: number | null;
};

/** Rollback result */
type RollbackResult = {
  readonly success: boolean;
  readonly restarted: boolean;
  readonly version: number;
};

/** Version metadata file structure */
type VersionMetadata = {
  versions: Array<AnalysisVersion>;
  nextVersionNumber: number;
  currentVersion: number;
};

/** Download logs result */
type DownloadLogsResult = {
  readonly logFile: string;
  readonly content: string;
};

/** Environment variables map */
type EnvironmentVariables = Record<string, string>;

/** Update environment result */
type UpdateEnvironmentResult = {
  readonly success: boolean;
  readonly restarted: boolean;
};

/** Verify intended state result - arrays are mutable during construction */
type VerifyIntendedStateResult = {
  shouldBeRunning: number;
  attempted: Array<string>;
  succeeded: Array<string>;
  failed: Array<{ analysisId: string; error: string }>;
  alreadyRunning: Array<string>;
  connected: Array<string>;
  connectionTimeouts: Array<string>;
};

/** Analysis to start entry */
type AnalysisToStart = {
  readonly analysisId: string;
  readonly analysis: AnalysisProcess;
};

/** Start analysis result */
type StartAnalysisWithLoggingResult = {
  readonly analysisId: string;
  readonly analysis: AnalysisProcess;
  readonly started: boolean;
  readonly error?: Error;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = FILE_SIZE.KILOBYTES;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// ANALYSIS SERVICE
// ============================================================================

/**
 * Service for managing analysis lifecycle, file operations, versioning, and logging.
 */
class AnalysisService {
  private analyses: Map<string, AnalysisProcess>;
  private configCache: AnalysesConfig | null;
  private configPath: string;
  private healthCheckInterval: NodeJS.Timeout | null;
  private metricsInterval: NodeJS.Timeout | null;
  private startLocks: Map<string, Promise<RunAnalysisResult>>;

  constructor() {
    this.analyses = new Map();
    this.configCache = null;
    this.configPath = path.join(config.paths.config, 'analyses-config.json');
    this.healthCheckInterval = null;
    this.metricsInterval = null;
    this.startLocks = new Map();
  }

  /**
   * Get the count of running analyses
   */
  getRunningAnalysesCount(): number {
    return Array.from(this.analyses.values()).filter(
      (analysis) => analysis && analysis.status === 'running',
    ).length;
  }

  /**
   * Get all analyses for iteration (e.g., for graceful shutdown)
   * Returns a Map that can be iterated with for...of
   */
  getAllAnalysisProcesses(): Map<string, AnalysisProcess> {
    return this.analyses;
  }

  validateTimeRange(
    timeRange: string,
  ): timeRange is (typeof LOG_TIME_RANGE_VALUES)[number] {
    return (LOG_TIME_RANGE_VALUES as readonly string[]).includes(timeRange);
  }

  async getConfig(): Promise<AnalysesConfig> {
    if (!this.configCache) {
      await this.loadConfig();
    }
    return { ...this.configCache! };
  }

  /**
   * Update config while preserving in-memory AnalysisProcess instances
   */
  async updateConfig(newConfig: AnalysesConfig): Promise<void> {
    this.configCache = { ...newConfig };
    if (newConfig.analyses) {
      // Update existing analyses (keyed by analysisId in v5.0)
      this.analyses.forEach((analysis, analysisId) => {
        if (
          newConfig.analyses[analysisId] &&
          analysis instanceof AnalysisProcess
        ) {
          const configEntry = newConfig.analyses[analysisId];
          analysis.enabled = configEntry.enabled;
          analysis.intendedState = configEntry.intendedState || 'stopped';
          analysis.lastStartTime = configEntry.lastStartTime;
          analysis.teamId = configEntry.teamId;
          // Update name if changed (for rename operations)
          if (configEntry.name && configEntry.name !== analysis.analysisName) {
            analysis.analysisName = configEntry.name;
          }
        }
      });

      // Remove analyses that no longer exist in config
      for (const [analysisId] of this.analyses) {
        if (!newConfig.analyses[analysisId]) {
          this.analyses.delete(analysisId);
        }
      }

      // Add new analyses from config
      Object.entries(newConfig.analyses).forEach(
        ([analysisId, analysisConfig]) => {
          if (!this.analyses.has(analysisId)) {
            const analysis = new AnalysisProcess(
              analysisId,
              analysisConfig.name,
              this,
            );
            Object.assign(analysis, {
              enabled: analysisConfig.enabled,
              status: 'stopped',
              intendedState: analysisConfig.intendedState || 'stopped',
              lastStartTime: analysisConfig.lastStartTime,
              teamId: analysisConfig.teamId,
            });
            this.analyses.set(analysisId, analysis);
          }
        },
      );
    }

    await this.saveConfig();
  }

  async saveConfig(): Promise<void> {
    const configuration: AnalysesConfig = {
      version: this.configCache?.version || getCurrentConfigVersion(),
      analyses: {},
      teamStructure: this.configCache?.teamStructure || {},
    };

    // In v5.0, analyses are keyed by analysisId and include id/name properties
    this.analyses.forEach((analysis, analysisId) => {
      configuration.analyses[analysisId] = {
        id: analysisId,
        name: analysis.analysisName,
        enabled: analysis.enabled,
        intendedState: analysis.intendedState || 'stopped',
        lastStartTime: analysis.lastStartTime,
        teamId: analysis.teamId,
      };
    });

    await safeWriteFile(
      this.configPath,
      JSON.stringify(configuration, null, 2),
      config.paths.config,
    );

    this.configCache = configuration;
  }

  /** Get analysis by ID (primary lookup) */
  getAnalysisById(analysisId: string): AnalysisConfigEntry | undefined {
    return this.configCache?.analyses?.[analysisId];
  }

  /** Get analysis by name (for display/search) */
  getAnalysisByName(name: string): AnalysisConfigEntry | undefined {
    const analyses = this.configCache?.analyses || {};
    return Object.values(analyses).find((a) => a.name === name);
  }

  /** Get analysis ID by name */
  getAnalysisIdByName(name: string): string | undefined {
    const analysis = this.getAnalysisByName(name);
    return analysis?.id;
  }

  /** Get AnalysisProcess instance by ID */
  getAnalysisProcess(analysisId: string): AnalysisProcess | undefined {
    return this.analyses.get(analysisId);
  }

  async loadConfig(): Promise<AnalysesConfig> {
    try {
      const data = (await safeReadFile(this.configPath, config.paths.config, {
        encoding: 'utf8',
      })) as string;
      const configData = JSON.parse(data) as AnalysesConfig;

      // Run migrations (handles v4.0 -> v4.1 -> v5.0)
      // Type assertion needed because migration module has its own ConfigData type
      await runAnalysisConfigMigrations(
        configData as unknown as Parameters<
          typeof runAnalysisConfigMigrations
        >[0],
        this.configPath,
      );

      // Store the full config
      this.configCache = configData;

      // Don't load analyses here - they will be properly initialized
      // as AnalysisProcess instances in initializeAnalysis method

      moduleLogger.info(
        {
          configVersion: configData.version,
          analysisCount: Object.keys(configData.analyses || {}).length,
        },
        'Configuration loaded',
      );
      return configData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        moduleLogger.info('No existing config file, creating new one');
        this.configCache = {
          version: getCurrentConfigVersion(),
          analyses: {},
          teamStructure: {},
        };
        await this.saveConfig();
        return this.configCache;
      } else {
        throw error;
      }
    }
  }

  /** Create analysis directories using analysisId (UUID) */
  async createAnalysisDirectories(analysisId: string): Promise<string> {
    // UUIDs are inherently safe (alphanumeric + hyphens)
    const basePath = path.join(config.paths.analysis, analysisId);
    await Promise.all([
      safeMkdir(basePath, config.paths.analysis, { recursive: true }),
      safeMkdir(path.join(basePath, 'env'), config.paths.analysis, {
        recursive: true,
      }),
      safeMkdir(path.join(basePath, 'logs'), config.paths.analysis, {
        recursive: true,
      }),
      safeMkdir(path.join(basePath, 'versions'), config.paths.analysis, {
        recursive: true,
      }),
    ]);
    return basePath;
  }

  async uploadAnalysis(
    file: UploadedFile,
    targetDepartment: string | null = null,
    targetFolderId: string | null = null,
    logger: Logger = moduleLogger,
  ): Promise<UploadResult> {
    const analysisName = path.parse(file.name).name;
    const analysisId = generateId();

    // Create directories using analysisId
    const basePath = await this.createAnalysisDirectories(analysisId);
    const filePath = path.join(basePath, 'index.js');

    await file.mv(filePath);
    const analysis = new AnalysisProcess(analysisId, analysisName, this);

    // Set team ID from parameter, or get Uncategorized team ID if not provided
    let teamId = targetDepartment;
    if (!teamId || !teamId.trim()) {
      const teams = await teamService.getAllTeams();
      const uncategorizedTeam = teams.find((t) => t.name === 'Uncategorized');
      teamId = uncategorizedTeam?.id || 'uncategorized';
    }

    analysis.teamId = teamId;

    // Store by analysisId
    this.analyses.set(analysisId, analysis);

    const envFile = path.join(basePath, 'env', '.env');
    await safeWriteFile(envFile, '', config.paths.analysis);

    await this.saveConfig();

    if (!this.configCache!.teamStructure) {
      this.configCache!.teamStructure = {};
    }

    if (!this.configCache!.teamStructure[teamId]) {
      this.configCache!.teamStructure[teamId] = { items: [] };
    }

    // In v5.0, team structure items use analysisId as the id (no analysisName)
    const newItem: NewStructureItem = {
      id: analysisId,
      type: 'analysis',
    };

    await teamService.addItemToTeamStructure(teamId, newItem, targetFolderId);

    // Initialize version management using analysisId
    await this.initializeVersionManagement(analysisId);

    logger.info(
      {
        analysisId,
        analysisName,
        teamId,
        targetFolderId,
      },
      'Analysis uploaded successfully',
    );

    return { analysisId, analysisName };
  }

  /** Initialize version management using analysisId (for paths) */
  async initializeVersionManagement(analysisId: string): Promise<void> {
    const versionsDir = path.join(
      config.paths.analysis,
      analysisId,
      'versions',
    );
    const metadataPath = path.join(versionsDir, 'metadata.json');
    const currentFilePath = path.join(
      config.paths.analysis,
      analysisId,
      'index.js',
    );

    // Create versions directory
    await safeMkdir(versionsDir, config.paths.analysis, { recursive: true });

    // Read the uploaded content and save it as v1
    const uploadedContent = (await safeReadFile(
      currentFilePath,
      config.paths.analysis,
      { encoding: 'utf8' },
    )) as string;
    const v1Path = path.join(versionsDir, 'v1.js');
    await safeWriteFile(v1Path, uploadedContent, config.paths.analysis);

    // Create metadata - uploaded file is version 1
    const metadata: VersionMetadata = {
      versions: [
        {
          version: 1,
          timestamp: new Date().toISOString(),
          size: Buffer.byteLength(uploadedContent, 'utf8'),
        },
      ],
      nextVersionNumber: 2,
      currentVersion: 1,
    };

    await safeWriteFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      config.paths.analysis,
    );
  }

  /**
   * Get all analyses - in v5.0 directories are named by analysisId (UUID)
   * Supports advanced filtering via options object
   */
  async getAllAnalyses(
    options: GetAllAnalysesOptions = {},
  ): Promise<AnalysesMap | PaginatedAnalysesResponse> {
    const {
      allowedTeamIds = null,
      search = '',
      status = null,
      teamId = null,
      page = null,
      limit = null,
    } = options;

    const analysisDirectories = (await safeReaddir(
      config.paths.analysis,
    )) as string[];

    const results = await Promise.all(
      analysisDirectories.map(async (analysisId: string) => {
        const indexPath = path.join(
          config.paths.analysis,
          analysisId,
          'index.js',
        );
        try {
          const analysis = this.analyses.get(analysisId);

          // Early filtering: Skip analyses not in allowed teams (if filter is provided)
          if (
            allowedTeamIds !== null &&
            !allowedTeamIds.includes(analysis?.teamId || '')
          ) {
            return null;
          }

          // Team ID filter: Skip if doesn't match requested team
          if (teamId !== null && analysis?.teamId !== teamId) {
            return null;
          }

          // Status filter: Skip if doesn't match requested status
          if (status !== null && (analysis?.status || 'stopped') !== status) {
            return null;
          }

          // Search filter: Skip if name doesn't contain search term (case-insensitive)
          const analysisName = analysis?.analysisName || analysisId;
          if (
            search &&
            !analysisName.toLowerCase().includes(search.toLowerCase())
          ) {
            return null;
          }

          const stats = await safeStat(indexPath, config.paths.analysis);

          return {
            id: analysisId,
            name: analysisName,
            size: formatFileSize(stats.size),
            created: stats.birthtime.toISOString(),
            status: analysis?.status || 'stopped',
            enabled: analysis?.enabled || false,
            lastStartTime: analysis?.lastStartTime || null,
            teamId: analysis?.teamId || null,
          } as Analysis;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw error;
        }
      }),
    );

    // Filter out nulls
    const filteredResults = results.filter((r): r is Analysis => r !== null);

    // If pagination is requested, return paginated format
    if (page !== null && limit !== null) {
      const total = filteredResults.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const paginatedResults = filteredResults.slice(
        startIndex,
        startIndex + limit,
      );

      // Convert to object
      const analysesObj: AnalysesMap = {};
      paginatedResults.forEach((analysis) => {
        analysesObj[analysis.id] = analysis;
      });

      return {
        analyses: analysesObj,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page < totalPages,
        },
      };
    }

    // Return as object keyed by analysisId to match SSE expectations
    const analysesObj: AnalysesMap = {};
    filteredResults.forEach((analysis) => {
      analysesObj[analysis.id] = analysis;
    });
    return analysesObj;
  }

  /**
   * Rename analysis - in v5.0, only changes the name property, NOT the directory
   * The directory stays as the analysisId (UUID)
   */
  async renameAnalysis(
    analysisId: string,
    newName: string,
    logger: Logger = moduleLogger,
  ): Promise<RenameResult> {
    try {
      const analysis = this.analyses.get(analysisId);

      if (!analysis) {
        throw new Error(`Analysis '${analysisId}' not found`);
      }

      const oldName = analysis.analysisName;
      const wasRunning = analysis && analysis.status === 'running';

      // If running, stop the analysis first
      if (wasRunning) {
        await this.stopAnalysis(analysisId);
        await this.addLog(analysisId, 'Stopping analysis for rename operation');
      }

      // In v5.0, rename only changes the name property - directory stays as analysisId
      // Use the setter to update the name (logger is updated, paths stay the same)
      analysis.analysisName = newName;

      // Log the rename operation
      await this.addLog(
        analysisId,
        `Analysis renamed from '${oldName}' to '${newName}'`,
      );

      // Save updated config to analyses-config.json
      await this.saveConfig();

      // If it was running before, restart it
      if (wasRunning) {
        await this.runAnalysis(analysisId);
        await this.addLog(
          analysisId,
          'Analysis restarted after rename operation',
        );
      }

      return {
        success: true,
        restarted: wasRunning,
        oldName,
        newName,
      };
    } catch (error) {
      logger.error({ error, analysisId, newName }, 'Error renaming analysis');
      throw error;
    }
  }

  async addLog(analysisId: string, message: string): Promise<void> {
    const analysis = this.analyses.get(analysisId);
    if (analysis) {
      await analysis.addLog(message);
    }
  }

  async getInitialLogs(
    analysisId: string,
    limit: number = ANALYSIS_SERVICE.DEFAULT_LOGS_LIMIT,
  ): Promise<InitialLogsResult> {
    const analysis = this.analyses.get(analysisId);
    if (!analysis) {
      return { logs: [], totalCount: 0 };
    }

    const result = analysis.getMemoryLogs(1, limit);
    return {
      logs: [...result.logs],
      totalCount: result.totalCount,
    };
  }

  async clearLogs(
    analysisId: string,
    options: { broadcast?: boolean; logger?: Logger } = {},
  ): Promise<ClearLogsResult> {
    const { broadcast = true, logger = moduleLogger } = options;
    try {
      const analysis = this.analyses.get(analysisId);
      if (!analysis) {
        throw new Error('Analysis not found');
      }

      // In v5.0, paths use analysisId
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

  getProcessStatus(analysisId: string): AnalysisStatus {
    const analysis = this.analyses.get(analysisId);
    return analysis ? analysis.status : 'stopped';
  }

  /** Check if a start operation is currently in progress for an analysis */
  isStartInProgress(analysisId: string): boolean {
    return this.startLocks.has(analysisId);
  }

  getStartOperationsInProgress(): string[] {
    return Array.from(this.startLocks.keys());
  }

  /** Start analysis with lock protection to prevent race conditions */
  async runAnalysis(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<RunAnalysisResult> {
    logger.info({ action: 'runAnalysis', analysisId }, 'Running analysis');

    // Check if analysis exists
    const analysis = this.analyses.get(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    // Check if a start operation is already in progress for this analysis
    if (this.startLocks.has(analysisId)) {
      logger.info(
        { action: 'runAnalysis', analysisId },
        'Start operation already in progress, waiting for completion',
      );

      // Wait for the ongoing operation to complete and return its result
      try {
        const result = await this.startLocks.get(analysisId)!;
        logger.info(
          { action: 'runAnalysis', analysisId },
          'Concurrent start operation completed',
        );
        return result;
      } catch (error) {
        // If the concurrent operation failed, throw the error
        logger.error(
          { action: 'runAnalysis', analysisId, error },
          'Concurrent start operation failed',
        );
        throw error;
      }
    }

    // Check if analysis is already running (additional safety check)
    if (analysis.status === 'running' && analysis.process) {
      logger.info(
        { action: 'runAnalysis', analysisId },
        'Analysis is already running',
      );
      return {
        success: true,
        status: analysis.status,
        logs: analysis.logs,
        alreadyRunning: true,
      };
    }

    // Create a promise for this start operation and store it as a lock
    const startPromise = (async (): Promise<RunAnalysisResult> => {
      try {
        await analysis.start();
        await this.saveConfig();

        logger.info(
          { action: 'runAnalysis', analysisId, status: analysis.status },
          'Analysis started successfully',
        );

        return { success: true, status: analysis.status, logs: analysis.logs };
      } catch (error) {
        logger.error(
          { action: 'runAnalysis', analysisId, error },
          'Failed to start analysis',
        );
        throw error;
      } finally {
        // Always remove the lock when the operation completes (success or failure)
        this.startLocks.delete(analysisId);
      }
    })();

    // Store the promise as a lock before starting the operation
    this.startLocks.set(analysisId, startPromise);

    // Return the promise result
    return startPromise;
  }

  async stopAnalysis(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<StopAnalysisResult> {
    logger.info({ action: 'stopAnalysis', analysisId }, 'Stopping analysis');

    const analysis = this.analyses.get(analysisId);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // Set intended state to stopped when manually stopping
    analysis.intendedState = 'stopped';
    await analysis.stop();
    await this.saveConfig();

    logger.info({ action: 'stopAnalysis', analysisId }, 'Analysis stopped');
    return { success: true };
  }

  async getLogs(
    analysisId: string,
    page: number = 1,
    limit: number = ANALYSIS_SERVICE.DEFAULT_PAGINATION_LIMIT,
    logger: Logger = moduleLogger,
  ): Promise<LogsResult> {
    logger.info({ action: 'getLogs', analysisId, page, limit }, 'Getting logs');

    const analysis = this.analyses.get(analysisId);

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

  async getLogsFromFile(
    analysisId: string,
    page: number = 1,
    limit: number = ANALYSIS_SERVICE.DEFAULT_PAGINATION_LIMIT,
  ): Promise<LogsResult> {
    try {
      // In v5.0, paths use analysisId
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

  /** Stream logs from file efficiently without loading entire file into memory */
  async streamLogsFromFile(
    logFile: string,
    page: number = 1,
    limit: number = ANALYSIS_SERVICE.DEFAULT_PAGINATION_LIMIT,
  ): Promise<LogsResult> {
    return new Promise((resolve, reject) => {
      const lines: LogEntry[] = [];
      let totalCount = 0;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

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
            // Buffer for reverse sort
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

  async deleteAnalysis(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<DeleteAnalysisResult> {
    const analysis = this.analyses.get(analysisId);
    const teamId = analysis?.teamId;
    const analysisName = analysis?.analysisName;

    if (analysis) {
      await analysis.stop();
      // Clean up all resources to prevent memory leaks
      await analysis.cleanup();
    }

    // In v5.0, directory is named by analysisId
    const analysisPath = path.join(config.paths.analysis, analysisId);
    try {
      // This will delete the entire analysis directory including versions folder
      await fs.rm(analysisPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Remove from in-memory map
    this.analyses.delete(analysisId);

    // Remove from team structure BEFORE saving config
    // In v5.0, team structure items use analysisId as the id
    if (teamId) {
      const configData = await this.getConfig();

      if (configData.teamStructure?.[teamId]) {
        const removeFromArray = (items: NewStructureItem[]): boolean => {
          for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            // In v5.0, analysis items have id === analysisId
            if (item.type === 'analysis' && item.id === analysisId) {
              items.splice(i, 1);
              return true;
            }
            if (item.type === 'folder' && item.items) {
              if (removeFromArray(item.items)) {
                return true;
              }
            }
          }
          return false;
        };

        removeFromArray(configData.teamStructure[teamId].items);
        // Update configCache directly
        this.configCache = configData;
      }
    }

    // Save config once - this will write both analyses and teamStructure
    await this.saveConfig();

    logger.info(
      {
        analysisId,
        analysisName,
        teamId,
      },
      'Analysis deleted successfully',
    );

    return { message: 'Analysis and all versions deleted successfully' };
  }

  async initialize(): Promise<void> {
    const configuration = await this.loadConfig();

    // Initialize department service after config is loaded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await teamService.initialize(this as any);

    // In v5.0, directories are named by analysisId (UUID)
    const analysisDirectories = (await safeReaddir(
      config.paths.analysis,
    )) as string[];
    await Promise.all(
      analysisDirectories.map(async (analysisId: string) => {
        try {
          const indexPath = path.join(
            config.paths.analysis,
            analysisId,
            'index.js',
          );
          const stats = await safeStat(indexPath, config.paths.analysis);
          if (stats.isFile()) {
            // Get config entry by analysisId
            const analysisConfig = configuration.analyses?.[analysisId];
            await this.initializeAnalysis(analysisId, analysisConfig);
          }
        } catch (error) {
          moduleLogger.error({ error, analysisId }, 'Error loading analysis');
        }
      }),
    );

    // Save config to ensure any newly discovered analyses are persisted
    await this.saveConfig();

    // Start periodic health check
    this.startHealthCheck();
  }

  async getAnalysisContent(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<string> {
    try {
      // In v5.0, paths use analysisId
      const filePath = path.join(config.paths.analysis, analysisId, 'index.js');
      const content = (await safeReadFile(filePath, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;
      return content;
    } catch (error) {
      logger.error({ error, analysisId }, 'Error reading analysis content');
      throw new Error(
        `Failed to get analysis content: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Save a version of the analysis before updating (only if content is truly new)
   */
  async saveVersion(analysisId: string): Promise<number | null> {
    // In v5.0, paths use analysisId
    const versionsDir = path.join(
      config.paths.analysis,
      analysisId,
      'versions',
    );
    const metadataPath = path.join(versionsDir, 'metadata.json');
    const currentFilePath = path.join(
      config.paths.analysis,
      analysisId,
      'index.js',
    );

    // Ensure versions directory exists
    await safeMkdir(versionsDir, config.paths.analysis, { recursive: true });

    // Load or create metadata
    let metadata: VersionMetadata = {
      versions: [],
      nextVersionNumber: 1,
      currentVersion: 0,
    };
    let isFirstVersionSave = false;
    try {
      const metadataContent = (await safeReadFile(
        metadataPath,
        config.paths.analysis,
        { encoding: 'utf8' },
      )) as string;
      metadata = JSON.parse(metadataContent);
      // Ensure currentVersion exists for backward compatibility
      if (metadata.currentVersion === undefined) {
        metadata.currentVersion =
          metadata.versions.length > 0
            ? metadata.versions[metadata.versions.length - 1].version
            : 1;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // This is a pre-versioning analysis being saved for the first time
        isFirstVersionSave = true;
      } else {
        throw error;
      }
    }

    // Read current content
    const currentContent = (await safeReadFile(
      currentFilePath,
      config.paths.analysis,
      { encoding: 'utf8' },
    )) as string;

    // Check if current content matches ANY existing saved version
    for (const version of metadata.versions) {
      try {
        const versionFilePath = path.join(
          versionsDir,
          `v${version.version}.js`,
        );
        const versionContent = (await safeReadFile(
          versionFilePath,
          config.paths.analysis,
          { encoding: 'utf8' },
        )) as string;
        if (currentContent === versionContent) {
          // Content already exists as a saved version, no need to save again
          return null;
        }
      } catch {
        // If we can't read a version file, continue checking others
        continue;
      }
    }

    // Content is truly new, save it as the next version
    const newVersionNumber = isFirstVersionSave
      ? 1
      : metadata.nextVersionNumber;
    const versionFilePath = path.join(versionsDir, `v${newVersionNumber}.js`);
    await safeWriteFile(versionFilePath, currentContent, config.paths.analysis);

    // Update metadata - add the new version and increment counter
    metadata.versions.push({
      version: newVersionNumber,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(currentContent, 'utf8'),
    });

    // Set proper values for next version and current version
    if (isFirstVersionSave) {
      metadata.nextVersionNumber = 2;
      metadata.currentVersion = 1;
    } else {
      metadata.nextVersionNumber = metadata.nextVersionNumber + 1;
      metadata.currentVersion = newVersionNumber;
    }

    await safeWriteFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      config.paths.analysis,
    );

    return newVersionNumber;
  }

  async getVersions(
    analysisId: string,
    options: { page?: number; limit?: number; logger?: Logger } = {},
  ): Promise<AnalysisVersionsResponse> {
    const { page = 1, limit = 10, logger = moduleLogger } = options;

    logger.info(
      { action: 'getVersions', analysisId, page, limit },
      'Getting versions',
    );

    // In v5.0, paths use analysisId
    const metadataPath = path.join(
      config.paths.analysis,
      analysisId,
      'versions',
      'metadata.json',
    );
    const currentFilePath = path.join(
      config.paths.analysis,
      analysisId,
      'index.js',
    );

    try {
      const metadataContent = (await safeReadFile(
        metadataPath,
        config.paths.analysis,
        { encoding: 'utf8' },
      )) as string;
      const metadata: VersionMetadata = JSON.parse(metadataContent);
      // Ensure currentVersion exists for backward compatibility
      if (metadata.currentVersion === undefined) {
        metadata.currentVersion = metadata.nextVersionNumber - 1;
      }

      // Check if the current index.js content matches any saved version
      try {
        const currentContent = (await safeReadFile(
          currentFilePath,
          config.paths.analysis,
          { encoding: 'utf8' },
        )) as string;
        let currentContentMatchesVersion = false;

        // Check against all saved versions
        for (const version of metadata.versions) {
          try {
            const versionFilePath = path.join(
              config.paths.analysis,
              analysisId,
              'versions',
              `v${version.version}.js`,
            );
            const versionContent = (await safeReadFile(
              versionFilePath,
              config.paths.analysis,
              { encoding: 'utf8' },
            )) as string;
            if (currentContent === versionContent) {
              // Current content matches this saved version
              metadata.currentVersion = version.version;
              currentContentMatchesVersion = true;
              break;
            }
          } catch {
            // If we can't read a version file, continue checking others
            continue;
          }
        }

        // If current content doesn't match any saved version, it's the next version
        if (!currentContentMatchesVersion) {
          metadata.currentVersion = metadata.nextVersionNumber;
        }
      } catch {
        // If we can't read the current file, fall back to metadata currentVersion
      }

      // Sort versions in descending order (newest first)
      const sortedVersions = [...metadata.versions].sort(
        (a, b) => b.version - a.version,
      );

      // Calculate pagination
      const totalCount = sortedVersions.length;
      const totalPages = Math.ceil(totalCount / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedVersions = sortedVersions.slice(startIndex, endIndex);
      const hasMore = page < totalPages;

      return {
        versions: paginatedVersions,
        page,
        limit,
        totalCount,
        totalPages,
        hasMore,
        nextVersionNumber: metadata.nextVersionNumber,
        currentVersion: metadata.currentVersion,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          versions: [],
          page: 1,
          limit,
          totalCount: 0,
          totalPages: 0,
          hasMore: false,
          nextVersionNumber: 2,
          currentVersion: 1,
        };
      }
      throw error;
    }
  }

  async rollbackToVersion(
    analysisId: string,
    version: number,
    logger: Logger = moduleLogger,
  ): Promise<RollbackResult> {
    logger.info(
      { action: 'rollbackToVersion', analysisId, version },
      'Rolling back to version',
    );

    const analysis = this.analyses.get(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    // In v5.0, paths use analysisId
    const versionsDir = path.join(
      config.paths.analysis,
      analysisId,
      'versions',
    );
    const versionFilePath = path.join(versionsDir, `v${version}.js`);
    const currentFilePath = path.join(
      config.paths.analysis,
      analysisId,
      'index.js',
    );
    const metadataPath = path.join(versionsDir, 'metadata.json');

    // Check if version exists
    try {
      await fs.access(versionFilePath);
    } catch {
      throw new Error(`Version ${version} not found`);
    }

    const wasRunning = analysis.status === 'running';

    // Stop analysis if running
    if (wasRunning) {
      await this.stopAnalysis(analysisId);
      await this.addLog(
        analysisId,
        `Analysis stopped to rollback to version ${version}`,
      );
    }

    // Save current content before rollback if it's different from all existing versions
    await this.saveVersion(analysisId);

    // Replace current file with the target version content
    const versionContent = (await safeReadFile(
      versionFilePath,
      config.paths.analysis,
      { encoding: 'utf8' },
    )) as string;
    await safeWriteFile(currentFilePath, versionContent, config.paths.analysis);

    // Update metadata to track current version after rollback
    // Read metadata.json directly instead of using getVersions() which returns pagination fields
    const metadataContent = (await safeReadFile(
      metadataPath,
      config.paths.analysis,
      { encoding: 'utf8' },
    )) as string;
    const metadata: VersionMetadata = JSON.parse(metadataContent);
    metadata.currentVersion = version;
    await safeWriteFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      config.paths.analysis,
    );

    // Clear logs (skip broadcast since rollback has its own event)
    await this.clearLogs(analysisId, { broadcast: false });
    await this.addLog(analysisId, `Rolled back to version ${version}`);

    // Restart if it was running
    if (wasRunning) {
      await this.runAnalysis(analysisId);
      // Small delay to ensure the restart log is visible
      await new Promise((resolve) =>
        setTimeout(resolve, ANALYSIS_SERVICE.SMALL_DELAY_MS),
      );
      await this.addLog(analysisId, 'Analysis restarted after rollback');
    }

    logger.info(
      {
        action: 'rollbackToVersion',
        analysisId,
        version,
        restarted: wasRunning,
      },
      'Rollback completed',
    );
    return {
      success: true,
      restarted: wasRunning,
      version: version,
    };
  }

  async getVersionContent(
    analysisId: string,
    version: number,
    logger: Logger = moduleLogger,
  ): Promise<string> {
    logger.info(
      { action: 'getVersionContent', analysisId, version },
      'Getting version content',
    );

    // In v5.0, paths use analysisId
    if (version === 0) {
      // Return current version
      const currentFilePath = path.join(
        config.paths.analysis,
        analysisId,
        'index.js',
      );
      return (await safeReadFile(currentFilePath, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;
    }

    const versionFilePath = path.join(
      config.paths.analysis,
      analysisId,
      'versions',
      `v${version}.js`,
    );
    try {
      return (await safeReadFile(versionFilePath, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Version ${version} not found`);
      }
      throw error;
    }
  }

  async updateAnalysis(
    analysisId: string,
    updates: UpdateAnalysisOptions,
    logger: Logger = moduleLogger,
  ): Promise<UpdateAnalysisResult> {
    try {
      const analysis = this.analyses.get(analysisId);

      if (!analysis) {
        throw new Error(`Analysis ${analysisId} not found`);
      }

      // If team is being updated, validate it exists
      if (updates.teamId) {
        const team = await teamService.getTeam(updates.teamId);
        if (!team) {
          throw new Error(`Team ${updates.teamId} not found`);
        }
      }

      const wasRunning = analysis && analysis.status === 'running';
      let savedVersion: number | null = null;

      // If running and content is being updated, stop the analysis first
      if (wasRunning && updates.content) {
        await this.stopAnalysis(analysisId);
        await this.addLog(analysisId, 'Analysis stopped to update content');
      }

      // Save current version before updating content (only if current content is truly new)
      if (updates.content) {
        savedVersion = await this.saveVersion(analysisId);
        // In v5.0, paths use analysisId
        const filePath = path.join(
          config.paths.analysis,
          analysisId,
          'index.js',
        );
        await safeWriteFile(filePath, updates.content, config.paths.analysis);

        // Update currentVersion based on what happened
        if (savedVersion !== null) {
          // We saved a new version, currentVersion is already updated by saveVersion
        } else {
          // No new version was saved, check if the new content matches any existing version
          const metadata = await this.getVersions(analysisId);
          for (const version of metadata.versions) {
            try {
              const versionFilePath = path.join(
                config.paths.analysis,
                analysisId,
                'versions',
                `v${version.version}.js`,
              );
              const versionContent = (await safeReadFile(
                versionFilePath,
                config.paths.analysis,
                { encoding: 'utf8' },
              )) as string;
              if (updates.content === versionContent) {
                // New content matches existing version, update currentVersion
                const metadataPath = path.join(
                  config.paths.analysis,
                  analysisId,
                  'versions',
                  'metadata.json',
                );
                const updatedMetadata: VersionMetadata = {
                  versions: [...metadata.versions],
                  nextVersionNumber: metadata.nextVersionNumber,
                  currentVersion: version.version,
                };
                await safeWriteFile(
                  metadataPath,
                  JSON.stringify(updatedMetadata, null, 2),
                  config.paths.analysis,
                );
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      // Update analysis properties
      Object.assign(analysis, updates);
      await this.saveConfig();

      // If it was running before and content was updated, restart it
      if (wasRunning && updates.content) {
        await this.runAnalysis(analysisId);
        const logMessage =
          savedVersion !== null
            ? `Analysis updated successfully (previous version saved as v${savedVersion})`
            : 'Analysis updated successfully (no version saved - content unchanged)';
        await this.addLog(analysisId, logMessage);
      }

      return {
        success: true,
        restarted: wasRunning && !!updates.content,
        savedVersion: savedVersion,
      };
    } catch (error) {
      logger.error({ error, analysisId, updates }, 'Error updating analysis');
      throw new Error(`Failed to update analysis: ${(error as Error).message}`);
    }
  }

  /**
   * Get filtered logs for download based on time range
   * Logs are stored in NDJSON format and converted to human-readable format: [timestamp] message
   */
  async getLogsForDownload(
    analysisId: string,
    timeRange: string,
    logger: Logger = moduleLogger,
  ): Promise<DownloadLogsResult> {
    logger.info(
      { action: 'getLogsForDownload', analysisId, timeRange },
      'Getting logs for download',
    );

    try {
      // In v5.0, paths use analysisId
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
        default:
          throw new Error('Invalid time range specified');
      }

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

  async getEnvironment(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<EnvironmentVariables> {
    logger.info(
      { action: 'getEnvironment', analysisId },
      'Getting environment variables',
    );

    // In v5.0, paths use analysisId
    const envFile = path.join(config.paths.analysis, analysisId, 'env', '.env');

    try {
      const envContent = (await safeReadFile(envFile, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;
      const envVariables: EnvironmentVariables = {};
      envContent.split('\n').forEach((line) => {
        const [key, encryptedValue] = line.split('=');
        if (key && encryptedValue) {
          envVariables[key] = decrypt(encryptedValue);
        }
      });
      return envVariables;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {}; // Return an empty object if the env file does not exist
      }
      throw error;
    }
  }

  async updateEnvironment(
    analysisId: string,
    env: EnvironmentVariables,
    logger: Logger = moduleLogger,
  ): Promise<UpdateEnvironmentResult> {
    // In v5.0, paths use analysisId
    const envFile = path.join(config.paths.analysis, analysisId, 'env', '.env');
    const analysis = this.analyses.get(analysisId);
    const wasRunning = analysis && analysis.status === 'running';

    try {
      // If running, stop the analysis first
      if (wasRunning) {
        await this.stopAnalysis(analysisId);
        await this.addLog(analysisId, 'Analysis stopped to update environment');
      }

      const envContent = Object.entries(env)
        .map(([key, value]) => `${key}=${encrypt(value)}`)
        .join('\n');

      await safeWriteFile(envFile, envContent, config.paths.analysis);

      // If it was running before, restart it
      if (wasRunning) {
        await this.runAnalysis(analysisId);
        await this.addLog(analysisId, 'Analysis updated successfully');
      }

      return {
        success: true,
        restarted: wasRunning ?? false,
      };
    } catch (error) {
      logger.error({ error, analysisId }, 'Error updating environment');
      throw new Error(
        `Failed to update environment: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Initialize an analysis from config
   * In v5.0, analysisId is the directory name (UUID), analysisConfig contains the name property
   */
  async initializeAnalysis(
    analysisId: string,
    analysisConfig: Partial<AnalysisConfigEntry> = {},
  ): Promise<void> {
    const defaultConfig = {
      enabled: false,
      status: 'stopped' as AnalysisStatus,
      intendedState: 'stopped' as AnalysisIntendedState,
      lastStartTime: null,
      teamId: null,
    };

    const fullConfig = { ...defaultConfig, ...analysisConfig };
    // Get the display name from config, fallback to analysisId if not found
    const analysisName = fullConfig.name || analysisId;
    // AnalysisProcess constructor: (analysisId, analysisName, service)
    const analysis = new AnalysisProcess(analysisId, analysisName, this);

    Object.assign(analysis, {
      enabled: fullConfig.enabled,
      // Always initialize status as 'stopped' - processes are started separately via start()
      status: 'stopped',
      intendedState: fullConfig.intendedState || 'stopped',
      lastStartTime: fullConfig.lastStartTime,
      teamId: fullConfig.teamId,
    });

    // Initialize log state (this replaces the old log loading logic)
    await analysis.initializeLogState();

    // Store by analysisId
    this.analyses.set(analysisId, analysis);
  }

  getAnalysesThatShouldBeRunning(): string[] {
    const shouldBeRunning: string[] = [];
    this.analyses.forEach((analysis, analysisId) => {
      if (analysis.intendedState === 'running') {
        shouldBeRunning.push(analysisId);
      }
    });
    return shouldBeRunning;
  }

  /** Wait for analysis to establish connection to TagoIO */
  async waitForAnalysisConnection(
    analysis: AnalysisProcess,
    timeoutMs: number = ANALYSIS_SERVICE.CONNECTION_TIMEOUT_MS,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let resolved = false;

      // Check if already connected
      if (analysis.isConnected) {
        resolve(true);
        return;
      }

      // Set up periodic check for connection
      const checkInterval = setInterval(() => {
        // Check for connection success
        if (analysis.isConnected) {
          clearInterval(checkInterval);
          if (!resolved) {
            resolved = true;
            resolve(true);
          }
          return;
        }

        // Check for timeout
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        }
      }, ANALYSIS_SERVICE.CONNECTION_CHECK_INTERVAL_MS);
    });
  }

  /**
   * Verify intended state and restart analyses that should be running
   * Uses batched concurrent startup with connection verification
   */
  async verifyIntendedState(): Promise<VerifyIntendedStateResult> {
    const shouldBeRunning = this.getAnalysesThatShouldBeRunning();
    const results: VerifyIntendedStateResult = {
      shouldBeRunning: shouldBeRunning.length,
      attempted: [],
      succeeded: [],
      failed: [],
      alreadyRunning: [],
      connected: [],
      connectionTimeouts: [],
    };

    moduleLogger.info(
      `Intended state verification: Found ${shouldBeRunning.length} analyses that should be running`,
    );

    // Collect analyses that need starting
    const toStart = this.collectAnalysesToStart(shouldBeRunning, results);

    if (toStart.length === 0) {
      moduleLogger.info('No analyses need starting');
      return results;
    }

    // Create batches and process them
    const BATCH_SIZE = parseInt(
      process.env.ANALYSIS_BATCH_SIZE ||
        String(ANALYSIS_SERVICE.BATCH_SIZE_DEFAULT),
      10,
    );
    const batches = this.createAnalysisBatches(toStart, BATCH_SIZE);

    moduleLogger.info(
      `Starting ${batches.length} batches of up to ${BATCH_SIZE} analyses each`,
    );

    // Process each batch and collect connection results
    await this.processBatches(batches, results);

    moduleLogger.info(
      `State verification complete: ${results.succeeded.length}/${toStart.length} started, ` +
        `${results.connected.length}/${results.succeeded.length} connected successfully`,
    );

    return results;
  }

  /** Collect analyses that need to be started (filters out already-running and healthy analyses) */
  collectAnalysesToStart(
    shouldBeRunning: string[],
    results: VerifyIntendedStateResult,
  ): AnalysisToStart[] {
    const toStart: AnalysisToStart[] = [];

    for (const analysisId of shouldBeRunning) {
      const analysis = this.analyses.get(analysisId);
      if (!analysis) continue;

      results.attempted.push(analysisId);
      const hasLiveProcess =
        analysis.process && !analysis.process.killed && analysis.process.pid;

      if (analysis.status === 'running' && hasLiveProcess) {
        results.alreadyRunning.push(analysisId);
        moduleLogger.debug(
          `${analysisId} is already running with PID ${analysis.process?.pid}`,
        );
        continue;
      }

      // Reset status if process is dead but marked as running
      if (analysis.status === 'running' && !hasLiveProcess) {
        moduleLogger.info(
          `${analysisId} status shows running but no live process found - resetting status and restarting`,
        );
        analysis.status = 'stopped';
        analysis.process = null;
      }

      toStart.push({ analysisId, analysis });
    }

    return toStart;
  }

  createAnalysisBatches(
    toStart: AnalysisToStart[],
    batchSize: number,
  ): AnalysisToStart[][] {
    const batches: AnalysisToStart[][] = [];
    for (let i = 0; i < toStart.length; i += batchSize) {
      batches.push(toStart.slice(i, i + batchSize));
    }
    return batches;
  }

  /** Process all batches of analyses (starts each batch and waits for connections) */
  async processBatches(
    batches: AnalysisToStart[][],
    results: VerifyIntendedStateResult,
  ): Promise<void> {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      moduleLogger.info(
        `Starting batch ${batchIndex + 1}/${batches.length} with ${batch.length} analyses`,
      );

      await this.processBatch(batch, results);

      moduleLogger.info(`Batch ${batchIndex + 1} complete`);

      // Delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, ANALYSIS_SERVICE.BATCH_DELAY_MS),
        );
      }
    }
  }

  async processBatch(
    batch: AnalysisToStart[],
    results: VerifyIntendedStateResult,
  ): Promise<void> {
    // Start all analyses in batch concurrently
    const startPromises = batch.map(({ analysisId, analysis }) =>
      this.startAnalysisWithLogging(analysisId, analysis, results),
    );

    const startResults = await Promise.all(startPromises);

    // Wait for connections
    const connectionPromises = startResults
      .filter((r) => r.started)
      .map(({ analysisId, analysis }) =>
        this.verifyAnalysisConnection(analysisId, analysis, results),
      );

    await Promise.all(connectionPromises);
  }

  async startAnalysisWithLogging(
    analysisId: string,
    analysis: AnalysisProcess,
    results: VerifyIntendedStateResult,
  ): Promise<StartAnalysisWithLoggingResult> {
    try {
      moduleLogger.info(`Starting ${analysisId}`);
      await analysis.start();
      results.succeeded.push(analysisId);
      await this.addLog(
        analysisId,
        'Restarted during intended state verification',
      );
      return { analysisId, analysis, started: true };
    } catch (error) {
      moduleLogger.error(
        { err: error, analysisId },
        'Failed to start analysis',
      );
      results.failed.push({ analysisId, error: (error as Error).message });
      return { analysisId, analysis, started: false, error: error as Error };
    }
  }

  async verifyAnalysisConnection(
    analysisId: string,
    analysis: AnalysisProcess,
    results: VerifyIntendedStateResult,
  ): Promise<void> {
    const connected = await this.waitForAnalysisConnection(
      analysis,
      ANALYSIS_SERVICE.CONNECTION_TIMEOUT_MS,
    );

    if (connected) {
      moduleLogger.info(`${analysisId} connected successfully`);
      results.connected.push(analysisId);
    } else {
      moduleLogger.warn(`${analysisId} connection timeout (proceeding anyway)`);
      results.connectionTimeouts.push(analysisId);
    }
  }

  /**
   * Start periodic health check for analyses (runs every 5 minutes)
   * Helps recover from connection issues and internet outages
   */
  startHealthCheck(): void {
    // Clear any existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Run health check at configured interval
    const healthCheckIntervalMs = ANALYSIS_SERVICE.HEALTH_CHECK_INTERVAL_MS;

    this.healthCheckInterval = setInterval(async () => {
      moduleLogger.debug('Running periodic health check for analyses');

      try {
        // Check each analysis that should be running
        for (const [analysisId, analysis] of this.analyses) {
          if (
            analysis.intendedState === 'running' &&
            analysis.status !== 'running'
          ) {
            moduleLogger.warn(
              `Health check: ${analysisId} should be running but is ${analysis.status}. Attempting restart.`,
            );

            try {
              await analysis.start();
              await this.addLog(
                analysisId,
                'Restarted by periodic health check',
              );
              moduleLogger.info(
                `Health check: Successfully restarted ${analysisId}`,
              );

              // Reset restart attempts on successful health check restart
              if (analysis.connectionErrorDetected) {
                analysis.connectionErrorDetected = false;
                analysis.restartAttempts = 0;
              }
            } catch (error) {
              moduleLogger.error(
                { err: error, analysisId },
                'Health check: Failed to restart analysis',
              );
            }
          }
        }
      } catch (error) {
        moduleLogger.error(
          { err: error },
          'Error during periodic health check',
        );
      }
    }, healthCheckIntervalMs);

    moduleLogger.info(
      'Started periodic health check for analyses (5 minute interval)',
    );

    // Start metrics collection (separate from health check for more frequent updates)
    this.startMetricsCollection();
  }

  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      moduleLogger.info('Stopped periodic health check');
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      moduleLogger.info('Stopped metrics collection');
    }
  }

  startMetricsCollection(): void {
    // Clear any existing interval
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Collect metrics at configured interval
    const metricsIntervalMs = ANALYSIS_SERVICE.METRICS_COLLECTION_INTERVAL_MS;

    this.metricsInterval = setInterval(async () => {
      try {
        await collectChildProcessMetrics(this.analyses);
      } catch (error) {
        moduleLogger.debug({ err: error }, 'Error collecting process metrics');
      }
    }, metricsIntervalMs);

    moduleLogger.info('Started process metrics collection (1 second interval)');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

const analysisService = new AnalysisService();

function initializeAnalyses(): Promise<void> {
  return analysisService.initialize();
}

export { analysisService, initializeAnalyses };

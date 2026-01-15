/**
 * Analysis Service - Orchestrator
 *
 * Thin facade that composes all sub-services and provides a unified,
 * backward-compatible API for analysis management.
 *
 * This orchestrator delegates to specialized sub-services:
 * - AnalysisConfigService: Configuration and in-memory process map
 * - AnalysisLifecycleService: Process start/stop and health checks
 * - AnalysisFileService: File operations (upload, delete, update content)
 * - AnalysisVersionService: Version history management
 * - AnalysisLogService: Log operations
 * - AnalysisEnvironmentService: Environment variable management
 *
 * @module analysis/AnalysisService
 */
import path from 'path';
import { promises as fs } from 'fs';
import type { Logger } from 'pino';
import type {
  AnalysisStatus,
  AnalysesMap,
  Analysis,
  AnalysisVersionsResponse,
} from '@tago-analysis-worker/types/domain';

import { config } from '../../config/default.ts';
import { createChildLogger } from '../../utils/logging/logger.ts';
import { formatFileSize } from '../../utils/formatters.ts';
import { generateId } from '../../utils/generateId.ts';
import {
  safeMkdir,
  safeWriteFile,
  safeReadFile,
  safeReaddir,
  safeStat,
} from '../../utils/safePath.ts';
import { AnalysisProcess } from '../../models/analysisProcess/index.ts';
import { teamService, type NewStructureItem } from '../teamService.ts';

import { analysisConfigService } from './AnalysisConfigService.ts';
import { AnalysisLifecycleService } from './AnalysisLifecycleService.ts';
import { AnalysisVersionService } from './AnalysisVersionService.ts';
import { AnalysisLogService } from './AnalysisLogService.ts';
import {
  AnalysisEnvironmentService,
  createAnalysisEnvironmentService,
} from './AnalysisEnvironmentService.ts';
import type {
  AnalysesConfig,
  AnalysisConfigEntry,
  GetAllAnalysesOptions,
  PaginatedAnalysesResponse,
  UploadedFile,
  UploadResult,
  RenameResult,
  LogsResult,
  InitialLogsResult,
  ClearLogsResult,
  RunAnalysisResult,
  StopAnalysisResult,
  DeleteAnalysisResult,
  UpdateAnalysisOptions,
  UpdateAnalysisResult,
  RollbackResult,
  DownloadLogsResult,
  EnvironmentVariables,
  UpdateEnvironmentResult,
  VerifyIntendedStateResult,
  GetVersionsOptions,
  LogTimeRange,
} from './types.ts';

const moduleLogger = createChildLogger('analysis-service');

/**
 * Main Analysis Service - Orchestrates all analysis operations
 *
 * Provides a unified API by delegating to specialized sub-services.
 * Maintains backward compatibility with the original monolithic service.
 */
class AnalysisService {
  private readonly configService: typeof analysisConfigService;
  private readonly lifecycleService: AnalysisLifecycleService;
  private readonly versionService: AnalysisVersionService;
  private readonly logService: AnalysisLogService;
  private readonly environmentService: AnalysisEnvironmentService;

  constructor() {
    // Use the singleton config service
    this.configService = analysisConfigService;

    // Create log service (depends on config service)
    this.logService = new AnalysisLogService(this.configService);

    // Create lifecycle service (depends on config and log services)
    this.lifecycleService = new AnalysisLifecycleService(
      this.configService,
      this.logService,
    );

    // Create version service (depends on config, log, and lifecycle services)
    this.versionService = new AnalysisVersionService({
      configService: this.configService,
      logService: this.logService,
      lifecycleService: this.lifecycleService,
    });

    // Create environment service (depends on config, log, and lifecycle services)
    this.environmentService = createAnalysisEnvironmentService({
      configService: this.configService,
      logService: this.logService,
      lifecycleService: this.lifecycleService,
    });

    // Wire up the environment service to lifecycle service (breaks circular dependency)
    this.lifecycleService.setEnvironmentService(this.environmentService);
  }

  // ==========================================================================
  // BACKWARD COMPATIBILITY ACCESSORS (for tests)
  // ==========================================================================

  /**
   * Get the analyses Map (for backward compatibility and testing).
   */
  get analyses(): Map<string, AnalysisProcess> {
    return this.configService.getAllAnalysisProcesses();
  }

  /**
   * Set the analyses Map (for backward compatibility and testing).
   */
  set analyses(map: Map<string, AnalysisProcess>) {
    this.configService.setAnalysesMap(map);
  }

  /**
   * Get the config cache (for backward compatibility and testing).
   */
  get configCache(): AnalysesConfig | null {
    return this.configService.getConfigCache();
  }

  /**
   * Set the config cache (for backward compatibility and testing).
   */
  set configCache(value: AnalysesConfig | null) {
    if (value === null) {
      this.configService.clearConfigCache();
    } else {
      this.configService.setConfigCache(value);
    }
  }

  /**
   * Get the startLocks Map (for backward compatibility and testing).
   */
  get startLocks(): Map<string, Promise<RunAnalysisResult>> {
    return this.lifecycleService.getStartLocks();
  }

  /**
   * Set the startLocks Map (for backward compatibility and testing).
   */
  set startLocks(_map: Map<string, Promise<RunAnalysisResult>>) {
    this.lifecycleService.resetStartLocks();
  }

  /**
   * Get the healthCheckInterval (for backward compatibility and testing).
   */
  get healthCheckInterval(): NodeJS.Timeout | null {
    return this.lifecycleService.getHealthCheckInterval();
  }

  /**
   * Get the metricsInterval (for backward compatibility and testing).
   */
  get metricsInterval(): NodeJS.Timeout | null {
    return this.lifecycleService.getMetricsInterval();
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the analysis service.
   * Loads configuration, discovers analyses, and starts health checks.
   */
  async initialize(): Promise<void> {
    await this.lifecycleService.initialize();
  }

  // ==========================================================================
  // CONFIG SERVICE DELEGATES
  // ==========================================================================

  async getConfig(): Promise<AnalysesConfig> {
    return this.configService.getConfig();
  }

  async loadConfig(): Promise<AnalysesConfig> {
    return this.configService.loadConfig();
  }

  async updateConfig(newConfig: AnalysesConfig): Promise<void> {
    // First update existing analyses in config service
    await this.configService.updateConfig(newConfig);

    // Then create new AnalysisProcess instances for any new config entries
    if (newConfig.analyses) {
      for (const [analysisId, analysisConfig] of Object.entries(
        newConfig.analyses,
      )) {
        if (!this.configService.hasAnalysis(analysisId)) {
          await this.lifecycleService.initializeAnalysis(
            analysisId,
            analysisConfig,
          );
        }
      }
    }
  }

  async saveConfig(): Promise<void> {
    return this.configService.saveConfig();
  }

  getAnalysisById(analysisId: string): AnalysisConfigEntry | undefined {
    return this.configService.getAnalysisById(analysisId);
  }

  getAnalysisByName(name: string): AnalysisConfigEntry | undefined {
    return this.configService.getAnalysisByName(name);
  }

  getAnalysisIdByName(name: string): string | undefined {
    return this.configService.getAnalysisIdByName(name);
  }

  getAnalysisProcess(analysisId: string): AnalysisProcess | undefined {
    return this.configService.getAnalysisProcess(analysisId);
  }

  getAllAnalysisProcesses(): Map<string, AnalysisProcess> {
    return this.configService.getAllAnalysisProcesses();
  }

  getRunningAnalysesCount(): number {
    return this.configService.getRunningAnalysesCount();
  }

  // ==========================================================================
  // LIFECYCLE SERVICE DELEGATES
  // ==========================================================================

  async runAnalysis(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<RunAnalysisResult> {
    return this.lifecycleService.runAnalysis(analysisId, logger);
  }

  async stopAnalysis(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<StopAnalysisResult> {
    return this.lifecycleService.stopAnalysis(analysisId, logger);
  }

  getProcessStatus(analysisId: string): AnalysisStatus {
    return this.lifecycleService.getProcessStatus(analysisId);
  }

  isStartInProgress(analysisId: string): boolean {
    return this.lifecycleService.isStartInProgress(analysisId);
  }

  getStartOperationsInProgress(): string[] {
    return this.lifecycleService.getStartOperationsInProgress();
  }

  async verifyIntendedState(): Promise<VerifyIntendedStateResult> {
    return this.lifecycleService.verifyIntendedState();
  }

  getAnalysesThatShouldBeRunning(): string[] {
    return this.lifecycleService.getAnalysesThatShouldBeRunning();
  }

  async waitForAnalysisConnection(
    analysis: AnalysisProcess,
    timeoutMs?: number,
  ): Promise<boolean> {
    return this.lifecycleService.waitForAnalysisConnection(analysis, timeoutMs);
  }

  startHealthCheck(): void {
    this.lifecycleService.startHealthCheck();
  }

  stopHealthCheck(): void {
    this.lifecycleService.stopHealthCheck();
  }

  startMetricsCollection(): void {
    this.lifecycleService.startMetricsCollection();
  }

  // ==========================================================================
  // LOG SERVICE DELEGATES
  // ==========================================================================

  validateTimeRange(timeRange: string): timeRange is LogTimeRange {
    return this.logService.validateTimeRange(timeRange);
  }

  async addLog(analysisId: string, message: string): Promise<void> {
    return this.logService.addLog(analysisId, message);
  }

  async getInitialLogs(
    analysisId: string,
    limit?: number,
  ): Promise<InitialLogsResult> {
    return this.logService.getInitialLogs(analysisId, limit);
  }

  async getLogs(
    analysisId: string,
    page?: number,
    limit?: number,
    logger?: Logger,
  ): Promise<LogsResult> {
    return this.logService.getLogs(analysisId, page, limit, logger);
  }

  async clearLogs(
    analysisId: string,
    options?: { broadcast?: boolean; logger?: Logger },
  ): Promise<ClearLogsResult> {
    return this.logService.clearLogs(analysisId, options);
  }

  async getLogsForDownload(
    analysisId: string,
    timeRange: LogTimeRange,
    logger?: Logger,
  ): Promise<DownloadLogsResult> {
    return this.logService.getLogsForDownload(analysisId, timeRange, logger);
  }

  // ==========================================================================
  // VERSION SERVICE DELEGATES
  // ==========================================================================

  async initializeVersionManagement(analysisId: string): Promise<void> {
    return this.versionService.initializeVersionManagement(analysisId);
  }

  async saveVersion(analysisId: string): Promise<number | null> {
    return this.versionService.saveVersion(analysisId);
  }

  async getVersions(
    analysisId: string,
    options?: GetVersionsOptions,
  ): Promise<AnalysisVersionsResponse> {
    return this.versionService.getVersions(analysisId, options);
  }

  async rollbackToVersion(
    analysisId: string,
    version: number,
    logger?: Logger,
  ): Promise<RollbackResult> {
    return this.versionService.rollbackToVersion(analysisId, version, logger);
  }

  async getVersionContent(
    analysisId: string,
    version: number,
    logger?: Logger,
  ): Promise<string> {
    return this.versionService.getVersionContent(analysisId, version, logger);
  }

  // ==========================================================================
  // ENVIRONMENT SERVICE DELEGATES
  // ==========================================================================

  async getEnvironment(
    analysisId: string,
    logger?: Logger,
  ): Promise<EnvironmentVariables> {
    return this.environmentService.getEnvironment(analysisId, logger);
  }

  async updateEnvironment(
    analysisId: string,
    env: EnvironmentVariables,
    logger?: Logger,
  ): Promise<UpdateEnvironmentResult> {
    return this.environmentService.updateEnvironment(analysisId, env, logger);
  }

  // ==========================================================================
  // FILE OPERATIONS (inline - could be extracted to AnalysisFileService)
  // ==========================================================================

  /**
   * Create analysis directories using analysisId (UUID)
   */
  async createAnalysisDirectories(analysisId: string): Promise<string> {
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

  /**
   * Upload a new analysis file
   */
  async uploadAnalysis(
    file: UploadedFile,
    targetDepartment: string | null = null,
    targetFolderId: string | null = null,
    logger: Logger = moduleLogger,
  ): Promise<UploadResult> {
    const analysisName = path.parse(file.name).name;
    const analysisId = generateId();

    const basePath = await this.createAnalysisDirectories(analysisId);
    const filePath = path.join(basePath, 'index.js');

    await file.mv(filePath);
    const analysis = new AnalysisProcess(analysisId, analysisName, this);

    let teamId = targetDepartment;
    if (!teamId || !teamId.trim()) {
      const teams = await teamService.getAllTeams();
      const uncategorizedTeam = teams.find((t) => t.name === 'Uncategorized');
      teamId = uncategorizedTeam?.id || 'uncategorized';
    }

    analysis.teamId = teamId;
    this.configService.setAnalysis(analysisId, analysis);

    const envFile = path.join(basePath, 'env', '.env');
    await safeWriteFile(envFile, '', config.paths.analysis);

    await this.configService.saveConfig();

    const configCache = await this.configService.getConfig();
    if (!configCache.teamStructure) {
      configCache.teamStructure = {};
    }

    if (!configCache.teamStructure[teamId]) {
      configCache.teamStructure[teamId] = { items: [] };
    }

    const newItem: NewStructureItem = {
      id: analysisId,
      type: 'analysis',
    };

    await teamService.addItemToTeamStructure(teamId, newItem, targetFolderId);
    await this.versionService.initializeVersionManagement(analysisId);

    logger.info(
      { analysisId, analysisName, teamId, targetFolderId },
      'Analysis uploaded successfully',
    );

    return { analysisId, analysisName };
  }

  /**
   * Get all analyses with optional filtering and pagination
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
          const analysis = this.configService.getAnalysisProcess(analysisId);

          if (
            allowedTeamIds !== null &&
            !allowedTeamIds.includes(analysis?.teamId || '')
          ) {
            return null;
          }

          if (teamId !== null && analysis?.teamId !== teamId) {
            return null;
          }

          if (status !== null && (analysis?.status || 'stopped') !== status) {
            return null;
          }

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

    const filteredResults = results.filter((r): r is Analysis => r !== null);

    if (page !== null && limit !== null) {
      const total = filteredResults.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const paginatedResults = filteredResults.slice(
        startIndex,
        startIndex + limit,
      );

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

    const analysesObj: AnalysesMap = {};
    filteredResults.forEach((analysis) => {
      analysesObj[analysis.id] = analysis;
    });
    return analysesObj;
  }

  /**
   * Rename an analysis (only changes the name property, not the directory)
   */
  async renameAnalysis(
    analysisId: string,
    newName: string,
    logger: Logger = moduleLogger,
  ): Promise<RenameResult> {
    try {
      const analysis = this.configService.getAnalysisProcess(analysisId);

      if (!analysis) {
        throw new Error(`Analysis '${analysisId}' not found`);
      }

      const oldName = analysis.analysisName;
      const wasRunning = analysis && analysis.status === 'running';

      if (wasRunning) {
        await this.lifecycleService.stopAnalysis(analysisId);
        await this.logService.addLog(
          analysisId,
          'Stopping analysis for rename operation',
        );
      }

      analysis.analysisName = newName;

      await this.logService.addLog(
        analysisId,
        `Analysis renamed from '${oldName}' to '${newName}'`,
      );

      await this.configService.saveConfig();

      if (wasRunning) {
        await this.lifecycleService.runAnalysis(analysisId);
        await this.logService.addLog(
          analysisId,
          'Analysis restarted after rename operation',
        );
      }

      return { success: true, restarted: wasRunning, oldName, newName };
    } catch (error) {
      logger.error({ error, analysisId, newName }, 'Error renaming analysis');
      throw error;
    }
  }

  /**
   * Get the content of an analysis file
   */
  async getAnalysisContent(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<string> {
    try {
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
   * Update an analysis (content and/or team assignment)
   */
  async updateAnalysis(
    analysisId: string,
    updates: UpdateAnalysisOptions,
    logger: Logger = moduleLogger,
  ): Promise<UpdateAnalysisResult> {
    try {
      const analysis = this.configService.getAnalysisProcess(analysisId);

      if (!analysis) {
        throw new Error(`Analysis ${analysisId} not found`);
      }

      if (updates.teamId) {
        const team = await teamService.getTeam(updates.teamId);
        if (!team) {
          throw new Error(`Team ${updates.teamId} not found`);
        }
      }

      const wasRunning = analysis && analysis.status === 'running';
      let savedVersion: number | null = null;

      if (wasRunning && updates.content) {
        await this.lifecycleService.stopAnalysis(analysisId);
        await this.logService.addLog(
          analysisId,
          'Analysis stopped to update content',
        );
      }

      if (updates.content) {
        savedVersion = await this.versionService.saveVersion(analysisId);
        const filePath = path.join(
          config.paths.analysis,
          analysisId,
          'index.js',
        );
        await safeWriteFile(filePath, updates.content, config.paths.analysis);

        if (savedVersion === null) {
          const metadata = await this.versionService.getVersions(analysisId);
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
                const metadataPath = path.join(
                  config.paths.analysis,
                  analysisId,
                  'versions',
                  'metadata.json',
                );
                const updatedMetadata = {
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

      Object.assign(analysis, updates);
      await this.configService.saveConfig();

      if (wasRunning && updates.content) {
        await this.lifecycleService.runAnalysis(analysisId);
        const logMessage =
          savedVersion !== null
            ? `Analysis updated successfully (previous version saved as v${savedVersion})`
            : 'Analysis updated successfully (no version saved - content unchanged)';
        await this.logService.addLog(analysisId, logMessage);
      }

      return {
        success: true,
        restarted: wasRunning && !!updates.content,
        savedVersion,
      };
    } catch (error) {
      logger.error({ error, analysisId, updates }, 'Error updating analysis');
      throw new Error(`Failed to update analysis: ${(error as Error).message}`);
    }
  }

  /**
   * Delete an analysis and all its data
   */
  async deleteAnalysis(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<DeleteAnalysisResult> {
    const analysis = this.configService.getAnalysisProcess(analysisId);
    const teamId = analysis?.teamId;
    const analysisName = analysis?.analysisName;

    if (analysis) {
      await analysis.stop();
      await analysis.cleanup();
    }

    const analysisPath = path.join(config.paths.analysis, analysisId);
    try {
      await fs.rm(analysisPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    this.configService.deleteAnalysisFromMap(analysisId);

    if (teamId) {
      const configData = await this.configService.getConfig();

      if (configData.teamStructure?.[teamId]) {
        const removeFromArray = (items: NewStructureItem[]): boolean => {
          for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
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
        this.configService.setConfigCache(configData);
      }
    }

    await this.configService.saveConfig();

    logger.info(
      { analysisId, analysisName, teamId },
      'Analysis deleted successfully',
    );

    return { message: 'Analysis and all versions deleted successfully' };
  }
}

export { AnalysisService };

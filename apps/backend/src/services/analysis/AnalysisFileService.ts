/**
 * Analysis File Service
 *
 * Manages file operations for analyses including uploading, deleting,
 * renaming, updating, and retrieving analysis content.
 *
 * This service is responsible for:
 * - Creating analysis directory structures
 * - Uploading new analyses
 * - Deleting analyses and their associated files
 * - Renaming analyses (name only, not directory)
 * - Updating analysis content
 * - Retrieving analysis content
 * - Getting paginated lists of all analyses
 *
 * @module analysis/AnalysisFileService
 */
import path from 'path';
import { promises as fs } from 'fs';
import type { Logger } from 'pino';
import type { Analysis, AnalysesMap } from '@tago-analysis-worker/types/domain';

import { config } from '../../config/default.ts';
import {
  AnalysisProcess,
  type AnalysisServiceInterface,
} from '../../models/analysisProcess/index.ts';
import { formatFileSize } from '../../utils/formatters.ts';
import { generateId } from '../../utils/generateId.ts';
import { createChildLogger } from '../../utils/logging/logger.ts';
import {
  safeMkdir,
  safeReadFile,
  safeWriteFile,
  safeReaddir,
  safeStat,
} from '../../utils/safePath.ts';
import { teamService, type NewStructureItem } from '../teamService.ts';

import type {
  DeleteAnalysisResult,
  GetAllAnalysesOptions,
  IAnalysisConfigService,
  IAnalysisEnvironmentService,
  IAnalysisLifecycleService,
  IAnalysisLogService,
  IAnalysisVersionService,
  PaginatedAnalysesResponse,
  RenameResult,
  UpdateAnalysisOptions,
  UpdateAnalysisResult,
  UploadedFile,
  UploadResult,
  VersionMetadata,
} from './types.ts';

const moduleLogger = createChildLogger('analysis-file-service');

/**
 * Dependencies required by the AnalysisFileService.
 */
type AnalysisFileServiceDependencies = {
  readonly configService: IAnalysisConfigService;
  readonly lifecycleService: IAnalysisLifecycleService;
  readonly versionService: IAnalysisVersionService;
  readonly logService: IAnalysisLogService;
  readonly environmentService: IAnalysisEnvironmentService;
};

/**
 * Service for managing analysis file operations.
 *
 * Handles CRUD operations on analysis files and directories.
 */
export class AnalysisFileService {
  private readonly configService: IAnalysisConfigService;
  private readonly lifecycleService: IAnalysisLifecycleService;
  private readonly versionService: IAnalysisVersionService;
  private readonly logService: IAnalysisLogService;
  private readonly environmentService: IAnalysisEnvironmentService;

  constructor(deps: AnalysisFileServiceDependencies) {
    this.configService = deps.configService;
    this.lifecycleService = deps.lifecycleService;
    this.versionService = deps.versionService;
    this.logService = deps.logService;
    this.environmentService = deps.environmentService;
  }

  /**
   * Create a service adapter for AnalysisProcess.
   * Combines environment lookup with config saving.
   */
  private createServiceAdapter(): AnalysisServiceInterface {
    return {
      getEnvironment: (analysisId: string) =>
        this.environmentService.getEnvironment(analysisId),
      saveConfig: () => this.configService.saveConfig(),
    };
  }

  /**
   * Create analysis directories.
   *
   * Creates the base directory and subdirectories for env, logs, and versions.
   *
   * @param analysisId - The UUID of the analysis
   * @returns The path to the created analysis directory
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
   * Upload a new analysis.
   *
   * Creates the analysis directory structure, moves the uploaded file,
   * creates an AnalysisProcess instance, and adds it to the team structure.
   *
   * @param file - The uploaded file
   * @param teamId - Optional team ID (defaults to Uncategorized)
   * @param folderId - Optional folder ID within the team
   * @param logger - Optional logger instance
   * @returns The analysis ID and name
   */
  async uploadAnalysis(
    file: UploadedFile,
    teamId: string | null = null,
    folderId: string | null = null,
    logger: Logger = moduleLogger,
  ): Promise<UploadResult> {
    const analysisName = path.parse(file.name).name;
    const analysisId = generateId();

    const basePath = await this.createAnalysisDirectories(analysisId);
    const filePath = path.join(basePath, 'index.js');

    await file.mv(filePath);

    const analysis = new AnalysisProcess(
      analysisId,
      analysisName,
      this.createServiceAdapter(),
    );

    // Determine team ID - use provided or default to Uncategorized
    let resolvedTeamId = teamId;
    if (!resolvedTeamId || !resolvedTeamId.trim()) {
      const teams = await teamService.getAllTeams();
      const uncategorizedTeam = teams.find((t) => t.name === 'Uncategorized');
      resolvedTeamId = uncategorizedTeam?.id || 'uncategorized';
    }

    analysis.teamId = resolvedTeamId;

    this.configService.setAnalysis(analysisId, analysis);

    // Create empty environment file
    const envFile = path.join(basePath, 'env', '.env');
    await safeWriteFile(envFile, '', config.paths.analysis);

    await this.configService.saveConfig();

    // Update team structure
    const configData = await this.configService.getConfig();

    if (!configData.teamStructure) {
      configData.teamStructure = {};
    }

    if (!configData.teamStructure[resolvedTeamId]) {
      configData.teamStructure[resolvedTeamId] = { items: [] };
    }

    const newItem: NewStructureItem = {
      id: analysisId,
      type: 'analysis',
    };

    await teamService.addItemToTeamStructure(resolvedTeamId, newItem, folderId);

    // Initialize version management
    await this.versionService.initializeVersionManagement(analysisId);

    logger.info(
      {
        analysisId,
        analysisName,
        teamId: resolvedTeamId,
        targetFolderId: folderId,
      },
      'Analysis uploaded successfully',
    );

    return { analysisId, analysisName };
  }

  /**
   * Delete an analysis.
   *
   * Stops the analysis if running, removes files, cleans up from config,
   * and removes from team structure.
   *
   * @param analysisId - The analysis ID to delete
   * @param logger - Optional logger instance
   * @returns Deletion confirmation message
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

    // Delete the analysis directory
    const analysisPath = path.join(config.paths.analysis, analysisId);
    try {
      await fs.rm(analysisPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Remove from in-memory map
    this.configService.deleteAnalysisFromMap(analysisId);

    // Remove from team structure before saving config
    if (teamId) {
      const configData = await this.configService.getConfig();

      if (configData.teamStructure?.[teamId]) {
        this.removeAnalysisFromTeamStructure(
          configData.teamStructure[teamId].items,
          analysisId,
        );
        // Update config cache with modified team structure
        await this.configService.updateConfig(configData);
      }
    }

    await this.configService.saveConfig();

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

  /**
   * Remove an analysis from team structure items recursively.
   */
  private removeAnalysisFromTeamStructure(
    items: NewStructureItem[],
    analysisId: string,
  ): boolean {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.type === 'analysis' && item.id === analysisId) {
        items.splice(i, 1);
        return true;
      }
      if (item.type === 'folder' && item.items) {
        if (this.removeAnalysisFromTeamStructure(item.items, analysisId)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Rename an analysis.
   *
   * Updates the analysis name property. The directory remains unchanged
   * since directories are named by UUID.
   *
   * @param analysisId - The analysis ID to rename
   * @param newName - The new display name
   * @param logger - Optional logger instance
   * @returns Rename operation result
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
      const wasRunning = analysis.status === 'running';

      // Stop the analysis if running
      if (wasRunning) {
        await this.lifecycleService.stopAnalysis(analysisId);
        await this.logService.addLog(
          analysisId,
          'Stopping analysis for rename operation',
        );
      }

      // Update the name property
      analysis.analysisName = newName;

      await this.logService.addLog(
        analysisId,
        `Analysis renamed from '${oldName}' to '${newName}'`,
      );

      await this.configService.saveConfig();

      // Restart if it was running
      if (wasRunning) {
        await this.lifecycleService.runAnalysis(analysisId);
        await this.logService.addLog(
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

  /**
   * Update an analysis.
   *
   * Updates analysis content and/or properties. If content is updated,
   * the analysis is stopped, the current version is saved, and then restarted.
   *
   * @param analysisId - The analysis ID to update
   * @param updates - The updates to apply (content, teamId, etc.)
   * @param logger - Optional logger instance
   * @returns Update operation result
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

      // Validate team if being updated
      if (updates.teamId) {
        const team = await teamService.getTeam(updates.teamId);
        if (!team) {
          throw new Error(`Team ${updates.teamId} not found`);
        }
      }

      const wasRunning = analysis.status === 'running';
      let savedVersion: number | null = null;

      // Stop and save version if content is being updated
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

        // Update currentVersion in metadata if content matches existing version
        await this.updateCurrentVersionIfMatches(analysisId, updates.content);
      }

      // Update analysis properties
      Object.assign(analysis, updates);
      await this.configService.saveConfig();

      // Restart if it was running and content was updated
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
   * Update the currentVersion in metadata if new content matches an existing version.
   */
  private async updateCurrentVersionIfMatches(
    analysisId: string,
    newContent: string,
  ): Promise<void> {
    const versionsDir = path.join(
      config.paths.analysis,
      analysisId,
      'versions',
    );
    const metadataPath = path.join(versionsDir, 'metadata.json');

    try {
      const metadataContent = (await safeReadFile(
        metadataPath,
        config.paths.analysis,
        { encoding: 'utf8' },
      )) as string;
      const metadata: VersionMetadata = JSON.parse(metadataContent);

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

          if (newContent === versionContent) {
            metadata.currentVersion = version.version;
            await safeWriteFile(
              metadataPath,
              JSON.stringify(metadata, null, 2),
              config.paths.analysis,
            );
            break;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Metadata file might not exist yet, which is fine
    }
  }

  /**
   * Get analysis content.
   *
   * @param analysisId - The analysis ID
   * @param logger - Optional logger instance
   * @returns The analysis file content
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
   * Get all analyses with optional filtering and pagination.
   *
   * @param options - Filtering and pagination options
   * @returns Analyses map or paginated response
   */
  async getAllAnalyses(
    options: GetAllAnalysesOptions = {},
  ): Promise<AnalysesMap | PaginatedAnalysesResponse> {
    const {
      allowedTeamIds = null,
      search = '',
      id = null,
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
          if (id !== null && analysisId !== id) {
            return null;
          }

          const analysis = this.configService.getAnalysisProcess(analysisId);

          // Apply filters
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
            intendedState: analysis?.intendedState || 'stopped',
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

    // Return paginated format if pagination is requested
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

    // Return as object keyed by analysisId
    const analysesObj: AnalysesMap = {};
    filteredResults.forEach((analysis) => {
      analysesObj[analysis.id] = analysis;
    });
    return analysesObj;
  }
}

/**
 * Factory function to create an AnalysisFileService instance.
 */
export function createAnalysisFileService(
  deps: AnalysisFileServiceDependencies,
): AnalysisFileService {
  return new AnalysisFileService(deps);
}

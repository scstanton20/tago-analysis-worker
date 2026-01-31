/**
 * Analysis Version Service
 *
 * Handles version management for analyses including saving, retrieving,
 * and rolling back to previous versions.
 *
 * @module analysis/AnalysisVersionService
 */
import path from 'path';
import { promises as fs } from 'fs';
import type { Logger } from 'pino';
import type { AnalysisVersionsResponse } from '@tago-analysis-worker/types/domain';
import { config } from '../../config/default.ts';
import { ANALYSIS_SERVICE } from '../../constants.ts';
import { createChildLogger } from '../../utils/logging/logger.ts';
import {
  safeMkdir,
  safeWriteFile,
  safeReadFile,
} from '../../utils/safePath.ts';
import type {
  IAnalysisConfigService,
  IAnalysisLogServiceWithClear,
  IAnalysisLifecycleService,
  VersionMetadata,
  RollbackResult,
  GetVersionsOptions,
} from './types.ts';

const moduleLogger = createChildLogger('analysis-version-service');

/** Default page size for version listing */
const DEFAULT_VERSION_PAGE_SIZE = 10;

/**
 * Service for managing analysis version history.
 *
 * Provides functionality to save, retrieve, and rollback analysis versions.
 * Each analysis maintains its own version history in a versions/ subdirectory.
 */
export class AnalysisVersionService {
  private readonly configService: IAnalysisConfigService;
  private readonly logService: IAnalysisLogServiceWithClear;
  private readonly lifecycleService: IAnalysisLifecycleService;

  constructor(deps: {
    configService: IAnalysisConfigService;
    logService: IAnalysisLogServiceWithClear;
    lifecycleService: IAnalysisLifecycleService;
  }) {
    this.configService = deps.configService;
    this.logService = deps.logService;
    this.lifecycleService = deps.lifecycleService;
  }

  /**
   * Initialize version management for a new analysis.
   *
   * Creates the versions directory and saves the initial uploaded content as v1.
   * This should be called when an analysis is first uploaded.
   */
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

    await safeMkdir(versionsDir, config.paths.analysis, { recursive: true });

    const uploadedContent = (await safeReadFile(
      currentFilePath,
      config.paths.analysis,
      { encoding: 'utf8' },
    )) as string;
    const v1Path = path.join(versionsDir, 'v1.js');
    await safeWriteFile(v1Path, uploadedContent, config.paths.analysis);

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
   * Save the current analysis content as a new version.
   *
   * Only saves if the current content differs from all existing versions.
   *
   * @returns The new version number, or null if content was unchanged
   */
  async saveVersion(analysisId: string): Promise<number | null> {
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

    await safeMkdir(versionsDir, config.paths.analysis, { recursive: true });

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

      if (metadata.currentVersion === undefined) {
        metadata.currentVersion =
          metadata.versions.length > 0
            ? metadata.versions[metadata.versions.length - 1].version
            : 1;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        isFirstVersionSave = true;
      } else {
        throw error;
      }
    }

    const currentContent = (await safeReadFile(
      currentFilePath,
      config.paths.analysis,
      { encoding: 'utf8' },
    )) as string;

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
          return null;
        }
      } catch {
        continue;
      }
    }

    const newVersionNumber = isFirstVersionSave
      ? 1
      : metadata.nextVersionNumber;
    const versionFilePath = path.join(versionsDir, `v${newVersionNumber}.js`);
    await safeWriteFile(versionFilePath, currentContent, config.paths.analysis);

    metadata.versions.push({
      version: newVersionNumber,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(currentContent, 'utf8'),
    });

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

  /**
   * Get paginated list of versions for an analysis.
   *
   * Returns versions sorted by version number descending (newest first).
   */
  async getVersions(
    analysisId: string,
    options: GetVersionsOptions = {},
  ): Promise<AnalysisVersionsResponse> {
    const {
      page = 1,
      limit = DEFAULT_VERSION_PAGE_SIZE,
      logger = moduleLogger,
    } = options;

    logger.debug(
      { action: 'getVersions', analysisId, page, limit },
      'Getting versions',
    );

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

      if (metadata.currentVersion === undefined) {
        metadata.currentVersion = metadata.nextVersionNumber - 1;
      }

      try {
        const currentContent = (await safeReadFile(
          currentFilePath,
          config.paths.analysis,
          { encoding: 'utf8' },
        )) as string;
        let currentContentMatchesVersion = false;

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
              metadata.currentVersion = version.version;
              currentContentMatchesVersion = true;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!currentContentMatchesVersion) {
          metadata.currentVersion = metadata.nextVersionNumber;
        }
      } catch {
        // Fall back to metadata currentVersion if current file cannot be read
      }

      const sortedVersions = [...metadata.versions].sort(
        (a, b) => b.version - a.version,
      );

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

  /**
   * Rollback an analysis to a previous version.
   *
   * Saves the current content as a new version before rolling back,
   * clears logs, and restarts the analysis if it was running.
   */
  async rollbackToVersion(
    analysisId: string,
    version: number,
    logger: Logger = moduleLogger,
  ): Promise<RollbackResult> {
    logger.debug(
      { action: 'rollbackToVersion', analysisId, version },
      'Rolling back to version',
    );

    const analysis = this.configService.getAnalysisProcess(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

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

    try {
      await fs.access(versionFilePath);
    } catch {
      throw new Error(`Version ${version} not found`);
    }

    const wasRunning = analysis.status === 'running';

    if (wasRunning) {
      await this.lifecycleService.stopAnalysis(analysisId);
      await this.logService.addLog(
        analysisId,
        `Analysis stopped to rollback to version ${version}`,
      );
    }

    await this.saveVersion(analysisId);

    const versionContent = (await safeReadFile(
      versionFilePath,
      config.paths.analysis,
      { encoding: 'utf8' },
    )) as string;
    await safeWriteFile(currentFilePath, versionContent, config.paths.analysis);

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

    await this.logService.clearLogs(analysisId, { broadcast: false });
    await this.logService.addLog(
      analysisId,
      `Rolled back to version ${version}`,
    );

    if (wasRunning) {
      await this.lifecycleService.runAnalysis(analysisId);
      await new Promise((resolve) =>
        setTimeout(resolve, ANALYSIS_SERVICE.SMALL_DELAY_MS),
      );
      await this.logService.addLog(
        analysisId,
        'Analysis restarted after rollback',
      );
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
      version,
    };
  }

  /**
   * Get the content of a specific version.
   *
   * @param version - Version number to retrieve, or 0 for current content
   */
  async getVersionContent(
    analysisId: string,
    version: number,
    logger: Logger = moduleLogger,
  ): Promise<string> {
    logger.debug(
      { action: 'getVersionContent', analysisId, version },
      'Getting version content',
    );

    if (version === 0) {
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
}

/**
 * Factory function to create an AnalysisVersionService instance.
 */
export function createAnalysisVersionService(deps: {
  configService: IAnalysisConfigService;
  logService: IAnalysisLogServiceWithClear;
  lifecycleService: IAnalysisLifecycleService;
}): AnalysisVersionService {
  return new AnalysisVersionService(deps);
}

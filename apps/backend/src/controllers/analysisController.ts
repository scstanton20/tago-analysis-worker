import type { Response } from 'express';
import type {
  AnalysisStatus,
  RenameAnalysisRequest,
  UpdateEnvironmentRequest,
  RollbackVersionRequest,
  UpdateAnalysisNotesRequest,
  GetLogsQuery,
} from '@tago-analysis-worker/types';
import type {
  RequestWithLogger,
  AuthenticatedRequest,
} from '../types/index.ts';
import path from 'path';
import { promises as fs } from 'fs';
import sanitize from 'sanitize-filename';
import archiver from 'archiver';
import {
  analysisService,
  broadcastAnalysisCreated,
  broadcastAnalysisDeleted,
  broadcastAnalysisRenamed,
  broadcastAnalysisUpdated,
  broadcastAnalysisRolledBack,
  broadcastAnalysisEnvironmentUpdated,
  broadcastAnalysisNotesUpdated,
  broadcastTeamStructureUpdate,
} from '../services/analysis/index.ts';
import { analysisInfoService } from '../services/analysisInfoService.ts';
import { config } from '../config/default.ts';
import { FILE_SIZE } from '../constants.ts';
import {
  sanitizeAndValidateFilename,
  isValidFilename,
  FILENAME_ERROR_MESSAGE,
} from '../validation/shared.ts';
import { formatCompactTime } from '../utils/serverTime.ts';
import { getTeamPermissionHelpers } from '../utils/lazyLoader.ts';

/** Uploaded file from express-fileupload (minimal type we need) */
type UploadedFileMinimal = {
  readonly name: string;
  readonly size: number;
  readonly data: Buffer;
  mv: (path: string) => Promise<void>;
};

/** Upload analysis request - uses type intersection to override files property */
type UploadAnalysisRequest = Omit<RequestWithLogger, 'files'> & {
  files?: {
    analysis?: UploadedFileMinimal;
  };
  body: {
    teamId: string;
    targetFolderId?: string;
  };
};

/** Get analyses query params (backend-specific, string values) */
type GetAnalysesQuery = {
  readonly search?: string;
  readonly teamId?: string;
  readonly status?: string;
  readonly page?: string;
  readonly limit?: string;
};

/** Update analysis body */
type UpdateAnalysisBody = {
  readonly content: string;
};

// Type aliases for request body types
type RenameAnalysisBody = RenameAnalysisRequest;
type RollbackBody = RollbackVersionRequest;
type UpdateEnvironmentBody = UpdateEnvironmentRequest;
type UpdateNotesBody = UpdateAnalysisNotesRequest;

/**
 * Controller class for managing analysis operations
 * Handles HTTP requests for analysis file management, execution control, versioning,
 * environment configuration, and log management. Uses SSE for real-time updates.
 *
 * All methods are static and follow Express route handler pattern (req, res).
 * Request-scoped logging is available via req.log.
 */
export class AnalysisController {
  /**
   * Upload a new analysis file
   * Creates analysis directory structure, saves file, and assigns to team/folder
   */
  static async uploadAnalysis(
    req: UploadAnalysisRequest,
    res: Response,
  ): Promise<void> {
    if (!req.files || !req.files.analysis) {
      req.log.warn(
        { action: 'uploadAnalysis' },
        'Upload failed: no file provided',
      );
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const analysis = req.files.analysis;

    // Check file size (50MB limit)
    if (analysis.size > FILE_SIZE.MEGABYTES_50) {
      req.log.warn(
        {
          action: 'uploadAnalysis',
          fileName: analysis.name,
          fileSize: analysis.size,
          maxSize: FILE_SIZE.MEGABYTES_50,
        },
        'Upload failed: file size exceeds limit',
      );
      res.status(413).json({
        error: 'File size exceeds the maximum limit of 50MB',
        maxSizeMB: 50,
        fileSizeMB: (
          analysis.size /
          FILE_SIZE.KILOBYTES /
          FILE_SIZE.KILOBYTES
        ).toFixed(2),
      });
      return;
    }

    // Validate filename against shared regex (consistent with other operations)
    const analysisName = path.parse(analysis.name).name;
    if (!isValidFilename(analysisName)) {
      req.log.warn(
        {
          action: 'uploadAnalysis',
          fileName: analysis.name,
          analysisName,
        },
        'Upload failed: invalid filename',
      );
      res.status(400).json({
        error: FILENAME_ERROR_MESSAGE,
        fileName: analysis.name,
      });
      return;
    }

    const teamId = req.body.teamId;
    const targetFolderId = req.body.targetFolderId || null;

    req.log.debug(
      {
        action: 'uploadAnalysis',
        fileName: analysis.name,
        teamId,
        targetFolderId,
      },
      'Uploading analysis',
    );

    const result = await analysisService.uploadAnalysis(
      analysis as unknown as { name: string; mv(path: string): Promise<void> },
      teamId,
      targetFolderId,
    );

    req.log.info(
      {
        action: 'uploadAnalysis',
        analysisId: result.analysisId,
        analysisName: result.analysisName,
        teamId,
      },
      'Analysis uploaded',
    );

    // Get the complete analysis data to broadcast
    const createdAnalysis = analysisService.getAnalysisById(result.analysisId);

    // Broadcast analysis creation to team users only
    await broadcastAnalysisCreated(
      result.analysisId,
      result.analysisName,
      teamId,
      createdAnalysis,
    );

    // Broadcast team structure update
    await broadcastTeamStructureUpdate(teamId);

    res.json(result);
  }

  /**
   * Retrieve analyses with permission-based filtering
   * Admin users see all analyses; regular users only see analyses from teams
   * they have 'view_analyses' permission for
   */
  static async getAnalyses(
    req: AuthenticatedRequest & { query: GetAnalysesQuery },
    res: Response,
  ): Promise<void> {
    // Extract query parameters for filtering
    const { search, teamId, status, page, limit } = req.query;

    req.log.debug(
      {
        action: 'getAnalyses',
        userId: req.user.id,
        role: req.user.role,
        filters: { search, teamId, status, page, limit },
      },
      'Retrieving analyses',
    );

    // Build filter options
    const filterOptions = {
      search: search || '',
      teamId: teamId || undefined,
      status: (status as AnalysisStatus) || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };

    // Get analyses filtered at service layer for security
    let result: unknown;

    if (req.user.role === 'admin') {
      // Admin users see all analyses - no team filter
      result = await analysisService.getAllAnalyses(filterOptions);
      const count = filterOptions.page
        ? Object.keys((result as { analyses: object }).analyses).length
        : Object.keys(result as object).length;
      req.log.info(
        { action: 'getAnalyses', count },
        'All analyses retrieved (admin)',
      );
    } else {
      // Get user's allowed team IDs for view_analyses permission
      const { getUserTeamIds } = await getTeamPermissionHelpers();

      const allowedTeamIds = getUserTeamIds(req.user.id, 'view_analyses');

      // Service filters by team ID before loading file stats (prevents timing attacks)
      result = await analysisService.getAllAnalyses({
        ...filterOptions,
        allowedTeamIds,
      });

      const count = filterOptions.page
        ? Object.keys((result as { analyses: object }).analyses).length
        : Object.keys(result as object).length;
      req.log.info(
        { action: 'getAnalyses', count },
        'Filtered analyses retrieved',
      );
    }

    res.json(result);
  }

  /**
   * Start an analysis process
   * Launches the analysis script as a child process and monitors its execution
   */
  static async runAnalysis(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.info({ action: 'runAnalysis', analysisId }, 'Running analysis');

    const result = await analysisService.runAnalysis(analysisId);

    req.log.info({ action: 'runAnalysis', analysisId }, 'Analysis started');

    res.json(result);
  }

  /**
   * Stop a running analysis process
   * Terminates the child process and updates analysis status
   */
  static async stopAnalysis(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.info({ action: 'stopAnalysis', analysisId }, 'Stopping analysis');

    const result = await analysisService.stopAnalysis(analysisId);

    req.log.info({ action: 'stopAnalysis', analysisId }, 'Analysis stopped');

    res.json(result);
  }

  /**
   * Delete an analysis and all its associated files
   * Removes analysis directory, configuration entries, and team structure references
   */
  static async deleteAnalysis(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.info({ action: 'deleteAnalysis', analysisId }, 'Deleting analysis');

    // Get analysis data before deletion for broadcast
    const analysisToDelete = analysisService.getAnalysisById(analysisId);
    const teamId = analysisToDelete?.teamId;
    const analysisName = analysisToDelete?.name;

    await analysisService.deleteAnalysis(analysisId);

    req.log.info(
      {
        action: 'deleteAnalysis',
        analysisId,
        analysisName,
        teamId,
      },
      'Analysis deleted',
    );

    // Broadcast deletion with analysis data
    await broadcastAnalysisDeleted(
      analysisId,
      analysisName || '',
      teamId || '',
    );

    // Broadcast team structure update
    if (teamId) {
      await broadcastTeamStructureUpdate(teamId);
    }

    res.json({ success: true });
  }

  /**
   * Retrieve analysis file content
   * Returns current content or content from a specific version
   */
  static async getAnalysisContent(
    req: RequestWithLogger & {
      params: { analysisId: string };
      query: { version?: string };
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { version } = req.query;

    req.log.debug(
      { action: 'getAnalysisContent', analysisId, version },
      'Getting analysis content',
    );

    let content: string;

    if (version !== undefined) {
      // Get version-specific content
      const versionNumber = parseInt(version, 10);
      if (isNaN(versionNumber) || versionNumber < 0) {
        req.log.warn(
          {
            action: 'getAnalysisContent',
            analysisId,
            version,
          },
          'Invalid version number',
        );
        res.status(400).json({ error: 'Invalid version number' });
        return;
      }
      content = await analysisService.getVersionContent(
        analysisId,
        versionNumber,
      );
    } else {
      // Get current content
      content = await analysisService.getAnalysisContent(analysisId);
    }

    req.log.debug(
      { action: 'getAnalysisContent', analysisId, version },
      'Analysis content retrieved',
    );

    res.set('Content-Type', 'text/plain');
    res.send(content);
  }

  /**
   * Update analysis file content
   * Saves new content, creates a version backup, and restarts if running
   */
  static async updateAnalysis(
    req: RequestWithLogger & {
      params: { analysisId: string };
      body: UpdateAnalysisBody;
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { content } = req.body;

    req.log.debug(
      { action: 'updateAnalysis', analysisId },
      'Updating analysis',
    );

    const result = await analysisService.updateAnalysis(analysisId, {
      content,
    });

    req.log.info(
      {
        action: 'updateAnalysis',
        analysisId,
        restarted: result.restarted,
      },
      'Analysis updated',
    );

    // Get updated analysis data
    const updatedAnalysis = analysisService.getAnalysisById(analysisId);

    // Broadcast update with complete analysis data
    await broadcastAnalysisUpdated(analysisId, {
      analysisName: updatedAnalysis?.name,
      status: 'updated',
      restarted: result.restarted,
      ...updatedAnalysis,
    });

    res.json({
      success: true,
      message: 'Analysis updated successfully',
      restarted: result.restarted,
    });
  }

  /**
   * Rename an analysis display name
   * Updates the name property in configuration (directory stays the same in v5.0)
   */
  static async renameAnalysis(
    req: RequestWithLogger & {
      params: { analysisId: string };
      body: RenameAnalysisBody;
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { newName } = req.body;
    // Sanitize newName from body
    const sanitizedNewName = sanitizeAndValidateFilename(newName);

    // Get current analysis data before rename
    const currentAnalysis = analysisService.getAnalysisById(analysisId);
    const oldName = currentAnalysis?.name;

    req.log.info(
      {
        action: 'renameAnalysis',
        analysisId,
        oldName,
        newName: sanitizedNewName,
      },
      'Renaming analysis',
    );

    const result = await analysisService.renameAnalysis(
      analysisId,
      sanitizedNewName,
    );

    req.log.info(
      {
        action: 'renameAnalysis',
        analysisId,
        oldName,
        newName: sanitizedNewName,
        restarted: result.restarted,
      },
      'Analysis renamed',
    );

    // Get updated analysis data
    const renamedAnalysis = analysisService.getAnalysisById(analysisId);

    // Broadcast update with complete analysis data
    await broadcastAnalysisRenamed(analysisId, {
      oldName: oldName || '',
      newName: sanitizedNewName,
      status: 'updated',
      restarted: result.restarted,
      ...renamedAnalysis,
    });

    // Broadcast team structure update so team-based analysis lists update in real-time
    if (renamedAnalysis?.teamId) {
      await broadcastTeamStructureUpdate(renamedAnalysis.teamId);
    }

    res.json({
      success: true,
      message: 'Analysis renamed successfully',
      restarted: result.restarted,
    });
  }

  /**
   * Retrieve analysis logs as plain text
   * Returns log content formatted for LazyLog viewer
   * Format: [HH:MM:SS] message
   */
  static async getLogs(
    req: RequestWithLogger & {
      params: { analysisId: string };
      query: GetLogsQuery;
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { page = 1, limit = 200 } = req.query;

    req.log.debug(
      { action: 'getLogs', analysisId, page, limit },
      'Getting analysis logs',
    );

    const result = await analysisService.getLogs(analysisId, page, limit);

    // Format logs as plain text lines
    // Logs are returned newest-first, reverse to get chronological order for display
    const formattedLines = [...result.logs].reverse().map((log) => {
      // Use centralized time formatting for consistency
      const timestamp = log.createdAt
        ? formatCompactTime(log.createdAt)
        : log.timestamp || '';

      return `[${timestamp}] ${log.message}`;
    });

    req.log.debug(
      { action: 'getLogs', analysisId, lineCount: formattedLines.length },
      'Logs retrieved',
    );

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(formattedLines.join('\n'));
  }

  /**
   * Download analysis logs as a file
   * Supports full log file download or time-filtered downloads
   */
  static async downloadLogs(
    req: RequestWithLogger & {
      params: { analysisId: string };
      query: { timeRange?: string };
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { timeRange } = req.query;

    req.log.debug(
      { action: 'downloadLogs', analysisId, timeRange },
      'Downloading logs',
    );

    if (timeRange === 'all') {
      return AnalysisController.handleFullLogDownload(analysisId, req, res);
    }

    return AnalysisController.handleFilteredLogDownload(
      analysisId,
      timeRange || 'all',
      req,
      res,
    );
  }

  /**
   * Handle download of complete log file as a compressed zip
   * Streams the analysis.log file through archiver for compression
   */
  static async handleFullLogDownload(
    analysisId: string,
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
    const expectedLogFile = path.join(
      config.paths.analysis,
      analysisId,
      'logs',
      'analysis.log',
    );

    // Verify file exists
    try {
      await fs.access(expectedLogFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        req.log.warn(
          { action: 'downloadLogs', analysisId },
          'Log file not found',
        );
        res.status(404).json({
          error: `Log file for analysis ${analysisId} not found`,
        });
        return;
      }
      throw error;
    }

    // Get analysis name for download filename
    const analysis = analysisService.getAnalysisById(analysisId);
    const analysisName = analysis?.name || analysisId;
    const sanitizedName = sanitize(analysisName);

    AnalysisController.setZipDownloadHeaders(sanitizedName, res);

    req.log.debug(
      { action: 'downloadLogs', analysisId },
      'Streaming compressed log file',
    );

    // Create zip archive and stream to response
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', (err: Error) => {
      req.log.error(
        { action: 'downloadLogs', analysisId, err },
        'Error creating zip archive',
      );
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
        return;
      }
    });

    archive.pipe(res);
    archive.file(path.resolve(expectedLogFile), {
      name: `${sanitizedName}.log`,
    });
    archive.finalize();
  }

  /**
   * Handle download of filtered log file by time range as compressed zip
   * Streams filtered content through archiver for compression
   */
  static async handleFilteredLogDownload(
    analysisId: string,
    timeRange: string,
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
    try {
      // Get filtered log content (timeRange validated by route handler)
      const result = await analysisService.getLogsForDownload(
        analysisId,
        timeRange as import('../services/analysis/types.ts').LogTimeRange,
      );
      const { content } = result;

      // Get analysis name for download filename
      const analysis = analysisService.getAnalysisById(analysisId);
      const analysisName = analysis?.name || analysisId;
      const sanitizedName = sanitize(analysisName);

      AnalysisController.setZipDownloadHeaders(sanitizedName, res);

      req.log.debug(
        { action: 'downloadLogs', analysisId, timeRange },
        'Streaming compressed filtered log file',
      );

      // Create zip archive and stream to response
      const archive = archiver('zip', { zlib: { level: 6 } });

      archive.on('error', (err: Error) => {
        req.log.error(
          { action: 'downloadLogs', analysisId, err },
          'Error creating zip archive',
        );
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to create archive' });
          return;
        }
      });

      archive.pipe(res);
      archive.append(content, { name: `${sanitizedName}.log` });
      archive.finalize();
    } catch (error) {
      req.log.error(
        {
          action: 'downloadLogs',
          analysisId,
          err: error,
        },
        'Error generating filtered logs',
      );
      res.status(500).json({
        error: 'Failed to generate download file',
      });
    }
  }

  /**
   * Set HTTP headers for zip file download
   * Configures Content-Disposition and Content-Type for zip archives
   */
  static setZipDownloadHeaders(sanitizedName: string, res: Response): void {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizedName}_logs.zip"`,
    );
    res.setHeader('Content-Type', 'application/zip');
  }

  /**
   * Clear all logs for an analysis
   * Truncates the log file and broadcasts clear event (via service)
   */
  static async clearLogs(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.info({ action: 'clearLogs', analysisId }, 'Clearing analysis logs');

    // Service handles both clearing and broadcasting logsCleared event
    const result = await analysisService.clearLogs(analysisId, {
      logger: req.log,
    });

    req.log.info({ action: 'clearLogs', analysisId }, 'Logs cleared');

    res.json(result);
  }

  /**
   * Download analysis file content
   * Supports downloading current version or specific historical versions
   */
  static async downloadAnalysis(
    req: RequestWithLogger & {
      params: { analysisId: string };
      query: { version?: string };
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { version } = req.query;

    req.log.debug(
      { action: 'downloadAnalysis', analysisId, version },
      'Downloading analysis',
    );

    let content: string;
    if (version && version !== '0') {
      // Download specific version
      const versionNumber = parseInt(version, 10);
      if (isNaN(versionNumber) || versionNumber < 1) {
        req.log.warn(
          {
            action: 'downloadAnalysis',
            analysisId,
            version,
          },
          'Download failed: invalid version number',
        );
        res.status(400).json({ error: 'Invalid version number' });
        return;
      }
      content = await analysisService.getVersionContent(
        analysisId,
        versionNumber,
      );
    } else {
      // Download current version
      content = await analysisService.getAnalysisContent(analysisId);
    }

    req.log.debug(
      { action: 'downloadAnalysis', analysisId, version },
      'Analysis download prepared',
    );

    // Get analysis name for download filename
    const analysis = analysisService.getAnalysisById(analysisId);
    const analysisName = analysis?.name || analysisId;

    // Set the download filename using headers with sanitized name
    const versionSuffix = version && version !== '0' ? `_v${version}` : '';
    const downloadFilename = `${sanitize(analysisName)}${versionSuffix}.js`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadFilename}"`,
    );
    res.setHeader('Content-Type', 'application/javascript');

    res.send(content);
  }

  /**
   * Retrieve version history for an analysis
   * Returns list of all saved versions with metadata
   */
  static async getVersions(
    req: RequestWithLogger & {
      params: { analysisId: string };
      query: { page?: string; limit?: string };
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { page, limit } = req.query;

    req.log.debug(
      { action: 'getVersions', analysisId, page, limit },
      'Getting analysis versions',
    );

    const result = await analysisService.getVersions(analysisId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      logger: req.log,
    });

    req.log.debug(
      {
        action: 'getVersions',
        analysisId,
        count: result.versions.length,
        page: result.page,
        totalPages: result.totalPages,
      },
      'Versions retrieved',
    );

    res.json(result);
  }

  /**
   * Rollback analysis to a specific version
   * Restores content from version history and restarts if running
   */
  static async rollbackToVersion(
    req: RequestWithLogger & {
      params: { analysisId: string };
      body: RollbackBody;
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { version } = req.body;

    // Validation handled by middleware (version is transformed to number)
    const versionNumber = version;

    req.log.info(
      {
        action: 'rollbackToVersion',
        analysisId,
        version: versionNumber,
      },
      'Rolling back analysis',
    );

    const result = await analysisService.rollbackToVersion(
      analysisId,
      versionNumber,
    );

    req.log.info(
      {
        action: 'rollbackToVersion',
        analysisId,
        version: versionNumber,
        restarted: result.restarted,
      },
      'Analysis rolled back',
    );

    // Get updated analysis data (config entry + runtime status)
    const updatedAnalysis = analysisService.getAnalysisById(analysisId);
    const analysisProcess = analysisService.getAnalysisProcess(analysisId);
    const currentStatus = analysisProcess?.status || 'stopped';

    // Broadcast rollback with complete analysis data and actual status
    await broadcastAnalysisRolledBack(analysisId, {
      analysisName: updatedAnalysis?.name,
      version: versionNumber,
      status: currentStatus,
      restarted: result.restarted,
      ...updatedAnalysis,
    });

    res.json({
      success: true,
      message: `Analysis rolled back to version ${versionNumber}`,
      version: versionNumber,
      restarted: result.restarted,
    });
  }

  /**
   * Update analysis environment variables
   * Saves encrypted environment variables and restarts if running
   */
  static async updateEnvironment(
    req: RequestWithLogger & {
      params: { analysisId: string };
      body: UpdateEnvironmentBody;
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { env } = req.body;

    req.log.info(
      { action: 'updateEnvironment', analysisId },
      'Updating environment variables',
    );

    const result = await analysisService.updateEnvironment(analysisId, env);

    req.log.info(
      {
        action: 'updateEnvironment',
        analysisId,
        restarted: result.restarted,
      },
      'Environment updated',
    );

    // Get updated analysis data
    const updatedAnalysis = analysisService.getAnalysisById(analysisId);

    // Broadcast update with complete analysis data
    await broadcastAnalysisEnvironmentUpdated(analysisId, {
      analysisName: updatedAnalysis?.name,
      status: 'updated',
      restarted: result.restarted,
      ...updatedAnalysis,
    });

    res.json({
      success: true,
      message: 'Environment updated successfully',
      restarted: result.restarted,
    });
  }

  /**
   * Retrieve analysis environment variables
   * Returns decrypted environment variables for the specified analysis
   */
  static async getEnvironment(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.debug(
      { action: 'getEnvironment', analysisId },
      'Getting environment variables',
    );

    const env = await analysisService.getEnvironment(analysisId);

    req.log.debug(
      { action: 'getEnvironment', analysisId },
      'Environment variables retrieved',
    );

    res.json(env);
  }

  /**
   * Get analysis metadata
   * Returns comprehensive metadata about the analysis including file stats,
   * version info, process status, team ownership, and DNS usage
   */
  static async getAnalysisMeta(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.debug(
      { action: 'getAnalysisMeta', analysisId },
      'Getting analysis metadata',
    );

    const meta = await analysisInfoService.getAnalysisMeta(analysisId, req.log);

    req.log.debug(
      { action: 'getAnalysisMeta', analysisId },
      'Analysis metadata retrieved',
    );

    res.json(meta);
  }

  /**
   * Get analysis notes
   * Returns markdown notes for the analysis, creating default template if none exist
   */
  static async getAnalysisNotes(
    req: RequestWithLogger & { params: { analysisId: string } },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;

    req.log.debug(
      { action: 'getAnalysisNotes', analysisId },
      'Getting analysis notes',
    );

    const notes = await analysisInfoService.getAnalysisNotes(
      analysisId,
      req.log,
    );

    req.log.debug(
      { action: 'getAnalysisNotes', analysisId, isNew: notes.isNew },
      'Analysis notes retrieved',
    );

    res.json(notes);
  }

  /**
   * Update analysis notes
   * Saves markdown notes for the analysis
   */
  static async updateAnalysisNotes(
    req: RequestWithLogger & {
      params: { analysisId: string };
      body: UpdateNotesBody;
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { content } = req.body;

    req.log.debug(
      { action: 'updateAnalysisNotes', analysisId },
      'Updating analysis notes',
    );

    const result = await analysisInfoService.updateAnalysisNotes(
      analysisId,
      content,
      req.log,
    );

    req.log.info(
      { action: 'updateAnalysisNotes', analysisId },
      'Analysis notes updated',
    );

    // Broadcast notes update
    await broadcastAnalysisNotesUpdated(analysisId, {
      analysisName: result.analysisName,
      lineCount: result.lineCount,
      lastModified: result.lastModified ?? undefined,
    });

    res.json(result);
  }
}

import { analysisService } from '../services/analysisService.js';
import { analysisInfoService } from '../services/analysisInfoService.js';
import { sseManager } from '../utils/sse/index.js';
import path from 'path';
import { config } from '../config/default.js';
import { promises as fs } from 'fs';
import sanitize from 'sanitize-filename';
import archiver from 'archiver';
import { FILE_SIZE } from '../constants.js';
import {
  sanitizeAndValidateFilename,
  isValidFilename,
  FILENAME_ERROR_MESSAGE,
} from '../validation/shared.js';
import { broadcastTeamStructureUpdate } from '../utils/responseHelpers.js';

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
   *
   * File size limit: 50MB
   *
   * @param {Object} req - Express request object
   * @param {Object} req.files - Uploaded files object from express-fileupload
   * @param {Object} req.files.analysis - The analysis file to upload
   * @param {string} req.files.analysis.name - Original filename
   * @param {number} req.files.analysis.size - File size in bytes
   * @param {Buffer} req.files.analysis.data - File content buffer
   * @param {Object} req.body - Request body
   * @param {string} req.body.teamId - Team ID to assign analysis to (required)
   * @param {string} [req.body.targetFolderId] - Optional folder ID within team structure
   * @param {Object} req.log - Request-scoped logger instance
   * @param {Object} res - Express response object
   *
   * @returns {Promise<Object>} JSON response with upload result
   *
   * Side effects:
   * - Creates analysis directory and files on disk
   * - Updates analysis configuration
   * - Broadcasts 'analysisCreated' SSE event to team users with analysis data
   * - Broadcasts 'teamStructureUpdated' SSE event to team users with updated items
   */
  static async uploadAnalysis(req, res) {
    if (!req.files || !req.files.analysis) {
      req.log.warn(
        { action: 'uploadAnalysis' },
        'Upload failed: no file provided',
      );
      return res.status(400).json({ error: 'No file uploaded' });
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
      return res.status(413).json({
        error: 'File size exceeds the maximum limit of 50MB',
        maxSizeMB: 50,
        fileSizeMB: (
          analysis.size /
          FILE_SIZE.KILOBYTES /
          FILE_SIZE.KILOBYTES
        ).toFixed(2),
      });
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
      return res.status(400).json({
        error: FILENAME_ERROR_MESSAGE,
        fileName: analysis.name,
      });
    }

    const teamId = req.body.teamId;
    const targetFolderId = req.body.targetFolderId || null;

    req.log.info(
      {
        action: 'uploadAnalysis',
        fileName: analysis.name,
        teamId,
        targetFolderId,
      },
      'Uploading analysis',
    );

    const result = await analysisService.uploadAnalysis(
      analysis,
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
    sseManager.broadcastAnalysisUpdate(
      result.analysisId,
      {
        type: 'analysisCreated',
        data: {
          analysisId: result.analysisId,
          analysisName: result.analysisName,
          teamId: teamId,
          analysisData: createdAnalysis,
        },
      },
      teamId,
    );

    // Broadcast team structure update
    await broadcastTeamStructureUpdate(sseManager, teamId);

    res.json(result);
  }

  /**
   * Retrieve analyses with permission-based filtering
   * Admin users see all analyses; regular users only see analyses from teams
   * they have 'view_analyses' permission for
   *
   * @param {Object} req - Express request object
   * @param {Object} req.user - Authenticated user object
   * @param {string} req.user.id - User ID
   * @param {string} req.user.role - User role (admin or regular user)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Security:
   * - Service layer filters by team IDs before loading file stats
   * - Prevents timing attacks by filtering at data retrieval level
   */
  static async getAnalyses(req, res) {
    // Extract query parameters for filtering
    const { search, teamId, status, page, limit } = req.query;

    req.log.info(
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
      teamId: teamId || null,
      status: status || null,
      page: page ? parseInt(page, 10) : null,
      limit: limit ? parseInt(limit, 10) : null,
    };

    // Get analyses filtered at service layer for security
    let result;

    if (req.user.role === 'admin') {
      // Admin users see all analyses - no team filter
      result = await analysisService.getAllAnalyses(filterOptions);
      const count = filterOptions.page
        ? Object.keys(result.analyses).length
        : Object.keys(result).length;
      req.log.info(
        { action: 'getAnalyses', count },
        'All analyses retrieved (admin)',
      );
    } else {
      // Get user's allowed team IDs for view_analyses permission
      const { getUserTeamIds } = await import(
        '../middleware/betterAuthMiddleware.js'
      );

      const allowedTeamIds = getUserTeamIds(req.user.id, 'view_analyses');

      // Service filters by team ID before loading file stats (prevents timing attacks)
      result = await analysisService.getAllAnalyses({
        ...filterOptions,
        allowedTeamIds,
      });

      const count = filterOptions.page
        ? Object.keys(result.analyses).length
        : Object.keys(result).length;
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis to run
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Starts a child process for the analysis script
   * - Process lifecycle events (analysisUpdate) are broadcast from analysisProcess.js
   */
  static async runAnalysis(req, res) {
    const { analysisId } = req.params;

    req.log.info({ action: 'runAnalysis', analysisId }, 'Running analysis');

    const result = await analysisService.runAnalysis(analysisId);

    req.log.info({ action: 'runAnalysis', analysisId }, 'Analysis started');

    // No SSE broadcast needed here - the actual process lifecycle event
    // (analysisUpdate) will be sent from analysisProcess.js when the child process starts

    res.json(result);
  }

  /**
   * Stop a running analysis process
   * Terminates the child process and updates analysis status
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis to stop
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Kills the analysis child process
   * - Process lifecycle events (analysisUpdate) are broadcast from analysisProcess.js
   */
  static async stopAnalysis(req, res) {
    const { analysisId } = req.params;

    req.log.info({ action: 'stopAnalysis', analysisId }, 'Stopping analysis');

    const result = await analysisService.stopAnalysis(analysisId);

    req.log.info({ action: 'stopAnalysis', analysisId }, 'Analysis stopped');

    // No SSE broadcast needed here - the actual process lifecycle event
    // (analysisUpdate) will be sent from analysisProcess.js when the child process exits

    res.json(result);
  }

  /**
   * Delete an analysis and all its associated files
   * Removes analysis directory, configuration entries, and team structure references
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis to delete
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Deletes analysis directory and all files
   * - Removes analysis from configuration
   * - Broadcasts 'analysisDeleted' SSE event to team users
   * - Broadcasts 'teamStructureUpdated' SSE event to team users
   */
  static async deleteAnalysis(req, res) {
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
    sseManager.broadcastAnalysisUpdate(
      analysisId,
      {
        type: 'analysisDeleted',
        data: {
          analysisId,
          analysisName,
          teamId,
        },
      },
      teamId,
    );

    // Broadcast team structure update
    if (teamId) {
      await broadcastTeamStructureUpdate(sseManager, teamId);
    }

    res.json({ success: true });
  }

  /**
   * Retrieve analysis file content
   * Returns current content or content from a specific version
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.query - Query parameters
   * @param {string} [req.query.version] - Optional version number to retrieve
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - Content-Type: text/plain
   * - Body: File content as string
   */
  static async getAnalysisContent(req, res) {
    const { analysisId } = req.params;
    const { version } = req.query;

    req.log.info(
      { action: 'getAnalysisContent', analysisId, version },
      'Getting analysis content',
    );

    let content;

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
        return res.status(400).json({ error: 'Invalid version number' });
      }
      content = await analysisService.getVersionContent(
        analysisId,
        versionNumber,
      );
    } else {
      // Get current content
      content = await analysisService.getAnalysisContent(analysisId);
    }

    req.log.info(
      { action: 'getAnalysisContent', analysisId, version },
      'Analysis content retrieved',
    );

    res.set('Content-Type', 'text/plain');
    res.send(content);
  }

  /**
   * Update analysis file content
   * Saves new content, creates a version backup, and restarts if running
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis to update
   * @param {Object} req.body - Request body
   * @param {string} req.body.content - New file content
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Creates version backup before updating
   * - Writes new content to file
   * - Restarts analysis process if it was running
   * - Broadcasts 'analysisUpdated' SSE event
   */
  static async updateAnalysis(req, res) {
    const { analysisId } = req.params;
    const { content } = req.body;

    // Validation handled by middleware
    req.log.info({ action: 'updateAnalysis', analysisId }, 'Updating analysis');

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
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisUpdated',
      data: {
        analysisId,
        analysisName: updatedAnalysis?.name,
        status: 'updated',
        restarted: result.restarted,
        ...updatedAnalysis,
      },
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis to rename
   * @param {Object} req.body - Request body
   * @param {string} req.body.newName - New display name for the analysis
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Updates configuration with new name (directory unchanged)
   * - Restarts analysis process if it was running
   * - Broadcasts 'analysisRenamed' SSE event
   */
  static async renameAnalysis(req, res) {
    const { analysisId } = req.params;
    const { newName } = req.body;
    // Sanitize newName from body
    const sanitizedNewName = sanitizeAndValidateFilename(newName);

    // Get current analysis data before rename
    const currentAnalysis = analysisService.getAnalysisById(analysisId);
    const oldName = currentAnalysis?.name;

    // Validation handled by middleware
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
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisRenamed',
      data: {
        analysisId,
        oldName,
        newName: sanitizedNewName,
        status: 'updated',
        restarted: result.restarted,
        ...renamedAnalysis,
      },
    });

    // Broadcast team structure update so team-based analysis lists update in real-time
    if (renamedAnalysis?.teamId) {
      await broadcastTeamStructureUpdate(sseManager, renamedAnalysis.teamId);
    }

    res.json({
      success: true,
      message: 'Analysis renamed successfully',
      restarted: result.restarted,
    });
  }

  /**
   * Retrieve paginated analysis logs
   * Returns structured log entries with pagination metadata
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.query - Query parameters
   * @param {string} [req.query.page=1] - Page number for pagination
   * @param {string} [req.query.limit=100] - Number of log entries per page
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with logs array and pagination metadata
   */
  static async getLogs(req, res) {
    const { analysisId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    req.log.info(
      { action: 'getLogs', analysisId, page, limit },
      'Getting analysis logs',
    );

    const logs = await analysisService.getLogs(analysisId, page, limit);

    req.log.info(
      {
        action: 'getLogs',
        analysisId,
        count: logs.logs?.length,
      },
      'Logs retrieved',
    );

    res.json(logs);
  }

  /**
   * Download analysis logs as a file
   * Supports full log file download or time-filtered downloads
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.query - Query parameters
   * @param {string} req.query.timeRange - Time range filter ('all', '1h', '24h', '7d', '30d')
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Behavior:
   * - timeRange='all': Streams entire log file directly (memory efficient)
   * - Other ranges: Creates filtered temporary file and sends it
   *
   * Response:
   * - Content-Type: text/plain
   * - Content-Disposition: attachment with sanitized filename
   * - Body: Log file content
   *
   * Side effects:
   * - Creates and auto-cleans temporary files for filtered downloads
   */
  static async downloadLogs(req, res) {
    const { analysisId } = req.params;
    const { timeRange } = req.query;

    req.log.info(
      { action: 'downloadLogs', analysisId, timeRange },
      'Downloading logs',
    );

    if (timeRange === 'all') {
      return AnalysisController.handleFullLogDownload(analysisId, req, res);
    }

    return AnalysisController.handleFilteredLogDownload(
      analysisId,
      timeRange,
      req,
      res,
    );
  }

  /**
   * Handle download of complete log file as a compressed zip
   * Streams the analysis.log file through archiver for compression
   *
   * @param {string} analysisId - Analysis UUID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  static async handleFullLogDownload(analysisId, req, res) {
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
      if (error.code === 'ENOENT') {
        req.log.warn(
          { action: 'downloadLogs', analysisId },
          'Log file not found',
        );
        return res.status(404).json({
          error: `Log file for analysis ${analysisId} not found`,
        });
      }
      throw error;
    }

    // Get analysis name for download filename
    const analysis = analysisService.getAnalysisById(analysisId);
    const analysisName = analysis?.name || analysisId;
    const sanitizedName = sanitize(analysisName);

    AnalysisController.setZipDownloadHeaders(sanitizedName, res);

    req.log.info(
      { action: 'downloadLogs', analysisId },
      'Streaming compressed log file',
    );

    // Create zip archive and stream to response
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', (err) => {
      req.log.error(
        { action: 'downloadLogs', analysisId, err },
        'Error creating zip archive',
      );
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to create archive' });
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
   *
   * @param {string} analysisId - Analysis UUID
   * @param {string} timeRange - Time range filter (1h, 24h, etc.)
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  static async handleFilteredLogDownload(analysisId, timeRange, req, res) {
    try {
      // Get filtered log content
      const result = await analysisService.getLogsForDownload(
        analysisId,
        timeRange,
      );
      const { content } = result;

      // Get analysis name for download filename
      const analysis = analysisService.getAnalysisById(analysisId);
      const analysisName = analysis?.name || analysisId;
      const sanitizedName = sanitize(analysisName);

      AnalysisController.setZipDownloadHeaders(sanitizedName, res);

      req.log.info(
        { action: 'downloadLogs', analysisId, timeRange },
        'Streaming compressed filtered log file',
      );

      // Create zip archive and stream to response
      const archive = archiver('zip', { zlib: { level: 6 } });

      archive.on('error', (err) => {
        req.log.error(
          { action: 'downloadLogs', analysisId, err },
          'Error creating zip archive',
        );
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Failed to create archive' });
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
      return res.status(500).json({
        error: 'Failed to generate download file',
      });
    }
  }

  /**
   * Set HTTP headers for zip file download
   * Configures Content-Disposition and Content-Type for zip archives
   *
   * @param {string} sanitizedName - Sanitized analysis name (for the download filename)
   * @param {Object} res - Express response
   * @returns {void}
   */
  static setZipDownloadHeaders(sanitizedName, res) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizedName}_logs.zip"`,
    );
    res.setHeader('Content-Type', 'application/zip');
  }

  /**
   * Clear all logs for an analysis
   * Truncates the log file and broadcasts clear event
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Truncates analysis log file to empty
   * - Broadcasts 'logsCleared' SSE event with clear timestamp
   */
  static async clearLogs(req, res) {
    const { analysisId } = req.params;

    req.log.info({ action: 'clearLogs', analysisId }, 'Clearing analysis logs');

    const result = await analysisService.clearLogs(analysisId);

    // Get analysis name for SSE payload
    const analysis = analysisService.getAnalysisById(analysisId);
    const analysisName = analysis?.name;

    req.log.info({ action: 'clearLogs', analysisId }, 'Logs cleared');

    // Broadcast logs cleared with the "Log file cleared" message included
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'logsCleared',
      data: {
        analysisId,
        analysisName,
        clearMessage: {
          timestamp: new Date().toLocaleString(),
          message: 'Log file cleared',
          level: 'info',
        },
      },
    });

    res.json(result);
  }

  /**
   * Download analysis file content
   * Supports downloading current version or specific historical versions
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.query - Query parameters
   * @param {string} [req.query.version] - Optional version number to download (0 or undefined = current)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - Content-Type: application/javascript
   * - Content-Disposition: attachment with sanitized filename and optional version suffix
   * - Body: Analysis file content
   */
  static async downloadAnalysis(req, res) {
    const { analysisId } = req.params;
    const { version } = req.query;

    req.log.info(
      { action: 'downloadAnalysis', analysisId, version },
      'Downloading analysis',
    );

    let content;
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
        return res.status(400).json({ error: 'Invalid version number' });
      }
      content = await analysisService.getVersionContent(
        analysisId,
        versionNumber,
      );
    } else {
      // Download current version
      content = await analysisService.getAnalysisContent(analysisId);
    }

    req.log.info(
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON array of version objects with version numbers and timestamps
   */
  static async getVersions(req, res) {
    const { analysisId } = req.params;
    const { page, limit } = req.query;

    req.log.info(
      { action: 'getVersions', analysisId, page, limit },
      'Getting analysis versions',
    );

    const result = await analysisService.getVersions(analysisId, {
      page,
      limit,
      logger: req.log,
    });

    req.log.info(
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.body - Request body
   * @param {number} req.body.version - Version number to rollback to
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Restores file content from specified version
   * - Creates new version backup before rollback
   * - Restarts analysis process if it was running
   * - Broadcasts 'analysisRolledBack' SSE event
   */
  static async rollbackToVersion(req, res) {
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

    // Get updated analysis data
    const updatedAnalysis = analysisService.getAnalysisById(analysisId);

    // Broadcast rollback with complete analysis data
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisRolledBack',
      data: {
        analysisId,
        analysisName: updatedAnalysis?.name,
        version: versionNumber,
        status: 'rolled back',
        restarted: result.restarted,
        ...updatedAnalysis,
      },
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.body - Request body
   * @param {Object} req.body.env - Environment variables object (key-value pairs)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Saves encrypted environment variables to disk
   * - Restarts analysis process if it was running (to apply new env vars)
   * - Broadcasts 'analysisEnvironmentUpdated' SSE event
   */
  static async updateEnvironment(req, res) {
    const { analysisId } = req.params;
    const { env } = req.body;

    // Validation handled by middleware
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
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisEnvironmentUpdated',
      data: {
        analysisId,
        analysisName: updatedAnalysis?.name,
        status: 'updated',
        restarted: result.restarted,
        ...updatedAnalysis,
      },
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with decrypted environment variables (key-value pairs)
   */
  static async getEnvironment(req, res) {
    const { analysisId } = req.params;

    req.log.info(
      { action: 'getEnvironment', analysisId },
      'Getting environment variables',
    );

    const env = await analysisService.getEnvironment(analysisId);

    req.log.info(
      { action: 'getEnvironment', analysisId },
      'Environment variables retrieved',
    );

    res.json(env);
  }

  /**
   * Get analysis metadata
   * Returns comprehensive metadata about the analysis including file stats,
   * version info, process status, team ownership, and DNS usage
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with comprehensive analysis metadata
   */
  static async getAnalysisMeta(req, res) {
    const { analysisId } = req.params;

    req.log.info(
      { action: 'getAnalysisMeta', analysisId },
      'Getting analysis metadata',
    );

    const meta = await analysisInfoService.getAnalysisMeta(analysisId, req.log);

    req.log.info(
      { action: 'getAnalysisMeta', analysisId },
      'Analysis metadata retrieved',
    );

    res.json(meta);
  }

  /**
   * Get analysis notes
   * Returns markdown notes for the analysis, creating default template if none exist
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with notes content and metadata
   */
  static async getAnalysisNotes(req, res) {
    const { analysisId } = req.params;

    req.log.info(
      { action: 'getAnalysisNotes', analysisId },
      'Getting analysis notes',
    );

    const notes = await analysisInfoService.getAnalysisNotes(
      analysisId,
      req.log,
    );

    req.log.info(
      { action: 'getAnalysisNotes', analysisId, isNew: notes.isNew },
      'Analysis notes retrieved',
    );

    res.json(notes);
  }

  /**
   * Update analysis notes
   * Saves markdown notes for the analysis
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.analysisId - UUID of the analysis
   * @param {Object} req.body - Request body
   * @param {string} req.body.content - New notes content (markdown)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with success status and notes metadata
   */
  static async updateAnalysisNotes(req, res) {
    const { analysisId } = req.params;
    const { content } = req.body;

    req.log.info(
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
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisNotesUpdated',
      data: {
        analysisId,
        analysisName: result.analysisName,
        lineCount: result.lineCount,
        lastModified: result.lastModified,
      },
    });

    res.json(result);
  }
}

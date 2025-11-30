import { analysisService } from '../services/analysisService.js';
import { sseManager } from '../utils/sse/index.js';
import path from 'path';
import { config } from '../config/default.js';
import { promises as fs } from 'fs';
import sanitize from 'sanitize-filename';
import { FILE_SIZE } from '../constants.js';
import {
  safeWriteFile,
  safeUnlink,
  sanitizeAndValidateFilename,
} from '../utils/safePath.js';
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
      { action: 'uploadAnalysis', analysisName: result.analysisName, teamId },
      'Analysis uploaded',
    );

    // Get the complete analysis data to broadcast
    const analysisData = await analysisService.getAllAnalyses();
    const createdAnalysis = analysisData[result.analysisName];

    // Broadcast analysis creation to team users only
    sseManager.broadcastAnalysisUpdate(
      result.analysisName,
      {
        type: 'analysisCreated',
        data: {
          analysis: result.analysisName,
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
    req.log.info(
      { action: 'getAnalyses', userId: req.user.id, role: req.user.role },
      'Retrieving analyses',
    );

    // Get analyses filtered at service layer for security
    let analyses;

    if (req.user.role === 'admin') {
      // Admin users see all analyses - no filter
      analyses = await analysisService.getAllAnalyses(null, req.log);
      req.log.info(
        { action: 'getAnalyses', count: Object.keys(analyses).length },
        'All analyses retrieved (admin)',
      );
    } else {
      // Get user's allowed team IDs for view_analyses permission
      const { getUserTeamIds } = await import(
        '../middleware/betterAuthMiddleware.js'
      );

      const allowedTeamIds = getUserTeamIds(req.user.id, 'view_analyses');

      // Service filters by team ID before loading file stats (prevents timing attacks)
      analyses = await analysisService.getAllAnalyses(allowedTeamIds, req.log);

      req.log.info(
        { action: 'getAnalyses', count: Object.keys(analyses).length },
        'Filtered analyses retrieved',
      );
    }

    res.json(analyses);
  }

  /**
   * Start an analysis process
   * Launches the analysis script as a child process and monitors its execution
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.fileName - Name of the analysis file to run
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Starts a child process for the analysis script
   * - Process lifecycle events (analysisUpdate) are broadcast from analysisProcess.js
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   */
  static async runAnalysis(req, res) {
    const { fileName } = req.params;

    req.log.info({ action: 'runAnalysis', fileName }, 'Running analysis');

    const result = await analysisService.runAnalysis(fileName);

    req.log.info({ action: 'runAnalysis', fileName }, 'Analysis started');

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
   * @param {string} req.params.fileName - Name of the analysis file to stop
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Kills the analysis child process
   * - Process lifecycle events (analysisUpdate) are broadcast from analysisProcess.js
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   */
  static async stopAnalysis(req, res) {
    const { fileName } = req.params;

    req.log.info({ action: 'stopAnalysis', fileName }, 'Stopping analysis');

    const result = await analysisService.stopAnalysis(fileName);

    req.log.info({ action: 'stopAnalysis', fileName }, 'Analysis stopped');

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
   * @param {string} req.params.fileName - Name of the analysis file to delete
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Deletes analysis directory and all files
   * - Removes analysis from configuration
   * - Broadcasts 'analysisDeleted' SSE event to team users
   * - Broadcasts 'teamStructureUpdated' SSE event to team users
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   */
  static async deleteAnalysis(req, res) {
    const { fileName } = req.params;

    req.log.info({ action: 'deleteAnalysis', fileName }, 'Deleting analysis');

    // Get analysis data before deletion for broadcast
    const analyses = await analysisService.getAllAnalyses();
    const analysisToDelete = analyses[fileName];

    await analysisService.deleteAnalysis(fileName);

    req.log.info(
      {
        action: 'deleteAnalysis',
        fileName,
        teamId: analysisToDelete?.teamId,
      },
      'Analysis deleted',
    );

    // Broadcast deletion with analysis data
    sseManager.broadcastAnalysisUpdate(
      fileName,
      {
        type: 'analysisDeleted',
        data: {
          fileName,
          teamId: analysisToDelete?.teamId,
        },
      },
      analysisToDelete?.teamId,
    );

    // Broadcast team structure update
    if (analysisToDelete?.teamId) {
      await broadcastTeamStructureUpdate(sseManager, analysisToDelete.teamId);
    }

    res.json({ success: true });
  }

  /**
   * Retrieve analysis file content
   * Returns current content or content from a specific version
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.fileName - Name of the analysis file
   * @param {Object} req.query - Query parameters
   * @param {string} [req.query.version] - Optional version number to retrieve
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - Content-Type: text/plain
   * - Body: File content as string
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   * - Version number is validated to prevent negative or non-numeric values
   */
  static async getAnalysisContent(req, res) {
    const { fileName } = req.params;
    const { version } = req.query;

    req.log.info(
      { action: 'getAnalysisContent', fileName, version },
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
            fileName,
            version,
          },
          'Invalid version number',
        );
        return res.status(400).json({ error: 'Invalid version number' });
      }
      content = await analysisService.getVersionContent(
        fileName,
        versionNumber,
      );
    } else {
      // Get current content
      content = await analysisService.getAnalysisContent(fileName);
    }

    req.log.info(
      { action: 'getAnalysisContent', fileName, version },
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
   * @param {string} req.params.fileName - Name of the analysis file to update
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
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   * - Content validation handled by middleware
   */
  static async updateAnalysis(req, res) {
    const { fileName } = req.params;
    const { content } = req.body;

    // Validation handled by middleware
    req.log.info({ action: 'updateAnalysis', fileName }, 'Updating analysis');

    const result = await analysisService.updateAnalysis(fileName, {
      content,
    });

    req.log.info(
      {
        action: 'updateAnalysis',
        fileName,
        restarted: result.restarted,
      },
      'Analysis updated',
    );

    // Get updated analysis data
    const analyses = await analysisService.getAllAnalyses();
    const updatedAnalysis = analyses[fileName];

    // Broadcast update with complete analysis data
    sseManager.broadcastAnalysisUpdate(fileName, {
      type: 'analysisUpdated',
      data: {
        fileName,
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
   * Rename an analysis file and directory
   * Updates file/directory names, configuration, and restarts if running
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.fileName - Current name of the analysis file
   * @param {Object} req.body - Request body
   * @param {string} req.body.newFileName - New name for the analysis file
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Renames analysis directory and files
   * - Updates configuration with new name
   * - Restarts analysis process if it was running
   * - Broadcasts 'analysisRenamed' SSE event
   *
   * Security:
   * - Both old and new filenames are sanitized to prevent path traversal attacks
   * - Name validation handled by middleware
   */
  static async renameAnalysis(req, res) {
    const { fileName } = req.params;
    const { newFileName } = req.body;
    // Sanitize newFileName from body (fileName from params is already sanitized by middleware)
    const sanitizedNewFileName = sanitizeAndValidateFilename(newFileName);

    // Validation handled by middleware
    req.log.info(
      {
        action: 'renameAnalysis',
        oldFileName: fileName,
        newFileName: sanitizedNewFileName,
      },
      'Renaming analysis',
    );

    const result = await analysisService.renameAnalysis(
      fileName,
      sanitizedNewFileName,
    );

    req.log.info(
      {
        action: 'renameAnalysis',
        oldFileName: fileName,
        newFileName: sanitizedNewFileName,
        restarted: result.restarted,
      },
      'Analysis renamed',
    );

    // Get updated analysis data
    const analyses = await analysisService.getAllAnalyses();
    const renamedAnalysis = analyses[sanitizedNewFileName];

    // Broadcast update with complete analysis data
    sseManager.broadcastAnalysisUpdate(sanitizedNewFileName, {
      type: 'analysisRenamed',
      data: {
        oldFileName: fileName,
        newFileName: sanitizedNewFileName,
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
   * @param {string} req.params.fileName - Name of the analysis file
   * @param {Object} req.query - Query parameters
   * @param {string} [req.query.page=1] - Page number for pagination
   * @param {string} [req.query.limit=100] - Number of log entries per page
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with logs array and pagination metadata
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   */
  static async getLogs(req, res) {
    const { fileName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    req.log.info(
      { action: 'getLogs', fileName, page, limit },
      'Getting analysis logs',
    );

    const logs = await analysisService.getLogs(fileName, page, limit);

    req.log.info(
      {
        action: 'getLogs',
        fileName,
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
   * @param {string} req.params.fileName - Name of the analysis file
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
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   * - All file paths validated against base directory
   * - Temporary files cleaned up after sending
   */
  static async downloadLogs(req, res) {
    const fileName = sanitizeAndValidateFilename(req.params.fileName);
    const { timeRange } = req.query;

    req.log.info(
      { action: 'downloadLogs', fileName, timeRange },
      'Downloading logs',
    );

    if (timeRange === 'all') {
      return AnalysisController.handleFullLogDownload(fileName, req, res);
    }

    return AnalysisController.handleFilteredLogDownload(
      fileName,
      timeRange,
      req,
      res,
    );
  }

  /**
   * Handle download of complete log file
   * Streams the full analysis.log file directly
   *
   * @param {string} fileName - Analysis file name
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  static async handleFullLogDownload(fileName, req, res) {
    const expectedLogFile = path.join(
      config.paths.analysis,
      fileName,
      'logs',
      'analysis.log',
    );

    // Verify file exists
    try {
      await fs.access(expectedLogFile);
    } catch (error) {
      if (error.code === 'ENOENT') {
        req.log.warn(
          { action: 'downloadLogs', fileName },
          'Log file not found',
        );
        return res.status(404).json({
          error: `Log file for ${fileName} not found`,
        });
      }
      throw error;
    }

    AnalysisController.setLogDownloadHeaders(fileName, res);

    req.log.info({ action: 'downloadLogs', fileName }, 'Streaming log file');

    // Stream file directly
    res.sendFile(path.resolve(expectedLogFile), (err) => {
      if (err && !res.headersSent) {
        req.log.error(
          { action: 'downloadLogs', fileName, err },
          'Error streaming log file',
        );
        return res.status(500).json({ error: 'Failed to download file' });
      }
    });
  }

  /**
   * Handle download of filtered log file by time range
   * Creates temporary filtered file and streams it
   *
   * @param {string} fileName - Analysis file name
   * @param {string} timeRange - Time range filter (1h, 24h, etc.)
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  static async handleFilteredLogDownload(fileName, timeRange, req, res) {
    try {
      // Get filtered log content
      const result = await analysisService.getLogsForDownload(
        fileName,
        timeRange,
      );
      const { content } = result;

      // Create temp file
      const tempLogFile = path.join(
        config.paths.analysis,
        fileName,
        'logs',
        `${sanitize(path.parse(fileName).name)}_${sanitize(timeRange)}_temp.log`,
      );

      const resolvedTempLogFile = path.resolve(tempLogFile);

      await safeWriteFile(resolvedTempLogFile, content, config.paths.analysis);

      AnalysisController.setLogDownloadHeaders(fileName, res);

      req.log.info(
        { action: 'downloadLogs', fileName, timeRange },
        'Sending filtered log file',
      );

      // Send and clean up
      res.sendFile(resolvedTempLogFile, (err) => {
        safeUnlink(resolvedTempLogFile, config.paths.analysis).catch(
          (unlinkError) => {
            req.log.error(
              {
                action: 'downloadLogs',
                fileName,
                err: unlinkError,
              },
              'Error cleaning up temporary file',
            );
          },
        );

        if (err && !res.headersSent) {
          req.log.error(
            { action: 'downloadLogs', fileName, err },
            'Error sending file',
          );
          return res.status(500).json({ error: 'Failed to download file' });
        }
      });
    } catch (writeError) {
      req.log.error(
        {
          action: 'downloadLogs',
          fileName,
          err: writeError,
        },
        'Error writing temporary file',
      );
      return res.status(500).json({
        error: 'Failed to generate download file',
      });
    }
  }

  /**
   * Set HTTP headers for log file download
   * Configures Content-Disposition and Content-Type
   *
   * @param {string} fileName - Analysis file name
   * @param {Object} res - Express response
   * @returns {void}
   */
  static setLogDownloadHeaders(fileName, res) {
    const downloadFilename = `${sanitize(path.parse(fileName).name)}.log`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadFilename}"`,
    );
    res.setHeader('Content-Type', 'text/plain');
  }

  /**
   * Clear all logs for an analysis
   * Truncates the log file and broadcasts clear event
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.fileName - Name of the analysis file
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Truncates analysis log file to empty
   * - Broadcasts 'logsCleared' SSE event with clear timestamp
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   */
  static async clearLogs(req, res) {
    const { fileName } = req.params;

    req.log.info({ action: 'clearLogs', fileName }, 'Clearing analysis logs');

    const result = await analysisService.clearLogs(fileName);

    req.log.info({ action: 'clearLogs', fileName }, 'Logs cleared');

    // Broadcast logs cleared with the "Log file cleared" message included
    sseManager.broadcastAnalysisUpdate(fileName, {
      type: 'logsCleared',
      data: {
        fileName,
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
   * @param {string} req.params.fileName - Name of the analysis file
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
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   * - Version number validated to prevent negative or non-numeric values
   */
  static async downloadAnalysis(req, res) {
    const { fileName } = req.params;
    const { version } = req.query;

    req.log.info(
      { action: 'downloadAnalysis', fileName, version },
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
            fileName,
            version,
          },
          'Download failed: invalid version number',
        );
        return res.status(400).json({ error: 'Invalid version number' });
      }
      content = await analysisService.getVersionContent(
        fileName,
        versionNumber,
      );
    } else {
      // Download current version
      content = await analysisService.getAnalysisContent(fileName);
    }

    req.log.info(
      { action: 'downloadAnalysis', fileName, version },
      'Analysis download prepared',
    );

    // Set the download filename using headers with sanitized name
    const versionSuffix = version && version !== '0' ? `_v${version}` : '';
    const downloadFilename = `${sanitize(fileName)}${versionSuffix}.js`;
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
   * @param {string} req.params.fileName - Name of the analysis file
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON array of version objects with version numbers and timestamps
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   */
  static async getVersions(req, res) {
    const { fileName } = req.params;

    req.log.info(
      { action: 'getVersions', fileName },
      'Getting analysis versions',
    );

    const versions = await analysisService.getVersions(fileName);

    req.log.info(
      {
        action: 'getVersions',
        fileName,
        count: versions.length,
      },
      'Versions retrieved',
    );

    res.json(versions);
  }

  /**
   * Rollback analysis to a specific version
   * Restores content from version history and restarts if running
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.fileName - Name of the analysis file
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
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   * - Version number validated by middleware
   */
  static async rollbackToVersion(req, res) {
    const { fileName } = req.params;
    const { version } = req.body;

    // Validation handled by middleware (version is transformed to number)
    const versionNumber = version;

    req.log.info(
      {
        action: 'rollbackToVersion',
        fileName,
        version: versionNumber,
      },
      'Rolling back analysis',
    );

    const result = await analysisService.rollbackToVersion(
      fileName,
      versionNumber,
    );

    req.log.info(
      {
        action: 'rollbackToVersion',
        fileName,
        version: versionNumber,
        restarted: result.restarted,
      },
      'Analysis rolled back',
    );

    // Get updated analysis data
    const analyses = await analysisService.getAllAnalyses();
    const updatedAnalysis = analyses[fileName];

    // Broadcast rollback with complete analysis data
    sseManager.broadcastAnalysisUpdate(fileName, {
      type: 'analysisRolledBack',
      data: {
        fileName,
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
   * @param {string} req.params.fileName - Name of the analysis file
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
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   * - Environment variables are encrypted before storage
   * - Validation handled by middleware
   */
  static async updateEnvironment(req, res) {
    const { fileName } = req.params;
    const { env } = req.body;

    // Validation handled by middleware
    req.log.info(
      { action: 'updateEnvironment', fileName },
      'Updating environment variables',
    );

    const result = await analysisService.updateEnvironment(fileName, env);

    req.log.info(
      {
        action: 'updateEnvironment',
        fileName,
        restarted: result.restarted,
      },
      'Environment updated',
    );

    // Get updated analysis data
    const analyses = await analysisService.getAllAnalyses();
    const updatedAnalysis = analyses[fileName];

    // Broadcast update with complete analysis data
    sseManager.broadcastAnalysisUpdate(fileName, {
      type: 'analysisEnvironmentUpdated',
      data: {
        fileName,
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
   * @param {string} req.params.fileName - Name of the analysis file
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with decrypted environment variables (key-value pairs)
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   * - Environment variables are decrypted before returning
   */
  static async getEnvironment(req, res) {
    const { fileName } = req.params;

    req.log.info(
      { action: 'getEnvironment', fileName },
      'Getting environment variables',
    );

    const env = await analysisService.getEnvironment(fileName);

    req.log.info(
      { action: 'getEnvironment', fileName },
      'Environment variables retrieved',
    );

    res.json(env);
  }
}

// backend/src/controllers/analysisController.js
import { analysisService } from '../services/analysisService.js';
import { sseManager } from '../utils/sse.js';
import path from 'path';
import config from '../config/default.js';
import { promises as fs } from 'fs';
import sanitize from 'sanitize-filename';
import {
  safeWriteFile,
  safeUnlink,
  isPathSafe,
  sanitizeAndValidateFilename,
} from '../utils/safePath.js';
import { handleError } from '../utils/responseHelpers.js';

/**
 * Controller class for managing analysis operations
 * Handles HTTP requests for analysis file management, execution control, versioning,
 * environment configuration, and log management. Uses SSE for real-time updates.
 *
 * All methods are static and follow Express route handler pattern (req, res).
 * Request-scoped logging is available via req.log.
 */
class AnalysisController {
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
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (analysis.size > maxSize) {
      req.log.warn(
        {
          action: 'uploadAnalysis',
          fileName: analysis.name,
          fileSize: analysis.size,
          maxSize: maxSize,
        },
        'Upload failed: file size exceeds limit',
      );
      return res.status(413).json({
        error: 'File size exceeds the maximum limit of 50MB',
        maxSizeMB: 50,
        fileSizeMB: (analysis.size / (1024 * 1024)).toFixed(2),
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

    try {
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
      const config = await analysisService.getConfig();
      sseManager.broadcastToTeamUsers(teamId, {
        type: 'teamStructureUpdated',
        teamId: teamId,
        items: config.teamStructure[teamId]?.items || [],
      });

      res.json(result);
    } catch (error) {
      handleError(res, error, 'uploading analysis', { logger: req.logger });
    }
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

    try {
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
        analyses = await analysisService.getAllAnalyses(
          allowedTeamIds,
          req.log,
        );

        req.log.info(
          { action: 'getAnalyses', count: Object.keys(analyses).length },
          'Filtered analyses retrieved',
        );
      }

      res.json(analyses);
    } catch (error) {
      handleError(res, error, 'retrieving analyses', { logger: req.logger });
    }
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
   * - Broadcasts 'analysisStatus' SSE event with status 'running'
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   */
  static async runAnalysis(req, res) {
    const { fileName } = req.params;
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'runAnalysis', fileName: sanitizedFileName },
      'Running analysis',
    );

    try {
      const result = await analysisService.runAnalysis(sanitizedFileName);

      req.log.info(
        { action: 'runAnalysis', fileName: sanitizedFileName },
        'Analysis started',
      );

      sseManager.broadcastAnalysisUpdate(sanitizedFileName, {
        type: 'analysisStatus',
        data: {
          fileName: sanitizedFileName,
          status: 'running',
          enabled: true,
        },
      });

      res.json(result);
    } catch (error) {
      handleError(res, error, 'running analysis', { logger: req.logger });
    }
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
   * - Broadcasts 'analysisStatus' SSE event with status 'stopped'
   *
   * Security:
   * - Filename is sanitized to prevent path traversal attacks
   */
  static async stopAnalysis(req, res) {
    const { fileName } = req.params;
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'stopAnalysis', fileName: sanitizedFileName },
      'Stopping analysis',
    );

    try {
      const result = await analysisService.stopAnalysis(sanitizedFileName);

      req.log.info(
        { action: 'stopAnalysis', fileName: sanitizedFileName },
        'Analysis stopped',
      );

      sseManager.broadcastAnalysisUpdate(sanitizedFileName, {
        type: 'analysisStatus',
        data: {
          fileName: sanitizedFileName,
          status: 'stopped',
          enabled: false,
        },
      });

      res.json(result);
    } catch (error) {
      handleError(res, error, 'stopping analysis', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'deleteAnalysis', fileName: sanitizedFileName },
      'Deleting analysis',
    );

    try {
      // Get analysis data before deletion for broadcast
      const analyses = await analysisService.getAllAnalyses();
      const analysisToDelete = analyses[sanitizedFileName];

      await analysisService.deleteAnalysis(sanitizedFileName);

      req.log.info(
        {
          action: 'deleteAnalysis',
          fileName: sanitizedFileName,
          teamId: analysisToDelete?.teamId,
        },
        'Analysis deleted',
      );

      // Broadcast deletion with analysis data
      sseManager.broadcastAnalysisUpdate(
        sanitizedFileName,
        {
          type: 'analysisDeleted',
          data: {
            fileName: sanitizedFileName,
            teamId: analysisToDelete?.teamId,
          },
        },
        analysisToDelete?.teamId,
      );

      // Broadcast team structure update
      if (analysisToDelete?.teamId) {
        const config = await analysisService.getConfig();
        sseManager.broadcastToTeamUsers(analysisToDelete.teamId, {
          type: 'teamStructureUpdated',
          teamId: analysisToDelete.teamId,
          items: config.teamStructure[analysisToDelete.teamId]?.items || [],
        });
      }

      res.json({ success: true });
    } catch (error) {
      handleError(res, error, 'deleting analysis', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'getAnalysisContent', fileName: sanitizedFileName, version },
      'Getting analysis content',
    );

    try {
      let content;

      if (version !== undefined) {
        // Get version-specific content
        const versionNumber = parseInt(version, 10);
        if (isNaN(versionNumber) || versionNumber < 0) {
          req.log.warn(
            {
              action: 'getAnalysisContent',
              fileName: sanitizedFileName,
              version,
            },
            'Invalid version number',
          );
          return res.status(400).json({ error: 'Invalid version number' });
        }
        content = await analysisService.getVersionContent(
          sanitizedFileName,
          versionNumber,
        );
      } else {
        // Get current content
        content = await analysisService.getAnalysisContent(sanitizedFileName);
      }

      req.log.info(
        { action: 'getAnalysisContent', fileName: sanitizedFileName, version },
        'Analysis content retrieved',
      );

      res.set('Content-Type', 'text/plain');
      res.send(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        req.log.warn(
          { action: 'getAnalysisContent', fileName: sanitizedFileName },
          'Analysis file not found',
        );
        return res.status(404).json({
          error: `Analysis file ${sanitizedFileName} not found`,
        });
      }
      handleError(res, error, 'getting analysis content', {
        logger: req.logger,
      });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    // Validation handled by middleware
    req.log.info(
      { action: 'updateAnalysis', fileName: sanitizedFileName },
      'Updating analysis',
    );

    try {
      const result = await analysisService.updateAnalysis(sanitizedFileName, {
        content,
      });

      req.log.info(
        {
          action: 'updateAnalysis',
          fileName: sanitizedFileName,
          restarted: result.restarted,
        },
        'Analysis updated',
      );

      // Get updated analysis data
      const analyses = await analysisService.getAllAnalyses();
      const updatedAnalysis = analyses[sanitizedFileName];

      // Broadcast update with complete analysis data
      sseManager.broadcastAnalysisUpdate(sanitizedFileName, {
        type: 'analysisUpdated',
        data: {
          fileName: sanitizedFileName,
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
    } catch (error) {
      handleError(res, error, 'updating analysis', { logger: req.logger });
    }
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
    // Sanitize both filenames to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);
    const sanitizedNewFileName = sanitizeAndValidateFilename(newFileName);

    // Validation handled by middleware
    req.log.info(
      {
        action: 'renameAnalysis',
        oldFileName: sanitizedFileName,
        newFileName: sanitizedNewFileName,
      },
      'Renaming analysis',
    );

    try {
      const result = await analysisService.renameAnalysis(
        sanitizedFileName,
        sanitizedNewFileName,
      );

      req.log.info(
        {
          action: 'renameAnalysis',
          oldFileName: sanitizedFileName,
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
          oldFileName: sanitizedFileName,
          newFileName: sanitizedNewFileName,
          status: 'updated',
          restarted: result.restarted,
          ...renamedAnalysis,
        },
      });

      res.json({
        success: true,
        message: 'Analysis renamed successfully',
        restarted: result.restarted,
      });
    } catch (error) {
      handleError(res, error, 'renaming analysis', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'getLogs', fileName: sanitizedFileName, page, limit },
      'Getting analysis logs',
    );

    try {
      const logs = await analysisService.getLogs(
        sanitizedFileName,
        page,
        limit,
      );

      req.log.info(
        {
          action: 'getLogs',
          fileName: sanitizedFileName,
          count: logs.logs?.length,
        },
        'Logs retrieved',
      );

      res.json(logs);
    } catch (error) {
      handleError(res, error, 'getting logs', { logger: req.logger });
    }
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
    const { fileName } = req.params;
    const { timeRange } = req.query;
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    // Validation handled by middleware
    req.log.info(
      { action: 'downloadLogs', fileName: sanitizedFileName, timeRange },
      'Downloading logs',
    );

    try {
      // Get logs from analysisService using sanitized filename
      const result = await analysisService.getLogsForDownload(
        sanitizedFileName,
        timeRange,
      );

      if (timeRange === 'all') {
        // For 'all' time range, construct the expected log file path securely
        // instead of trusting the service-provided path
        const expectedLogFile = path.join(
          config.paths.analysis,
          sanitizedFileName,
          'logs',
          'analysis.log',
        );

        // Validate that our expected path is within allowed directory
        if (!isPathSafe(expectedLogFile, config.paths.analysis)) {
          throw new Error('Path traversal attempt detected');
        }

        // Verify the file exists before attempting to serve it
        try {
          await fs.access(expectedLogFile);
        } catch (error) {
          if (error.code === 'ENOENT') {
            req.log.warn(
              { action: 'downloadLogs', fileName: sanitizedFileName },
              'Log file not found',
            );
            return res.status(404).json({
              error: `Log file for ${sanitizedFileName} not found`,
            });
          }
          throw error;
        }

        // Set download headers
        const downloadFilename = `${sanitize(path.parse(sanitizedFileName).name)}.log`;
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${downloadFilename}"`,
        );
        res.setHeader('Content-Type', 'text/plain');

        req.log.info(
          { action: 'downloadLogs', fileName: sanitizedFileName, timeRange },
          'Streaming log file',
        );

        // Stream the file directly - no memory loading
        return res.sendFile(expectedLogFile, (err) => {
          if (err && !res.headersSent) {
            req.log.error(
              { action: 'downloadLogs', fileName: sanitizedFileName, err },
              'Error streaming log file',
            );
            return res.status(500).json({ error: 'Failed to download file' });
          }
        });
      }

      // For filtered time ranges, use the content approach since files are smaller
      const { content } = result;

      // Define log path inside the analysis subfolder with sanitized filename
      const analysisLogsDir = path.join(
        config.paths.analysis,
        sanitizedFileName,
        'logs',
      );

      // Validate that the logs directory is within the expected analysis path
      if (!isPathSafe(analysisLogsDir, config.paths.analysis)) {
        throw new Error('Path traversal attempt detected');
      }

      // Create a temporary file in the correct logs directory with sanitized filename
      const tempLogFile = path.join(
        analysisLogsDir,
        `${sanitize(path.parse(sanitizedFileName).name)}_${sanitize(timeRange)}_temp.log`,
      );

      // Validate that the temp file path is within the expected directory
      if (!isPathSafe(tempLogFile, analysisLogsDir)) {
        throw new Error('Path traversal attempt detected');
      }

      try {
        await safeWriteFile(tempLogFile, content, config.paths.analysis);

        // Set the download filename using headers with sanitized name
        const downloadFilename = `${sanitize(path.parse(sanitizedFileName).name)}.log`;
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${downloadFilename}"`,
        );
        res.setHeader('Content-Type', 'text/plain');

        req.log.info(
          { action: 'downloadLogs', fileName: sanitizedFileName, timeRange },
          'Sending filtered log file',
        );

        // Send the file using the full tempLogFile path
        res.sendFile(tempLogFile, (err) => {
          // Clean up temp file using the already validated tempLogFile path
          safeUnlink(tempLogFile, config.paths.analysis).catch(
            (unlinkError) => {
              req.log.error(
                {
                  action: 'downloadLogs',
                  fileName: sanitizedFileName,
                  err: unlinkError,
                },
                'Error cleaning up temporary file',
              );
            },
          );

          if (err && !res.headersSent) {
            req.log.error(
              { action: 'downloadLogs', fileName: sanitizedFileName, err },
              'Error sending file',
            );
            return res.status(500).json({ error: 'Failed to download file' });
          }
        });
      } catch (writeError) {
        req.log.error(
          {
            action: 'downloadLogs',
            fileName: sanitizedFileName,
            err: writeError,
          },
          'Error writing temporary file',
        );
        return res
          .status(500)
          .json({ error: 'Failed to generate download file' });
      }
    } catch (error) {
      if (error.message.includes('Log file not found')) {
        req.log.warn(
          { action: 'downloadLogs', fileName: sanitizedFileName },
          'Log file not found',
        );
        return res.status(404).json({ error: error.message });
      }

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        req.log.warn(
          { action: 'downloadLogs', fileName: sanitizedFileName },
          'Invalid file path',
        );
        return res.status(400).json({ error: 'Invalid file path' });
      }

      handleError(res, error, 'downloading logs', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'clearLogs', fileName: sanitizedFileName },
      'Clearing analysis logs',
    );

    try {
      const result = await analysisService.clearLogs(sanitizedFileName);

      req.log.info(
        { action: 'clearLogs', fileName: sanitizedFileName },
        'Logs cleared',
      );

      // Broadcast logs cleared with the "Log file cleared" message included
      // This avoids race conditions with separate log events
      sseManager.broadcastAnalysisUpdate(sanitizedFileName, {
        type: 'logsCleared',
        data: {
          fileName: sanitizedFileName,
          clearMessage: {
            timestamp: new Date().toLocaleString(),
            message: 'Log file cleared',
            level: 'info',
          },
        },
      });

      res.json(result);
    } catch (error) {
      handleError(res, error, 'clearing logs', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'downloadAnalysis', fileName: sanitizedFileName, version },
      'Downloading analysis',
    );

    try {
      let content;
      if (version && version !== '0') {
        // Download specific version
        const versionNumber = parseInt(version, 10);
        if (isNaN(versionNumber) || versionNumber < 1) {
          req.log.warn(
            {
              action: 'downloadAnalysis',
              fileName: sanitizedFileName,
              version,
            },
            'Download failed: invalid version number',
          );
          return res.status(400).json({ error: 'Invalid version number' });
        }
        content = await analysisService.getVersionContent(
          sanitizedFileName,
          versionNumber,
        );
      } else {
        // Download current version
        content = await analysisService.getAnalysisContent(sanitizedFileName);
      }

      req.log.info(
        { action: 'downloadAnalysis', fileName: sanitizedFileName, version },
        'Analysis download prepared',
      );

      // Set the download filename using headers with sanitized name
      const versionSuffix = version && version !== '0' ? `_v${version}` : '';
      const downloadFilename = `${sanitize(sanitizedFileName)}${versionSuffix}.js`;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${downloadFilename}"`,
      );
      res.setHeader('Content-Type', 'application/javascript');

      res.send(content);
    } catch (error) {
      handleError(res, error, 'downloading analysis', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'getVersions', fileName: sanitizedFileName },
      'Getting analysis versions',
    );

    try {
      const versions = await analysisService.getVersions(sanitizedFileName);

      req.log.info(
        {
          action: 'getVersions',
          fileName: sanitizedFileName,
          count: versions.length,
        },
        'Versions retrieved',
      );

      res.json(versions);
    } catch (error) {
      handleError(res, error, 'getting versions', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    // Validation handled by middleware (version is transformed to number)
    const versionNumber = version;

    req.log.info(
      {
        action: 'rollbackToVersion',
        fileName: sanitizedFileName,
        version: versionNumber,
      },
      'Rolling back analysis',
    );

    try {
      const result = await analysisService.rollbackToVersion(
        sanitizedFileName,
        versionNumber,
      );

      req.log.info(
        {
          action: 'rollbackToVersion',
          fileName: sanitizedFileName,
          version: versionNumber,
          restarted: result.restarted,
        },
        'Analysis rolled back',
      );

      // Get updated analysis data
      const analyses = await analysisService.getAllAnalyses();
      const updatedAnalysis = analyses[sanitizedFileName];

      // Broadcast rollback with complete analysis data
      sseManager.broadcastAnalysisUpdate(sanitizedFileName, {
        type: 'analysisRolledBack',
        data: {
          fileName: sanitizedFileName,
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
    } catch (error) {
      handleError(res, error, 'rolling back analysis', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    // Validation handled by middleware
    req.log.info(
      { action: 'updateEnvironment', fileName: sanitizedFileName },
      'Updating environment variables',
    );

    try {
      const result = await analysisService.updateEnvironment(
        sanitizedFileName,
        env,
      );

      req.log.info(
        {
          action: 'updateEnvironment',
          fileName: sanitizedFileName,
          restarted: result.restarted,
        },
        'Environment updated',
      );

      // Get updated analysis data
      const analyses = await analysisService.getAllAnalyses();
      const updatedAnalysis = analyses[sanitizedFileName];

      // Broadcast update with complete analysis data
      sseManager.broadcastAnalysisUpdate(sanitizedFileName, {
        type: 'analysisEnvironmentUpdated',
        data: {
          fileName: sanitizedFileName,
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
    } catch (error) {
      handleError(res, error, 'updating environment', { logger: req.logger });
    }
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
    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    req.log.info(
      { action: 'getEnvironment', fileName: sanitizedFileName },
      'Getting environment variables',
    );

    try {
      const env = await analysisService.getEnvironment(sanitizedFileName);

      req.log.info(
        { action: 'getEnvironment', fileName: sanitizedFileName },
        'Environment variables retrieved',
      );

      res.json(env);
    } catch (error) {
      handleError(res, error, 'getting environment', { logger: req.logger });
    }
  }
}

export default AnalysisController;

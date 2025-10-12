// backend/src/controllers/analysisController.js
import { analysisService } from '../services/analysisService.js';
import { sseManager } from '../utils/sse.js';
import path from 'path';
import config from '../config/default.js';
import { promises as fs } from 'fs';
import sanitize from 'sanitize-filename';
import { safeWriteFile, safeUnlink } from '../utils/safePath.js';
import { handleError } from '../utils/responseHelpers.js';

// Helper function to validate that a path is within the expected directory
function validatePath(targetPath, allowedBasePath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(allowedBasePath);

  // Check if the resolved target path starts with the resolved base path
  if (
    !resolvedTarget.startsWith(resolvedBase + path.sep) &&
    resolvedTarget !== resolvedBase
  ) {
    throw new Error('Path traversal attempt detected');
  }

  return resolvedTarget;
}

// Helper function to sanitize and validate filename
function sanitizeAndValidateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid filename');
  }

  const sanitized = sanitize(filename, { replacement: '_' });

  if (
    !sanitized ||
    sanitized.length === 0 ||
    sanitized === '.' ||
    sanitized === '..'
  ) {
    throw new Error('Filename cannot be empty or invalid after sanitization');
  }

  return sanitized;
}

class AnalysisController {
  static async uploadAnalysis(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;

    if (!req.files || !req.files.analysis) {
      logger.warn(
        { action: 'uploadAnalysis' },
        'Upload failed: no file provided',
      );
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const analysis = req.files.analysis;
    const teamId = req.body.teamId;
    const targetFolderId = req.body.targetFolderId || null;

    logger.info(
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

      logger.info(
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
      handleError(res, error, 'uploading analysis');
    }
  }

  static async getAnalyses(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;

    logger.info(
      { action: 'getAnalyses', userId: req.user.id, role: req.user.role },
      'Retrieving analyses',
    );

    try {
      const allAnalyses = await analysisService.getAllAnalyses();

      // Admin users can see all analyses
      if (req.user.role === 'admin') {
        logger.info(
          { action: 'getAnalyses', count: Object.keys(allAnalyses).length },
          'All analyses retrieved (admin)',
        );
        return res.json(allAnalyses);
      }

      // Get user's allowed team IDs for view_analyses permission
      const { getUserTeamIds } = await import(
        '../middleware/betterAuthMiddleware.js'
      );

      const allowedTeamIds = getUserTeamIds(req.user.id, 'view_analyses');

      // Filter analyses to only include those in allowed teams
      const filteredAnalyses = {};
      for (const [analysisName, analysis] of Object.entries(allAnalyses)) {
        if (allowedTeamIds.includes(analysis.teamId)) {
          filteredAnalyses[analysisName] = analysis;
        }
      }

      logger.info(
        { action: 'getAnalyses', count: Object.keys(filteredAnalyses).length },
        'Filtered analyses retrieved',
      );

      res.json(filteredAnalyses);
    } catch (error) {
      handleError(res, error, 'retrieving analyses');
    }
  }

  static async runAnalysis(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'runAnalysis', fileName: sanitizedFileName },
      'Running analysis',
    );

    try {
      const result = await analysisService.runAnalysis(sanitizedFileName);

      logger.info(
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
      handleError(res, error, 'running analysis');
    }
  }

  static async stopAnalysis(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'stopAnalysis', fileName: sanitizedFileName },
      'Stopping analysis',
    );

    try {
      const result = await analysisService.stopAnalysis(sanitizedFileName);

      logger.info(
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
      handleError(res, error, 'stopping analysis');
    }
  }

  static async deleteAnalysis(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'deleteAnalysis', fileName: sanitizedFileName },
      'Deleting analysis',
    );

    try {
      // Get analysis data before deletion for broadcast
      const analyses = await analysisService.getAllAnalyses();
      const analysisToDelete = analyses[sanitizedFileName];

      await analysisService.deleteAnalysis(sanitizedFileName);

      logger.info(
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
      handleError(res, error, 'deleting analysis');
    }
  }

  static async getAnalysisContent(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;
    const { version } = req.query;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'getAnalysisContent', fileName: sanitizedFileName, version },
      'Getting analysis content',
    );

    try {
      let content;

      if (version !== undefined) {
        // Get version-specific content
        const versionNumber = parseInt(version, 10);
        if (isNaN(versionNumber) || versionNumber < 0) {
          logger.warn(
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

      logger.info(
        { action: 'getAnalysisContent', fileName: sanitizedFileName, version },
        'Analysis content retrieved',
      );

      res.set('Content-Type', 'text/plain');
      res.send(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(
          { action: 'getAnalysisContent', fileName: sanitizedFileName },
          'Analysis file not found',
        );
        return res.status(404).json({
          error: `Analysis file ${sanitizedFileName} not found`,
        });
      }
      handleError(res, error, 'getting analysis content');
    }
  }

  static async updateAnalysis(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;
    const { content } = req.body;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    if (!content) {
      logger.warn(
        { action: 'updateAnalysis', fileName: sanitizedFileName },
        'Update failed: no content provided',
      );
      return res.status(400).json({
        error: 'Content is required',
      });
    }

    if (typeof content !== 'string') {
      logger.warn(
        {
          action: 'updateAnalysis',
          fileName: sanitizedFileName,
          contentType: typeof content,
        },
        'Update failed: invalid content type',
      );
      return res.status(400).json({
        error: 'Content must be a string',
      });
    }

    logger.info(
      { action: 'updateAnalysis', fileName: sanitizedFileName },
      'Updating analysis',
    );

    try {
      const result = await analysisService.updateAnalysis(sanitizedFileName, {
        content,
      });

      logger.info(
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
      handleError(res, error, 'updating analysis');
    }
  }

  static async renameAnalysis(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;
    const { newFileName } = req.body;

    // Sanitize both filenames to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    if (!newFileName) {
      logger.warn(
        { action: 'renameAnalysis', fileName: sanitizedFileName },
        'Rename failed: no new filename provided',
      );
      return res.status(400).json({
        error: 'newFileName is required',
      });
    }

    if (typeof newFileName !== 'string') {
      logger.warn(
        {
          action: 'renameAnalysis',
          fileName: sanitizedFileName,
          newFileNameType: typeof newFileName,
        },
        'Rename failed: invalid newFileName type',
      );
      return res.status(400).json({
        error: 'newFileName must be a string',
      });
    }

    const sanitizedNewFileName = sanitizeAndValidateFilename(newFileName);

    logger.info(
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

      logger.info(
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
      handleError(res, error, 'renaming analysis');
    }
  }

  static async getLogs(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'getLogs', fileName: sanitizedFileName, page, limit },
      'Getting analysis logs',
    );

    try {
      const logs = await analysisService.getLogs(
        sanitizedFileName,
        page,
        limit,
      );

      logger.info(
        {
          action: 'getLogs',
          fileName: sanitizedFileName,
          count: logs.logs?.length,
        },
        'Logs retrieved',
      );

      res.json(logs);
    } catch (error) {
      handleError(res, error, 'getting logs');
    }
  }

  static async downloadLogs(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;
    const { timeRange } = req.query;

    if (!fileName) {
      logger.warn(
        { action: 'downloadLogs' },
        'Download failed: missing fileName',
      );
      return res.status(400).json({ error: 'fileName is required' });
    }

    if (!timeRange) {
      logger.warn(
        { action: 'downloadLogs', fileName },
        'Download failed: missing timeRange',
      );
      return res.status(400).json({ error: 'timeRange is required' });
    }

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    // Validate time range
    if (!analysisService.validateTimeRange(timeRange)) {
      logger.warn(
        { action: 'downloadLogs', fileName: sanitizedFileName, timeRange },
        'Download failed: invalid time range',
      );
      return res.status(400).json({
        error: 'Invalid time range. Must be one of: 1h, 24h, 7d, 30d, all',
      });
    }

    logger.info(
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
        validatePath(expectedLogFile, config.paths.analysis);

        // Verify the file exists before attempting to serve it
        try {
          await fs.access(expectedLogFile);
        } catch (error) {
          if (error.code === 'ENOENT') {
            logger.warn(
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

        logger.info(
          { action: 'downloadLogs', fileName: sanitizedFileName, timeRange },
          'Streaming log file',
        );

        // Stream the file directly - no memory loading
        return res.sendFile(expectedLogFile, (err) => {
          if (err && !res.headersSent) {
            logger.error(
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
      validatePath(analysisLogsDir, config.paths.analysis);

      // Create a temporary file in the correct logs directory with sanitized filename
      const tempLogFile = path.join(
        analysisLogsDir,
        `${sanitize(path.parse(sanitizedFileName).name)}_${sanitize(timeRange)}_temp.log`,
      );

      // Validate that the temp file path is within the expected directory
      validatePath(tempLogFile, analysisLogsDir);

      try {
        await safeWriteFile(tempLogFile, content);

        // Set the download filename using headers with sanitized name
        const downloadFilename = `${sanitize(path.parse(sanitizedFileName).name)}.log`;
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${downloadFilename}"`,
        );
        res.setHeader('Content-Type', 'text/plain');

        logger.info(
          { action: 'downloadLogs', fileName: sanitizedFileName, timeRange },
          'Sending filtered log file',
        );

        // Send the file using the full tempLogFile path
        res.sendFile(tempLogFile, (err) => {
          // Clean up temp file using the already validated tempLogFile path
          safeUnlink(tempLogFile).catch((unlinkError) => {
            logger.error(
              {
                action: 'downloadLogs',
                fileName: sanitizedFileName,
                err: unlinkError,
              },
              'Error cleaning up temporary file',
            );
          });

          if (err && !res.headersSent) {
            logger.error(
              { action: 'downloadLogs', fileName: sanitizedFileName, err },
              'Error sending file',
            );
            return res.status(500).json({ error: 'Failed to download file' });
          }
        });
      } catch (writeError) {
        logger.error(
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
        logger.warn(
          { action: 'downloadLogs', fileName: sanitizedFileName },
          'Log file not found',
        );
        return res.status(404).json({ error: error.message });
      }

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        logger.warn(
          { action: 'downloadLogs', fileName: sanitizedFileName },
          'Invalid file path',
        );
        return res.status(400).json({ error: 'Invalid file path' });
      }

      handleError(res, error, 'downloading logs');
    }
  }

  static async clearLogs(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'clearLogs', fileName: sanitizedFileName },
      'Clearing analysis logs',
    );

    try {
      const result = await analysisService.clearLogs(sanitizedFileName);

      logger.info(
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
      handleError(res, error, 'clearing logs');
    }
  }

  static async downloadAnalysis(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;
    const { version } = req.query;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'downloadAnalysis', fileName: sanitizedFileName, version },
      'Downloading analysis',
    );

    try {
      let content;
      if (version && version !== '0') {
        // Download specific version
        const versionNumber = parseInt(version, 10);
        if (isNaN(versionNumber) || versionNumber < 1) {
          logger.warn(
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

      logger.info(
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
      handleError(res, error, 'downloading analysis');
    }
  }

  static async getVersions(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'getVersions', fileName: sanitizedFileName },
      'Getting analysis versions',
    );

    try {
      const versions = await analysisService.getVersions(sanitizedFileName);

      logger.info(
        {
          action: 'getVersions',
          fileName: sanitizedFileName,
          count: versions.length,
        },
        'Versions retrieved',
      );

      res.json(versions);
    } catch (error) {
      handleError(res, error, 'getting versions');
    }
  }

  static async rollbackToVersion(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;
    const { version } = req.body;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    if (!version || isNaN(parseInt(version, 10))) {
      logger.warn(
        { action: 'rollbackToVersion', fileName: sanitizedFileName, version },
        'Rollback failed: invalid version number',
      );
      return res
        .status(400)
        .json({ error: 'Valid version number is required' });
    }

    const versionNumber = parseInt(version, 10);

    logger.info(
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

      logger.info(
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
      handleError(res, error, 'rolling back analysis');
    }
  }

  static async updateEnvironment(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;
    const { env } = req.body;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    if (!env || typeof env !== 'object') {
      logger.warn(
        { action: 'updateEnvironment', fileName: sanitizedFileName },
        'Update failed: invalid environment variables',
      );
      return res.status(400).json({
        error: 'Environment variables must be provided as an object',
      });
    }

    logger.info(
      { action: 'updateEnvironment', fileName: sanitizedFileName },
      'Updating environment variables',
    );

    try {
      const result = await analysisService.updateEnvironment(
        sanitizedFileName,
        env,
      );

      logger.info(
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
      handleError(res, error, 'updating environment');
    }
  }

  static async getEnvironment(req, res) {
    const logger =
      req.logger?.child({ controller: 'AnalysisController' }) || console;
    const { fileName } = req.params;

    // Sanitize the fileName to prevent path traversal
    const sanitizedFileName = sanitizeAndValidateFilename(fileName);

    logger.info(
      { action: 'getEnvironment', fileName: sanitizedFileName },
      'Getting environment variables',
    );

    try {
      const env = await analysisService.getEnvironment(sanitizedFileName);

      logger.info(
        { action: 'getEnvironment', fileName: sanitizedFileName },
        'Environment variables retrieved',
      );

      res.json(env);
    } catch (error) {
      handleError(res, error, 'getting environment');
    }
  }
}

export default AnalysisController;

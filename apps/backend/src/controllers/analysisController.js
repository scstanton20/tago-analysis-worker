// backend/src/controllers/analysisController.js
import { analysisService } from '../services/analysisService.js';
import { sseManager } from '../utils/sse.js';
import path from 'path';
import config from '../config/default.js';
import { promises as fs } from 'fs';
import sanitize from 'sanitize-filename';
import { safeWriteFile, safeUnlink } from '../utils/safePath.js';

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
    try {
      if (!req.files || !req.files.analysis) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const analysis = req.files.analysis;
      const teamId = req.body.teamId;
      const targetFolderId = req.body.targetFolderId || null;

      const result = await analysisService.uploadAnalysis(
        analysis,
        teamId,
        targetFolderId,
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
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getAnalyses(req, res) {
    try {
      const allAnalyses = await analysisService.getAllAnalyses();

      // Admin users can see all analyses
      if (req.user.role === 'admin') {
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

      res.json(filteredAnalyses);
    } catch (error) {
      console.error('List analyses error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async runAnalysis(req, res) {
    try {
      const { fileName } = req.params;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      const result = await analysisService.runAnalysis(sanitizedFileName);

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
      console.error('Run analysis error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async stopAnalysis(req, res) {
    try {
      const { fileName } = req.params;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      const result = await analysisService.stopAnalysis(sanitizedFileName);

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
      console.error('Stop analysis error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async deleteAnalysis(req, res) {
    try {
      const { fileName } = req.params;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      // Get analysis data before deletion for broadcast
      const analyses = await analysisService.getAllAnalyses();
      const analysisToDelete = analyses[sanitizedFileName];

      await analysisService.deleteAnalysis(sanitizedFileName);

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
      console.error('Delete analysis error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async getAnalysisContent(req, res) {
    try {
      const { fileName } = req.params;
      const { version } = req.query;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      try {
        let content;

        if (version !== undefined) {
          // Get version-specific content
          const versionNumber = parseInt(version, 10);
          if (isNaN(versionNumber) || versionNumber < 0) {
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

        res.set('Content-Type', 'text/plain');
        res.send(content);
      } catch (error) {
        console.error('Error getting analysis content:', error);
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            error: `Analysis file ${sanitizedFileName} not found`,
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Controller error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({
        error: error.message,
      });
    }
  }

  static async updateAnalysis(req, res) {
    try {
      const { fileName } = req.params;
      const { content } = req.body;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      if (!content) {
        console.warn('No content provided in request body');
        return res.status(400).json({
          error: 'Content is required',
        });
      }

      if (typeof content !== 'string') {
        console.warn('Invalid content type:', typeof content);
        return res.status(400).json({
          error: 'Content must be a string',
        });
      }

      const result = await analysisService.updateAnalysis(sanitizedFileName, {
        content,
      });

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
      console.error('Controller error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({
        error: error.message,
      });
    }
  }

  static async renameAnalysis(req, res) {
    try {
      const { fileName } = req.params;
      const { newFileName } = req.body;

      // Sanitize both filenames to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);
      const sanitizedNewFileName = sanitizeAndValidateFilename(newFileName);

      if (!newFileName) {
        console.warn('No new filename provided in request body');
        return res.status(400).json({
          error: 'newFileName is required',
        });
      }

      if (typeof newFileName !== 'string') {
        console.warn('Invalid content type:', typeof newFileName);
        return res.status(400).json({
          error: 'newFileName must be a string',
        });
      }

      const result = await analysisService.renameAnalysis(
        sanitizedFileName,
        sanitizedNewFileName,
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
      console.error('Rename analysis error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async getLogs(req, res) {
    try {
      const { fileName } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 100;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      const logs = await analysisService.getLogs(
        sanitizedFileName,
        page,
        limit,
      );
      res.json(logs);
    } catch (error) {
      console.error('Get logs error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async downloadLogs(req, res) {
    try {
      const { fileName } = req.params;
      const { timeRange } = req.query;

      if (!fileName) {
        return res.status(400).json({ error: 'fileName is required' });
      }

      if (!timeRange) {
        return res.status(400).json({ error: 'timeRange is required' });
      }

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      // Validate time range
      if (!analysisService.validateTimeRange(timeRange)) {
        return res.status(400).json({
          error: 'Invalid time range. Must be one of: 1h, 24h, 7d, 30d, all',
        });
      }

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

        // Stream the file directly - no memory loading
        return res.sendFile(expectedLogFile, (err) => {
          if (err && !res.headersSent) {
            console.error('Error streaming log file:', err);
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

        // Send the file using the full tempLogFile path
        res.sendFile(tempLogFile, (err) => {
          // Clean up temp file using the already validated tempLogFile path
          safeUnlink(tempLogFile).catch((unlinkError) => {
            console.error('Error cleaning up temporary file:', unlinkError);
          });

          if (err && !res.headersSent) {
            return res.status(500).json({ error: 'Failed to download file' });
          }
        });
      } catch (writeError) {
        console.error('Error writing temporary file:', writeError);
        return res
          .status(500)
          .json({ error: 'Failed to generate download file' });
      }
    } catch (error) {
      console.error('Download logs error:', error);

      if (error.message.includes('Log file not found')) {
        return res.status(404).json({ error: error.message });
      }

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async clearLogs(req, res) {
    try {
      const { fileName } = req.params;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      const result = await analysisService.clearLogs(sanitizedFileName);

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
      console.error('Clear logs error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async downloadAnalysis(req, res) {
    try {
      const { fileName } = req.params;
      const { version } = req.query;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      let content;
      if (version && version !== '0') {
        // Download specific version
        const versionNumber = parseInt(version, 10);
        if (isNaN(versionNumber) || versionNumber < 1) {
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
      console.error('Download analysis error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename') ||
        error.message.includes('not found')
      ) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async getVersions(req, res) {
    try {
      const { fileName } = req.params;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      const versions = await analysisService.getVersions(sanitizedFileName);
      res.json(versions);
    } catch (error) {
      console.error('Get versions error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async rollbackToVersion(req, res) {
    try {
      const { fileName } = req.params;
      const { version } = req.body;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      if (!version || isNaN(parseInt(version, 10))) {
        return res
          .status(400)
          .json({ error: 'Valid version number is required' });
      }

      const versionNumber = parseInt(version, 10);
      const result = await analysisService.rollbackToVersion(
        sanitizedFileName,
        versionNumber,
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
      console.error('Rollback analysis error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename') ||
        error.message.includes('not found')
      ) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async updateEnvironment(req, res) {
    try {
      const { fileName } = req.params;
      const { env } = req.body;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      if (!env || typeof env !== 'object') {
        return res.status(400).json({
          error: 'Environment variables must be provided as an object',
        });
      }

      const result = await analysisService.updateEnvironment(
        sanitizedFileName,
        env,
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
      console.error('Update environment error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({ error: error.message });
    }
  }

  static async getEnvironment(req, res) {
    try {
      const { fileName } = req.params;

      // Sanitize the fileName to prevent path traversal
      const sanitizedFileName = sanitizeAndValidateFilename(fileName);

      const env = await analysisService.getEnvironment(sanitizedFileName);
      res.json(env);
    } catch (error) {
      console.error('Get environment error:', error);

      if (
        error.message.includes('Path traversal') ||
        error.message.includes('Invalid filename')
      ) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      res.status(500).json({ error: error.message });
    }
  }
}

export default AnalysisController;

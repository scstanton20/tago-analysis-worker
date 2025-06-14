// backend/src/controllers/analysisController.js
import { analysisService } from '../services/analysisService.js';
import { broadcastUpdate, broadcastRefresh } from '../utils/websocket.js';
import path from 'path';
import config from '../config/default.js';
import { promises as fs } from 'fs';

const analysisController = {
  async uploadAnalysis(req, res) {
    try {
      if (!req.files || !req.files.analysis) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const analysis = req.files.analysis;
      const type = req.body.type || 'listener';

      const result = await analysisService.uploadAnalysis(analysis, type);

      // Broadcast the complete analysis object
      broadcastUpdate('analysisCreated', { analysis: result.analysisName });
      await broadcastRefresh();
      res.json(result);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getAnalyses(_req, res) {
    try {
      const analyses = await analysisService.getAllAnalyses();
      res.json(analyses);
    } catch (error) {
      console.error('List analyses error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async runAnalysis(req, res) {
    try {
      const { fileName } = req.params;
      const { type } = req.body;

      const result = await analysisService.runAnalysis(fileName, type);

      // Broadcast status change
      broadcastUpdate('status', {
        fileName,
        status: 'running',
        enabled: true,
        type,
      });

      res.json(result);
    } catch (error) {
      console.error('Run analysis error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  async stopAnalysis(req, res) {
    try {
      const { fileName } = req.params;
      const result = await analysisService.stopAnalysis(fileName);

      // Broadcast status change
      broadcastUpdate('status', {
        fileName,
        status: 'stopped',
        enabled: false,
      });

      res.json(result);
    } catch (error) {
      console.error('Stop analysis error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  async deleteAnalysis(req, res) {
    try {
      const { fileName } = req.params;
      await analysisService.deleteAnalysis(fileName);

      // Broadcast deletion
      broadcastUpdate('analysisDeleted', { fileName });

      res.json({ success: true });
    } catch (error) {
      console.error('Delete analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getAnalysisContent(req, res) {
    try {
      const { fileName } = req.params;
      // console.log('Getting content for analysis:', fileName);

      try {
        const content = await analysisService.getAnalysisContent(fileName);
        res.set('Content-Type', 'text/plain');
        res.send(content);
      } catch (error) {
        console.error('Error getting analysis content:', error);
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            error: `Analysis file ${fileName} not found`,
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({
        error: error.message,
      });
    }
  },

  async updateAnalysis(req, res) {
    try {
      const { fileName } = req.params;
      const { content } = req.body;

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

      const result = await analysisService.updateAnalysis(fileName, content);

      // Broadcast update with restart status
      broadcastUpdate('analysisUpdated', {
        fileName,
        status: 'updated',
        restarted: result.restarted,
      });

      res.json({
        success: true,
        message: 'Analysis updated successfully',
        restarted: result.restarted,
      });
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({
        error: error.message,
      });
    }
  },

  async renameAnalysis(req, res) {
    try {
      const { fileName } = req.params;
      const { newFileName } = req.body;

      if (!newFileName) {
        console.warn('No new filename provided in request body');
        return res.status(400).json({
          error: 'newFileName is required',
        });
      }

      if (typeof newFileName !== 'string') {
        console.warn('Invalid content type:', typeof newFileName);
        return res.status(400).json({
          error: 'newFIleName must be a string',
        });
      }

      const result = await analysisService.renameAnalysis(
        fileName,
        newFileName,
      );

      // Broadcast update with restart status
      broadcastUpdate('analysisRenamed', {
        oldFileName: fileName,
        newFileName: newFileName,
        status: 'updated',
        restarted: result.restarted,
      });

      res.json({
        success: true,
        message: 'Analysis updated successfully',
        restarted: result.restarted,
      });
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({
        error: error.message,
      });
    }
  },

  async getLogs(req, res) {
    try {
      const { fileName } = req.params;
      const { page = 1, limit = 100 } = req.query;

      const result = await analysisService.getLogs(
        fileName,
        parseInt(page),
        parseInt(limit),
      );

      res.json({
        logs: result.logs,
        hasMore: result.hasMore,
        totalCount: result.totalCount,
        source: result.source,
        page: parseInt(page),
        limit: parseInt(limit),
      });
    } catch (error) {
      console.error('Get logs error:', error);
      if (error.message === 'Analysis not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async getInitialLogs(req, res) {
    try {
      const { fileName } = req.params;
      const { limit = 50 } = req.query;

      const result = await analysisService.getInitialLogs(
        fileName,
        parseInt(limit),
      );

      res.json(result);
    } catch (error) {
      console.error('Get initial logs error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async downloadLogs(req, res) {
    try {
      const { fileName } = req.params;
      const { timeRange } = req.query;

      if (!fileName) {
        return res.status(400).json({ error: 'fileName is required' });
      }

      if (!timeRange) {
        return res.status(400).json({ error: 'timeRange is required' });
      }

      // Validate time range
      if (!analysisService.validateTimeRange(timeRange)) {
        return res.status(400).json({
          error: 'Invalid time range. Must be one of: 1h, 24h, 7d, 30d, all',
        });
      }

      // Get logs from analysisService
      const { logFile, content } = await analysisService.getLogsForDownload(
        fileName,
        timeRange,
      );

      // Define log path inside the analysis subfolder
      const analysisLogsDir = path.join(
        config.paths.analysis,
        fileName,
        'logs',
      );
      await fs.mkdir(analysisLogsDir, { recursive: true });

      if (timeRange === 'all') {
        // Directly download the full log file
        return res.download(
          logFile,
          `${path.parse(fileName).name}.log`,
          (err) => {
            if (err && !res.headersSent) {
              return res.status(500).json({ error: 'Failed to download file' });
            }
          },
        );
      }

      // Create a temporary file in the correct logs directory
      const tempLogFile = path.join(
        analysisLogsDir,
        `${path.parse(fileName).name}_${timeRange}_temp.log`,
      );

      try {
        await fs.writeFile(tempLogFile, content);

        // Send the file
        res.download(tempLogFile, `${path.parse(fileName).name}.log`, (err) => {
          fs.unlink(tempLogFile).catch(console.error); // Clean up temp file

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

      res.status(500).json({ error: error.message });
    }
  },
  async clearLogs(req, res) {
    try {
      const { fileName } = req.params;

      if (!fileName) {
        return res.status(400).json({ error: 'fileName is required' });
      }

      const result = await analysisService.clearLogs(fileName);

      // Broadcast to all clients that logs were cleared
      broadcastUpdate('logsCleared', {
        fileName,
        status: 'cleared',
        totalCount: 0,
      });

      res.json(result);
    } catch (error) {
      console.error('Clear logs error:', error);
      res.status(500).json({ error: error.message });
    }
  },
  async downloadAnalysis(req, res) {
    try {
      const { fileName } = req.params;

      if (!fileName) {
        return res.status(400).json({ error: 'fileName is required' });
      }

      // Define the path to the analysis file
      const analysisPath = path.join(
        config.paths.analysis,
        fileName,
        'index.cjs',
      );

      try {
        // Check if file exists
        await fs.access(analysisPath);

        // Set headers for file download
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${fileName}.cjs`,
        );

        // Stream the file to response
        res.download(analysisPath, `${fileName}.cjs`, (err) => {
          if (err && !res.headersSent) {
            return res.status(500).json({ error: 'Failed to download file' });
          }
        });
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({ error: 'Analysis file not found' });
        }
        throw error;
      }
    } catch (error) {
      console.error('Download analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

const environmentController = {
  async updateEnvironment(req, res) {
    try {
      const { fileName } = req.params;
      const { env } = req.body;

      if (!env || typeof env !== 'object') {
        return res.status(400).json({
          error: 'Environment variables must be provided as an object',
        });
      }

      const result = await analysisService.updateEnvironment(fileName, env);

      // Broadcast update with restart status
      broadcastUpdate('environmentUpdated', {
        fileName,
        status: 'updated',
        restarted: result.restarted,
      });

      res.json({
        success: true,
        message: 'Environment updated successfully',
        restarted: result.restarted,
      });
    } catch (error) {
      console.error('Update environment error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getEnvironment(req, res) {
    try {
      const { fileName } = req.params;
      const env = await analysisService.getEnvironment(fileName);
      res.json(env);
      console.log('Getting ENV content for analysis:', fileName);
    } catch (error) {
      console.error('Get environment error:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

export const {
  uploadAnalysis,
  getAnalyses,
  runAnalysis,
  stopAnalysis,
  deleteAnalysis,
  getAnalysisContent,
  updateAnalysis,
  renameAnalysis,
  getLogs,
  downloadLogs,
  clearLogs,
  downloadAnalysis,
  updateEnvironment,
  getEnvironment,
} = {
  ...analysisController,
  ...environmentController,
};

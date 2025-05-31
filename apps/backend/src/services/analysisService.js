import path from 'path';
import { promises as fs } from 'fs';
import config from '../config/default.js';
import { encrypt, decrypt } from '../utils/cryptoUtils.js';
import AnalysisProcess from '../models/analysisProcess.js';
import ConnectionMonitor from '../models/connectionMonitor.js';

class AnalysisService {
  constructor() {
    this.analyses = new Map();
    this.connectionMonitors = new Map();
  }
  validateTimeRange(timeRange) {
    const validRanges = ['1h', '24h', '7d', '30d', 'all'];
    return validRanges.includes(timeRange);
  }

  async ensureDirectories() {
    await fs.mkdir(config.paths.analysis, { recursive: true });
    await fs.mkdir(config.paths.config, { recursive: true });
  }

  async saveConfig() {
    const configuration = {};
    this.analyses.forEach((analysis, analysisName) => {
      configuration[analysisName] = {
        type: analysis.type,
        enabled: analysis.enabled,
        status: analysis.status,
        lastRun: analysis.lastRun,
        startTime: analysis.startTime,
        connectionState: {
          shouldRestart: analysis.connectionState?.shouldRestart,
          disconnectedAt: analysis.connectionState?.disconnectedAt,
          history: {
            lastDisconnected:
              analysis.connectionState?.history?.lastDisconnected,
            lastRestored: analysis.connectionState?.history?.lastRestored,
          },
        },
      };
    });

    await fs.writeFile(
      path.join(config.paths.config, 'analyses-config.json'),
      JSON.stringify(configuration, null, 2),
    );
  }

  async createAnalysisDirectories(analysisName) {
    const basePath = path.join(config.paths.analysis, analysisName);
    await Promise.all([
      fs.mkdir(basePath, { recursive: true }),
      fs.mkdir(path.join(basePath, 'env'), { recursive: true }),
      fs.mkdir(path.join(basePath, 'logs'), { recursive: true }),
    ]);
    return basePath;
  }

  async uploadAnalysis(file, type) {
    const analysisName = path.parse(file.name).name;
    const basePath = await this.createAnalysisDirectories(analysisName);
    const filePath = path.join(basePath, 'index.cjs');

    await file.mv(filePath);
    const analysis = new AnalysisProcess(analysisName, type, this);
    this.analyses.set(analysisName, analysis);
    await this.initializeConnectionMonitor(analysisName, type);

    const envFile = path.join(basePath, 'env', '.env');
    await fs.writeFile(envFile, '', 'utf8');

    await this.saveConfig();

    return { analysisName };
  }

  async getAllAnalyses() {
    const analysisDirectories = await fs.readdir(config.paths.analysis);

    return Promise.all(
      analysisDirectories.map(async (dirName) => {
        const indexPath = path.join(
          config.paths.analysis,
          dirName,
          'index.cjs',
        );
        try {
          const stats = await fs.stat(indexPath);
          const analysis = this.analyses.get(dirName);

          if (!this.analyses.has(dirName)) {
            this.analyses.set(dirName, analysis);
          }

          return {
            name: dirName,
            size: stats.size,
            created: stats.birthtime,
            type: analysis?.type || 'listener',
            status: analysis?.status || 'stopped',
            enabled: analysis?.enabled || false,
            lastRun: analysis?.lastRun,
            startTime: analysis?.startTime,
          };
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      }),
    ).then((results) => results.filter(Boolean));
  }

  async renameAnalysis(analysisName, newFileName) {
    try {
      const analysis = this.analyses.get(analysisName);

      if (!analysis) {
        throw new Error(`Analysis '${analysisName}' not found`);
      }

      const wasRunning = analysis && analysis.status === 'running';

      // If running, stop the analysis first
      if (wasRunning) {
        await this.stopAnalysis(analysisName);
        await this.addLog(
          analysisName,
          'Stopping analysis for rename operation',
        );
      }

      // Rename the directory
      const oldFilePath = path.join(config.paths.analysis, analysisName);
      const newFilePath = path.join(config.paths.analysis, newFileName);

      // Make sure the target directory doesn't already exist
      try {
        await fs.access(newFilePath);
        throw new Error(
          `Cannot rename: target '${newFileName}' already exists`,
        );
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        // ENOENT error means file doesn't exist, which is what we want
      }

      // Perform the rename
      await fs.rename(oldFilePath, newFilePath);

      // Update the analysis object and maps
      this.analyses.delete(analysisName);

      // Use the setter to update the name (which updates the logFile path)
      analysis.analysisName = newFileName;

      // Add the analysis with the new name
      this.analyses.set(newFileName, analysis);

      // Update the connection monitor if it exists
      const monitor = this.connectionMonitors.get(analysisName);
      if (monitor) {
        this.connectionMonitors.delete(analysisName);
        monitor.analysisName = newFileName;
        this.connectionMonitors.set(newFileName, monitor);
      }

      // Log the rename operation
      await this.addLog(
        newFileName,
        `Analysis renamed from '${analysisName}' to '${newFileName}'`,
      );

      // Save updated config to analyses-config.json
      await this.saveConfig();

      // If it was running before, restart it
      if (wasRunning) {
        await this.runAnalysis(newFileName, analysis.type);
        await this.addLog(
          newFileName,
          'Analysis restarted after rename operation',
        );
      }

      return {
        success: true,
        restarted: wasRunning,
      };
    } catch (error) {
      console.error('Error renaming analysis:', error);
      throw new Error(`Failed to rename analysis: ${error.message}`);
    }
  }

  async addLog(analysisName, message) {
    const analysis = this.analyses.get(analysisName);
    if (analysis) {
      await analysis.addLog(message);
    }
  }

  getProcessStatus(analysisName) {
    const analysis = this.analyses.get(analysisName);
    return analysis ? analysis.status : 'stopped';
  }

  updateConnectionState(analysisName, state) {
    const analysis = this.analyses.get(analysisName);
    if (analysis) {
      analysis.connectionState = state;
      return this.saveConfig();
    }
  }
  async runAnalysis(analysisName, type) {
    let analysis = this.analyses.get(analysisName);

    if (!analysis) {
      console.log(`Creating new analysis instance: ${analysisName}`);
      analysis = new AnalysisProcess(analysisName, type, this);
      this.analyses.set(analysisName, analysis);
      await this.initializeConnectionMonitor(analysisName, type);
      await this.saveConfig();
    }

    await analysis.start();
    return { success: true, status: analysis.status, logs: analysis.logs };
  }

  async stopAnalysis(analysisName) {
    const analysis = this.analyses.get(analysisName);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    await analysis.stop();
    return { success: true };
  }

  async loadEnvironmentVariables(analysisName) {
    const envFile = path.join(
      config.paths.analysis,
      analysisName,
      'env',
      '.env',
    );

    try {
      const envContent = await fs.readFile(envFile, 'utf8');
      const envVariables = {};

      envContent.split('\n').forEach((line) => {
        const [key, encryptedValue] = line.split('=');
        if (key && encryptedValue) {
          envVariables[key] = decrypt(encryptedValue, process.env.SECRET_KEY);
        }
      });

      return envVariables;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {}; // Return empty object if the file does not exist
      }
      throw error;
    }
  }

  async getLogs(analysisName, page = 1, limit = 100) {
    try {
      const logFile = path.join(
        config.paths.analysis,
        analysisName,
        'logs',
        'analysis.log',
      );

      // Ensure the log file exists
      await fs.access(logFile);

      const content = await fs.readFile(logFile, 'utf8');
      if (!content.trim()) {
        return []; // Return empty array if there are no logs
      }

      const allLogs = content
        .trim()
        .split('\n')
        .map((line) => {
          const match = line.match(/\[(.*?)\] (.*)/);
          return match ? { timestamp: match[1], message: match[2] } : null;
        })
        .filter(Boolean)
        .reverse(); // Most recent logs first

      // Paginate logs
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      return allLogs.slice(startIndex, endIndex);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // Return empty array if the file doesn't exist
      }
      console.error('Error retrieving logs:', error);
      throw new Error(`Failed to retrieve logs: ${error.message}`);
    }
  }
  async deleteAnalysis(analysisName) {
    const monitor = this.connectionMonitors.get(analysisName);
    if (monitor) {
      monitor.stopMonitoring();
      this.connectionMonitors.delete(analysisName);
    }

    const analysis = this.analyses.get(analysisName);
    if (analysis) {
      await analysis.stop();
    }

    const analysisPath = path.join(config.paths.analysis, analysisName);
    try {
      await fs.rm(analysisPath, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    this.analyses.delete(analysisName);
    await this.saveConfig();

    return { message: 'Analysis deleted successfully' };
  }

  async initialize() {
    await this.ensureDirectories();

    let configuration = {};
    try {
      const configData = await fs.readFile(
        path.join(config.paths.config, 'analyses-config.json'),
        'utf8',
      );
      configuration = JSON.parse(configData);
      console.log('Loaded analysis configuration');
    } catch {
      console.log('No existing config found, creating new');
      await this.saveConfig();
    }

    const analysisDirectories = await fs.readdir(config.paths.analysis);
    await Promise.all(
      analysisDirectories.map(async (dirName) => {
        try {
          const indexPath = path.join(
            config.paths.analysis,
            dirName,
            'index.cjs',
          );
          const stats = await fs.stat(indexPath);
          if (stats.isFile()) {
            await this.initializeAnalysis(dirName, configuration[dirName]);
          }
        } catch (error) {
          console.error(`Error loading analysis ${dirName}:`, error);
        }
      }),
    );
  }
  getConfig() {
    const configuration = {};
    this.analyses.forEach((analysis, analysisName) => {
      configuration[analysisName] = {
        type: analysis.type,
        enabled: analysis.enabled,
        status: analysis.status,
      };
    });
    return configuration;
  }

  async initializeConnectionMonitor(analysisName, type) {
    let monitor = this.connectionMonitors.get(analysisName);
    if (!monitor) {
      monitor = new ConnectionMonitor(analysisName, type, {
        addLog: async (analysisName, message) =>
          this.addLog(analysisName, message),
        stopAnalysis: async (analysisName) => this.stopAnalysis(analysisName),
        runAnalysis: async (analysisName, type) =>
          this.runAnalysis(analysisName, type),
        updateConnectionState: async (analysisName, state) =>
          this.updateConnectionState(analysisName, state),
        getProcessStatus: (analysisName) => this.getProcessStatus(analysisName),
        getConfig: () => this.getConfig(),
      });
      this.connectionMonitors.set(analysisName, monitor);
      monitor.startMonitoring();
    }
    return monitor;
  }

  async initializeAnalysis(analysisName, analysisConfig = {}) {
    const defaultConfig = {
      type: 'listener',
      enabled: false,
      status: 'stopped',
      lastRun: null,
      startTime: null,
      connectionState: {
        shouldRestart: false,
        disconnectedAt: null,
        history: {
          lastDisconnected: null,
          lastRestored: null,
        },
      },
    };

    const fullConfig = { ...defaultConfig, ...analysisConfig };
    const analysis = new AnalysisProcess(analysisName, fullConfig.type, this);

    Object.assign(analysis, {
      enabled: fullConfig.enabled,
      status: fullConfig.status,
      lastRun: fullConfig.lastRun,
      startTime: fullConfig.startTime,
      connectionState: {
        ...analysis.connectionState,
        ...fullConfig.connectionState,
      },
    });

    try {
      const logFile = path.join(
        config.paths.analysis,
        analysisName,
        'logs',
        'analysis.log',
      );
      const logContent = await fs.readFile(logFile, 'utf8');
      analysis.logs = logContent
        .trim()
        .split('\n')
        .reverse()
        .slice(0, config.analysis.maxLogsInMemory)
        .map((line) => {
          const match = line.match(/\[(.*?)\] (.*)/);
          return match
            ? {
                timestamp: match[1],
                message: match[2],
              }
            : null;
        })
        .filter(Boolean);
    } catch {
      // No previous logs found, that's okay
    }

    this.analyses.set(analysisName, analysis);
    await this.initializeConnectionMonitor(analysisName, fullConfig.type);
  }

  async getAnalysisContent(analysisName) {
    try {
      const filePath = path.join(
        config.paths.analysis,
        analysisName,
        'index.cjs',
      );
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      console.error('Error reading analysis content:', error);
      throw new Error(`Failed to get analysis content: ${error.message}`);
    }
  }

  async updateAnalysis(analysisName, content) {
    try {
      const analysis = this.analyses.get(analysisName);
      const wasRunning = analysis && analysis.status === 'running';

      // If running, stop the analysis first
      if (wasRunning) {
        await this.stopAnalysis(analysisName);
        await this.addLog(analysisName, 'Analysis stopped to update content');
      }

      const filePath = path.join(
        config.paths.analysis,
        analysisName,
        'index.cjs',
      );
      await fs.writeFile(filePath, content, 'utf8');

      // If it was running before, restart it
      if (wasRunning) {
        await this.runAnalysis(analysisName, analysis.type);
        await this.addLog(analysisName, 'Analysis updated successfully');
      }

      return {
        success: true,
        restarted: wasRunning,
      };
    } catch (error) {
      console.error('Error updating analysis:', error);
      throw new Error(`Failed to update analysis: ${error.message}`);
    }
  }

  async getLogsForDownload(analysisName, timeRange) {
    try {
      const logFile = path.join(
        config.paths.analysis,
        analysisName,
        'logs',
        'analysis.log',
      );

      // Ensure the log file exists
      await fs.access(logFile);

      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.trim().split('\n');

      if (timeRange === 'all') {
        return { logFile, content };
      }

      // Filter logs based on timestamp
      const cutoffDate = new Date();
      switch (timeRange) {
        case '1h':
          cutoffDate.setHours(cutoffDate.getHours() - 1);
          break;
        case '24h':
          cutoffDate.setHours(cutoffDate.getHours() - 24);
          break;
        case '7d':
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          break;
        case '30d':
          cutoffDate.setDate(cutoffDate.getDate() - 30);
          break;
        default:
          throw new Error('Invalid time range specified');
      }

      const filteredLogs = lines.filter((line) => {
        const timestampMatch = line.match(/\[(.*?)\]/);
        if (timestampMatch) {
          const logDate = new Date(timestampMatch[1]);
          return logDate >= cutoffDate;
        }
        return false;
      });

      return { logFile, content: filteredLogs.join('\n') };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Log file not found for analysis: ${analysisName}`);
      }
      throw error;
    }
  }
  async getEnvironment(analysisName) {
    const envFile = path.join(
      config.paths.analysis,
      analysisName,
      'env',
      '.env',
    );
    try {
      const envContent = await fs.readFile(envFile, 'utf8');
      const envVariables = {};
      envContent.split('\n').forEach((line) => {
        const [key, encryptedValue] = line.split('=');
        if (key && encryptedValue) {
          envVariables[key] = decrypt(encryptedValue);
        }
      });
      return envVariables;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {}; // Return an empty object if the env file does not exist
      }
      throw error;
    }
  }
  async clearLogs(analysisName) {
    try {
      const logFilePath = path.join(
        config.paths.analysis,
        analysisName,
        'logs',
        'analysis.log',
      );

      // Check if the logs directory exists, create it if not
      const logsDir = path.dirname(logFilePath);
      await fs.mkdir(logsDir, { recursive: true });

      // Delete the existing log file if it exists
      try {
        await fs.unlink(logFilePath);
      } catch (error) {
        // Ignore if file doesn't exist
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Create a new empty log file
      await fs.writeFile(logFilePath, '', 'utf8');

      // Update in-memory logs for this analysis
      const analysis = this.analyses.get(analysisName);
      if (analysis) {
        analysis.logs = [];
        await this.addLog(analysisName, 'Log file cleared');
      }

      return { success: true, message: 'Logs cleared successfully' };
    } catch (error) {
      console.error('Error clearing logs:', error);
      throw new Error(`Failed to clear logs: ${error.message}`);
    }
  }
  async updateEnvironment(analysisName, env) {
    const envFile = path.join(
      config.paths.analysis,
      analysisName,
      'env',
      '.env',
    );
    const analysis = this.analyses.get(analysisName);
    const wasRunning = analysis && analysis.status === 'running';

    try {
      // If running, stop the analysis first
      if (wasRunning) {
        await this.stopAnalysis(analysisName);
        await this.addLog(
          analysisName,
          'Analysis stopped to update environment',
        );
      }

      const envContent = Object.entries(env)
        .map(([key, value]) => `${key}=${encrypt(value)}`)
        .join('\n');

      await fs.mkdir(path.dirname(envFile), { recursive: true });
      await fs.writeFile(envFile, envContent, 'utf8');

      // If it was running before, restart it
      if (wasRunning) {
        await this.runAnalysis(analysisName, analysis.type);
        await this.addLog(analysisName, 'Analysis updated successfully');
      }

      return {
        success: true,
        restarted: wasRunning,
      };
    } catch (error) {
      console.error('Error updating environment:', error);
      throw new Error(`Failed to update environment: ${error.message}`);
    }
  }
}

// Create and export a singleton instance
const analysisService = new AnalysisService();
export { analysisService, initializeAnalyses };

function initializeAnalyses() {
  return analysisService.initialize();
}

// Enhanced AnalysisProcess.js
import path from 'path';
import { promises as fs } from 'fs';
import { fork } from 'child_process';
import { sseManager } from '../utils/sse.js';
import config from '../config/default.js';
import { createChildLogger } from '../utils/logging/logger.js';
import pino from 'pino';

class AnalysisProcess {
  constructor(analysisName, type, service) {
    this._analysisName = analysisName;
    this.type = type;
    this.service = service;
    this.process = null;
    this.enabled = false;
    this.status = 'stopped';
    this.lastStartTime = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.logFile = path.join(
      config.paths.analysis,
      analysisName,
      'logs',
      'analysis.log',
    );

    // Enhanced log management
    this.logs = []; // In-memory buffer
    this.logSequence = 0; // Unique sequence number for each log
    this.totalLogCount = 0; // Total logs written to file
    this.maxMemoryLogs = config.analysis.maxLogsInMemory || 1000;

    // Health check management
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;

    // Create main logger for lifecycle events (not analysis output)
    this.logger = createChildLogger('analysis', {
      analysis: analysisName,
      type: this.type,
    });

    // Create dedicated file logger for analysis output only
    this.fileLogger = null; // Will be initialized in initializeLogState

    // Initialize file logger immediately for immediate availability
    this.initializeFileLogger();
  }

  get analysisName() {
    return this._analysisName;
  }

  set analysisName(newName) {
    const oldName = this._analysisName;
    this._analysisName = newName;
    this.logFile = path.join(
      config.paths.analysis,
      newName,
      'logs',
      'analysis.log',
    );

    // Update logger with new analysis name
    this.logger = createChildLogger('analysis', {
      analysis: newName,
      type: this.type,
    });

    // Recreate file logger with new path
    this.initializeFileLogger();

    this.logger.info(`Updated analysis name from ${oldName} to ${newName}`);
  }

  // Initialize the file logger for analysis output
  initializeFileLogger() {
    try {
      // Create directory if it doesn't exist
      const logsDir = path.dirname(this.logFile);
      fs.mkdir(logsDir, { recursive: true }).catch(() => {}); // Don't await, let it happen async

      // Create Pino write stream for this analysis log file
      const fileStream = pino.destination({
        dest: this.logFile,
        sync: false, // Async writes for better performance
        mkdir: true,
      });

      // Create a simple file-only logger
      this.fileLogger = pino(
        {
          timestamp: () => `,"time":"${new Date().toLocaleString()}"`,
          formatters: {
            level: () => ({}), // Remove level from file output
            log: (object) => ({ message: object.msg }), // Only keep the message
          },
          messageKey: 'msg',
        },
        fileStream,
      );
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize file logger');
      this.fileLogger = null;
    }
  }

  async addLog(message) {
    const timestamp = new Date().toLocaleString();
    const logEntry = {
      sequence: ++this.logSequence,
      timestamp,
      message,
      createdAt: Date.now(), // For efficient sorting
    };

    // Add to in-memory buffer (FIFO)
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxMemoryLogs) {
      this.logs.pop();
    }

    // Increment total count
    this.totalLogCount++;

    // Write analysis output ONLY to the file logger (not console/Loki)
    if (this.fileLogger) {
      this.fileLogger.info(`[${timestamp}] ${message}`);
    } else {
      // Fallback if file logger failed to initialize
      this.logger.warn(
        { message, logFile: this.logFile },
        'File logger not available, analysis output not saved to file',
      );
    }

    sseManager.broadcast({
      type: 'log',
      data: {
        fileName: this.analysisName,
        log: logEntry,
        totalCount: this.totalLogCount,
      },
    });
  }

  // Get logs from memory buffer
  getMemoryLogs(page = 1, limit = 100) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedLogs = this.logs.slice(startIndex, endIndex);

    return {
      logs: paginatedLogs,
      hasMore: endIndex < this.logs.length,
      totalInMemory: this.logs.length,
      totalCount: this.totalLogCount,
    };
  }

  // Initialize log count and sequence from existing file
  async initializeLogState() {
    // Initialize the file logger first
    this.initializeFileLogger();

    try {
      const stats = await fs.stat(this.logFile);

      // Check if file is too large (> 50MB)
      const maxFileSize = 50 * 1024 * 1024; // 50MB

      if (stats.size > maxFileSize) {
        const sizeMB = Math.round(stats.size / 1024 / 1024);
        this.logger.warn({
          analysisName: this.analysisName,
          fileSize: stats.size,
          sizeMB,
          maxSizeMB: Math.round(maxFileSize / 1024 / 1024),
          msg: `Log file is very large (${sizeMB}MB). Deleting and starting fresh.`,
        });

        // Delete the oversized log file
        await fs.unlink(this.logFile);

        // Start fresh
        this.totalLogCount = 0;
        this.logSequence = 0;
        this.logs = [];

        // Reinitialize file logger after deleting the file
        this.initializeFileLogger();

        // Log that we cleared the file
        await this.addLog(
          `Log file was too large and has been cleared. Starting fresh.`,
        );
      } else {
        // For normal-sized files, read as usual
        const content = await fs.readFile(this.logFile, 'utf8');
        const lines = content
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        this.totalLogCount = lines.length;
        this.logSequence = lines.length;

        // Load recent logs into memory
        const recentLines = lines.slice(-this.maxMemoryLogs);
        this.logs = recentLines
          .map((line, index) => {
            const match = line.match(/\[(.*?)\] (.*)/);
            return match
              ? {
                  sequence: this.logSequence - recentLines.length + index + 1,
                  timestamp: match[1],
                  message: match[2],
                  createdAt: new Date(match[1]).getTime(),
                }
              : null;
          })
          .filter(Boolean)
          .reverse();
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.error({
          err: error,
          analysisName: this.analysisName,
          msg: `Error initializing log state`,
        });
      }
      // File doesn't exist yet, start fresh
      this.totalLogCount = 0;
      this.logSequence = 0;
      this.logs = [];
    }
  }

  setupProcessHandlers() {
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    if (this.process.stdout) {
      this.process.stdout.on('data', this.handleOutput.bind(this, false));
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', this.handleOutput.bind(this, true));
    }

    this.process.once('exit', this.handleExit.bind(this));
  }

  handleOutput(isError, data) {
    const buffer = isError ? this.stderrBuffer : this.stdoutBuffer;
    const lines = data.toString().split('\n');

    lines.forEach((line, index) => {
      if (index === lines.length - 1) {
        if (isError) {
          this.stderrBuffer = line;
        } else {
          this.stdoutBuffer = line;
        }
      } else {
        const fullLine = (buffer + line).trim();
        if (fullLine) {
          // Check for SDK connection errors
          if (
            fullLine.includes(
              '¬ Connection was closed, trying to reconnect...',
            ) ||
            fullLine.includes('¬ Error :: Analysis not found or not active.')
          ) {
            this.logger.warn(
              'Tago SDK connection error detected - scheduling restart',
            );

            this.addLog('Tago connection lost - restarting process');
            setTimeout(() => {
              if (this.status === 'running') {
                this.restartProcess();
              }
            }, 5000);
          }
          this.addLog(isError ? `ERROR: ${fullLine}` : fullLine);
        }
        if (isError) {
          this.stderrBuffer = '';
        } else {
          this.stdoutBuffer = '';
        }
      }
    });
  }

  async start() {
    if (this.process) return;

    try {
      // Initialize log state before starting
      await this.initializeLogState();

      const filePath = path.join(
        config.paths.analysis,
        this.analysisName,
        'index.cjs',
      );

      this.logger.info(`Starting analysis process`);

      await this.addLog(`Node.js ${process.version}`);

      const storedEnv = this.service
        ? await this.service.getEnvironment(this.analysisName)
        : {};

      this.process = fork(filePath, [], {
        env: {
          ...process.env,
          ...config.process.env,
          ...storedEnv,
          STORAGE_BASE: config.storage.base,
        },
        stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      });

      if (!this.process) {
        throw new Error('Failed to start analysis process');
      }

      this.logger.info(`Analysis process started successfully`);

      this.setupProcessHandlers();
      this.updateStatus('running', true);
      await this.saveConfig();
    } catch (error) {
      this.logger.error({ err: error }, `Failed to start analysis process`);
      await this.addLog(`ERROR: ${error.message}`);
      throw error;
    }
  }

  updateStatus(status, enabled = false) {
    const previousStatus = this.status;
    this.status = status;
    this.enabled = enabled;

    if (this.type === 'listener' && status === 'running') {
      this.lastStartTime = new Date().toString();
    }

    this.logger.debug(`Status updated from ${previousStatus} to ${status}`);
  }

  async stop() {
    if (!this.process || this.status !== 'running') {
      return;
    }

    this.logger.info(`Stopping analysis process`);

    await this.addLog('Stopping analysis...');

    return new Promise((resolve) => {
      this.process.kill('SIGTERM');

      const forceKillTimeout = setTimeout(() => {
        if (this.process) {
          this.logger.warn(`Force stopping process after timeout`);
          this.addLog('Force stopping process...').then(() => {
            this.process.kill('SIGKILL');
          });
        }
      }, config.analysis.forceKillTimeout);

      this.process.once('exit', () => {
        clearTimeout(forceKillTimeout);
        this.updateStatus('stopped', false);
        this.logger.info(`Analysis process stopped successfully`);
        this.addLog('Analysis stopped').then(() => {
          this.process = null;
          this.saveConfig().then(resolve);
        });
      });
    });
  }

  async saveConfig() {
    if (!this.service) {
      this.logger.error({
        analysisName: this.analysisName,
        msg: `Service is undefined for analysis`,
      });
      return;
    }
    return this.service.saveConfig();
  }

  async handleExit(code) {
    if (this.stdoutBuffer.trim()) {
      await this.addLog(this.stdoutBuffer.trim());
    }
    if (this.stderrBuffer.trim()) {
      await this.addLog(`ERROR: ${this.stderrBuffer.trim()}`);
    }

    this.logger.info(`Analysis process exited with code ${code}`);

    await this.addLog(`Process exited with code ${code}`);
    this.process = null;

    this.updateStatus('stopped', false);
    await this.saveConfig();

    // Auto-restart listeners that exit unexpectedly
    if (this.type === 'listener' && this.enabled && code !== 0) {
      this.logger.warn(`Listener exited unexpectedly, scheduling auto-restart`);
      await this.addLog(`Listener exited unexpectedly, auto-restarting...`);
      setTimeout(() => this.start(), config.analysis.autoRestartDelay || 5000);
    }
  }
}

export default AnalysisProcess;

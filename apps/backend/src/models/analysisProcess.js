// Enhanced AnalysisProcess.js
import path from 'path';
import { fork } from 'child_process';
import {
  safeMkdir,
  safeStat,
  safeUnlink,
  safeReadFile,
} from '../utils/safePath.js';
import { fileURLToPath } from 'url';
import { sseManager } from '../utils/sse.js';
import config from '../config/default.js';
import { createChildLogger } from '../utils/logging/logger.js';
import pino from 'pino';
import dnsCache from '../services/dnsCache.js';
import { ANALYSIS_PROCESS } from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WRAPPER_SCRIPT = path.join(
  __dirname,
  '..',
  'utils',
  'analysisWrapper.js',
);

class AnalysisProcess {
  constructor(analysisName, service) {
    this._analysisName = analysisName;
    this.service = service;
    this.process = null;
    this.enabled = false;
    this.status = 'stopped';
    this.intendedState = 'stopped'; // What state this should be in (persistent)
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
    this.maxMemoryLogs =
      config.analysis.maxLogsInMemory ||
      ANALYSIS_PROCESS.MAX_MEMORY_LOGS_FALLBACK;

    // Health check management
    this.restartAttempts = 0;
    // No max restart attempts - will retry indefinitely
    this.restartDelay = ANALYSIS_PROCESS.INITIAL_RESTART_DELAY_MS;
    this.maxRestartDelay = ANALYSIS_PROCESS.MAX_RESTART_DELAY_MS;
    this.connectionErrorDetected = false;
    this.isStarting = false; // Flag to prevent race conditions on start

    // Create main logger for lifecycle events (not analysis output)
    this.logger = createChildLogger('analysis', {
      analysis: analysisName,
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
    });

    // Recreate file logger with new path
    this.initializeFileLogger();

    this.logger.info({ oldName, newName }, 'Updated analysis name');
  }

  // Initialize the file logger for analysis output
  initializeFileLogger() {
    try {
      // Create directory if it doesn't exist
      const logsDir = path.dirname(this.logFile);
      safeMkdir(logsDir, { recursive: true }).catch(() => {}); // Don't await, let it happen async

      // Create Pino write stream for this analysis log file
      const fileStream = pino.destination({
        dest: this.logFile,
        sync: false, // Async writes for better performance
        mkdir: true,
      });

      // Create a simple file-only logger using pino's native NDJSON format
      // Each line is a complete JSON object: {"time":"2025-01-01T00:00:00.000Z","msg":"log message"}
      this.fileLogger = pino(
        {
          // Custom timestamp without leading comma (pino's default adds comma for middle-of-object insertion)
          timestamp: () => `"time":"${new Date().toISOString()}"`,
          base: null, // Remove pid, hostname fields for cleaner logs
          formatters: {
            level: () => ({}), // Remove level from output
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
    // The fileLogger outputs NDJSON format: {"time":"2025-01-01T00:00:00.000Z","msg":"message"}
    if (this.fileLogger) {
      this.fileLogger.info(message);
    } else {
      // Fallback if file logger failed to initialize
      this.logger.warn(
        { message, logFile: this.logFile },
        'File logger not available, analysis output not saved to file',
      );
    }

    // Use team-aware broadcasting for log messages
    sseManager.broadcastUpdate('log', {
      fileName: this.analysisName,
      analysis: this.analysisName,
      log: logEntry,
      totalCount: this.totalLogCount,
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
      const stats = await safeStat(this.logFile);

      // Check if file is too large (> 50MB)
      const maxFileSize = ANALYSIS_PROCESS.MAX_LOG_FILE_SIZE_BYTES;

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
        await safeUnlink(this.logFile);

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
        const content = await safeReadFile(this.logFile, 'utf8');
        const lines = content
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        this.totalLogCount = lines.length;
        this.logSequence = lines.length;

        // Load recent logs into memory (NDJSON format)
        const recentLines = lines.slice(-this.maxMemoryLogs);
        this.logs = recentLines
          .map((line, index) => {
            try {
              const logEntry = JSON.parse(line);

              if (!logEntry.time || !logEntry.msg) {
                return null;
              }

              return {
                sequence: this.logSequence - recentLines.length + index + 1,
                timestamp: new Date(logEntry.time).toLocaleString(),
                message: logEntry.msg,
                createdAt: new Date(logEntry.time).getTime(),
              };
            } catch {
              return null;
            }
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

    // Listen for IPC messages from child process
    this.process.on('message', async (message) => {
      if (message.type === 'DNS_LOOKUP_REQUEST') {
        // Handle shared DNS lookup request
        const result = await dnsCache.handleDNSLookupRequest(
          message.hostname,
          message.options,
        );
        this.process.send({
          type: 'DNS_LOOKUP_RESPONSE',
          requestId: message.requestId,
          result,
        });
      } else if (message.type === 'DNS_RESOLVE4_REQUEST') {
        // Handle shared DNS resolve4 request
        const result = await dnsCache.handleDNSResolve4Request(
          message.hostname,
        );
        this.process.send({
          type: 'DNS_RESOLVE4_RESPONSE',
          requestId: message.requestId,
          result,
        });
      } else if (message.type === 'DNS_RESOLVE6_REQUEST') {
        // Handle shared DNS resolve6 request
        const result = await dnsCache.handleDNSResolve6Request(
          message.hostname,
        );
        this.process.send({
          type: 'DNS_RESOLVE6_RESPONSE',
          requestId: message.requestId,
          result,
        });
      }
    });

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
              'Tago SDK connection/analysis error detected - marking for restart',
            );

            this.connectionErrorDetected = true;
            this.addLog(
              'Tago connection/analysis error - will restart process',
            );

            // Kill the process to trigger restart logic
            if (this.process && !this.process.killed) {
              this.process.kill('SIGTERM');
            }
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
    // Prevent race conditions - exit if already running or starting
    if (this.process || this.isStarting) return;

    this.isStarting = true;

    try {
      // Initialize log state before starting
      await this.initializeLogState();

      const filePath = path.join(
        config.paths.analysis,
        this.analysisName,
        'index.js',
      );

      this.logger.info(`Starting analysis process`);

      await this.addLog(`Node.js ${process.version}`);

      const storedEnv = this.service
        ? await this.service.getEnvironment(this.analysisName)
        : {};

      // Use wrapper script to initialize DNS cache before running analysis
      this.process = fork(WRAPPER_SCRIPT, [filePath], {
        env: {
          ...process.env,
          ...(config.process?.env || {}),
          ...storedEnv,
          STORAGE_BASE: config.storage.base,
          // DNS cache configuration is automatically passed via environment variables
        },
        stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      });

      if (!this.process) {
        throw new Error('Failed to start analysis process');
      }

      this.logger.info(`Analysis process started successfully`);

      this.setupProcessHandlers();
      this.updateStatus('running', true);

      // Send SSE notification to frontend that analysis has started
      sseManager.broadcastAnalysisUpdate(this.analysisName, {
        type: 'analysisUpdate',
        analysisName: this.analysisName,
        update: {
          status: 'running',
          enabled: true,
          startTime: new Date().toISOString(),
          startSequence: Date.now(),
        },
      });

      // Config saving is handled by the service after start() completes
    } catch (error) {
      this.logger.error({ err: error }, `Failed to start analysis process`);
      await this.addLog(`ERROR: ${error.message}`);
      throw error;
    } finally {
      // Always reset the flag, whether start succeeded or failed
      this.isStarting = false;
    }
  }

  updateStatus(status, enabled = false) {
    const previousStatus = this.status;
    this.status = status;
    this.enabled = enabled;

    // Update intended state when explicitly enabling/disabling
    if (status === 'running') {
      this.intendedState = 'running';
      this.lastStartTime = new Date().toString();
    } else if (status === 'stopped' && !enabled) {
      // Only set intended state to stopped if not a connection error
      if (!this.connectionErrorDetected) {
        this.intendedState = 'stopped';
      }
    }

    this.logger.debug({ previousStatus, status }, 'Status updated');
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

  /**
   * Clean up all resources associated with this analysis
   * Call this method before deleting an analysis to prevent memory leaks
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.logger.info(`Cleaning up analysis resources`);

    // Kill process if still running
    if (this.process && !this.process.killed) {
      try {
        this.process.kill('SIGKILL');
      } catch (error) {
        this.logger.warn(
          { err: error },
          'Error killing process during cleanup',
        );
      }
      this.process = null;
    }

    // Close file logger stream to prevent memory leaks
    if (this.fileLogger) {
      try {
        // Flush any remaining logs and close the stream
        this.fileLogger.flush();
        // Note: Pino doesn't have a close() method, but flush() ensures all logs are written
      } catch (error) {
        this.logger.warn(
          { err: error },
          'Error flushing file logger during cleanup',
        );
      }
      this.fileLogger = null;
    }

    // Clear in-memory log buffer to free memory
    this.logs = [];
    this.logSequence = 0;
    this.totalLogCount = 0;

    // Clear output buffers
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    // Reset state
    this.status = 'stopped';
    this.enabled = false;
    this.intendedState = 'stopped';
    this.connectionErrorDetected = false;
    this.restartAttempts = 0;
    this.isStarting = false;

    this.logger.info(`Analysis resources cleaned up successfully`);
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

    this.logger.info({ exitCode: code }, 'Analysis process exited');

    await this.addLog(`Process exited with code ${code}`);
    this.process = null;

    this.updateStatus('stopped', false);

    // Send SSE notification to frontend that analysis has stopped
    // Include timestamp to ensure each exit is treated as a unique event
    sseManager.broadcastAnalysisUpdate(this.analysisName, {
      type: 'analysisUpdate',
      analysisName: this.analysisName,
      update: {
        status: 'stopped',
        enabled: false,
        exitCode: code,
        exitTime: new Date().toISOString(),
        exitSequence: Date.now(), // Unique sequence number for deduplication
      },
    });

    await this.saveConfig();

    // Auto-restart analyses that exit unexpectedly OR have connection errors
    const shouldRestart =
      this.intendedState === 'running' &&
      (code !== 0 || this.connectionErrorDetected);

    if (shouldRestart) {
      if (this.connectionErrorDetected) {
        this.restartAttempts++;

        // Calculate exponential backoff delay
        const delay = Math.min(
          this.restartDelay * Math.pow(2, this.restartAttempts - 1),
          this.maxRestartDelay,
        );

        this.logger.warn(
          `Connection error detected, scheduling restart attempt ${this.restartAttempts} in ${delay}ms`,
        );
        await this.addLog(
          `Connection error - restart attempt ${this.restartAttempts} in ${delay / 1000}s`,
        );

        // Always retry on connection errors - no limit
        setTimeout(async () => {
          // Reset connection error flag before restart
          this.connectionErrorDetected = false;
          try {
            await this.start();
            // Reset attempts on successful start
            this.restartAttempts = 0;
          } catch (error) {
            this.logger.error(
              { err: error },
              'Failed to restart after connection error',
            );
            // Will retry again on next exit
          }
        }, delay);
      } else {
        // Regular unexpected exit (non-connection error)
        this.logger.warn(
          `Listener exited unexpectedly, scheduling auto-restart`,
        );
        await this.addLog(`Listener exited unexpectedly, auto-restarting...`);
        setTimeout(
          () => this.start(),
          config.analysis.autoRestartDelay || 5000,
        );
      }
    } else if (this.connectionErrorDetected) {
      // Reset connection error flag if not restarting
      this.connectionErrorDetected = false;
      this.restartAttempts = 0;
    }
  }
}

export default AnalysisProcess;

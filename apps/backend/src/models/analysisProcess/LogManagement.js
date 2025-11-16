/**
 * LogManagement Module
 *
 * Handles all logging concerns:
 * - File logging to analysis.log
 * - In-memory log buffering with FIFO eviction
 * - Log file rotation (50MB limit)
 * - Log state initialization
 *
 * Uses Pino for structured logging with NDJSON format.
 */

import path from 'path';
import pino from 'pino';
import {
  safeMkdir,
  safeStat,
  safeUnlink,
  safeReadFile,
} from '../../utils/safePath.js';
import { ANALYSIS_PROCESS } from '../../constants.js';

// Lazy-load SSE manager to avoid circular dependency
let _sseManager = null;
let _sseManagerPromise = null;
async function getSseManager() {
  if (_sseManager) {
    return _sseManager;
  }

  if (_sseManagerPromise) {
    await _sseManagerPromise;
    return _sseManager;
  }

  _sseManagerPromise = (async () => {
    const { sseManager } = await import('../../utils/sse/index.js');
    _sseManager = sseManager;
    _sseManagerPromise = null;
    return _sseManager;
  })();

  await _sseManagerPromise;
  return _sseManager;
}

export class LogManager {
  /**
   * Initialize log manager
   * @param {AnalysisProcess} analysisProcess - Parent process reference
   * @param {Object} config - Application configuration
   */
  constructor(analysisProcess, config) {
    this.analysisProcess = analysisProcess;
    this.config = config;

    // Log file configuration
    this.fileLogger = null;
    this.fileLoggerStream = null; // NEW: Track stream separately for proper cleanup
  }

  /**
   * Initialize Pino file logger for this analysis
   *
   * Creates:
   * - Log directory structure if needed
   * - Pino destination stream
   * - Pino logger instance with custom formatting
   *
   * IMPORTANT: Stores stream reference for cleanup.
   * @private
   */
  initializeFileLogger() {
    try {
      // Ensure log directory exists
      const logsDir = path.dirname(this.analysisProcess.logFile);
      safeMkdir(logsDir, this.config.paths.analysis, { recursive: true }).catch(
        () => {}, // Async directory creation, don't await
      );

      // Create Pino write stream
      // sync: false for async writes (better performance)
      // mkdir: true auto-creates directory
      this.fileLoggerStream = pino.destination({
        dest: this.analysisProcess.logFile,
        sync: false,
        mkdir: true,
      });

      // Create Pino logger with custom formatting
      // - Custom timestamp without extra fields
      // - No pid/hostname (cleaner output)
      // - NDJSON format: {"time":"2025-01-01T00:00:00.000Z","msg":"message"}
      this.analysisProcess.fileLogger = pino(
        {
          timestamp: () => `"time":"${new Date().toISOString()}"`,
          base: null, // Remove pid, hostname fields
          formatters: {
            level: () => ({}), // Remove level from output
          },
          messageKey: 'msg',
        },
        this.fileLoggerStream,
      );

      // Store stream reference for cleanup
      this.analysisProcess.fileLoggerStream = this.fileLoggerStream;
    } catch (error) {
      this.analysisProcess.logger.error(
        { err: error },
        'Failed to initialize file logger',
      );
      this.analysisProcess.fileLogger = null;
      this.fileLoggerStream = null;
    }
  }

  /**
   * Add log entry to both memory and file
   *
   * Flow:
   * 1. Create log entry with timestamp and sequence
   * 2. Add to in-memory FIFO buffer (evict oldest if full)
   * 3. Increment total count
   * 4. Write to file via Pino
   * 5. Broadcast via SSE for real-time frontend updates
   *
   * @param {string} message - Log message
   */
  async addLog(message) {
    const timestamp = new Date().toLocaleString();
    const logEntry = {
      sequence: ++this.analysisProcess.logSequence,
      timestamp,
      message,
      createdAt: Date.now(), // For efficient sorting
    };

    // Add to in-memory buffer (FIFO - newest first)
    this.analysisProcess.logs.unshift(logEntry);
    if (this.analysisProcess.logs.length > this.analysisProcess.maxMemoryLogs) {
      this.analysisProcess.logs.pop(); // Remove oldest
    }

    // Increment total count
    this.analysisProcess.totalLogCount++;

    // Write analysis output ONLY to file logger (not console/Loki)
    // fileLogger outputs NDJSON format
    if (this.analysisProcess.fileLogger) {
      this.analysisProcess.fileLogger.info(message);
    } else {
      // Fallback if file logger failed to initialize
      this.analysisProcess.logger.warn(
        { message, logFile: this.analysisProcess.logFile },
        'File logger not available, analysis output not saved to file',
      );
    }

    // Broadcast to connected clients via SSE
    const sseManager = await getSseManager();
    sseManager.broadcastUpdate('log', {
      fileName: this.analysisProcess.analysisName,
      analysis: this.analysisProcess.analysisName,
      log: logEntry,
      totalCount: this.analysisProcess.totalLogCount,
    });
  }

  /**
   * Retrieve in-memory logs with pagination
   *
   * Note: Logs are stored newest-first in memory
   *
   * @param {number} page - Page number (1-indexed)
   * @param {number} limit - Items per page
   * @returns {Object} Paginated logs with metadata
   */
  getMemoryLogs(page = 1, limit = 100) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedLogs = this.analysisProcess.logs.slice(startIndex, endIndex);

    return {
      logs: paginatedLogs,
      hasMore: endIndex < this.analysisProcess.logs.length,
      totalInMemory: this.analysisProcess.logs.length,
      totalCount: this.analysisProcess.totalLogCount,
    };
  }

  /**
   * Load existing logs from file
   *
   * Parses NDJSON format and loads recent logs into memory.
   * Handles missing files gracefully.
   *
   * @private
   * @returns {Promise<void>}
   */
  async loadExistingLogs() {
    try {
      const content = await safeReadFile(
        this.analysisProcess.logFile,
        this.config.paths.analysis,
        'utf8',
      );

      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      this.analysisProcess.totalLogCount = lines.length;
      this.analysisProcess.logSequence = lines.length;

      // Load recent logs into memory (up to maxMemoryLogs)
      const recentLines = lines.slice(-this.analysisProcess.maxMemoryLogs);
      this.analysisProcess.logs = recentLines
        .map((line, index) => {
          try {
            const logEntry = JSON.parse(line);

            // Validate NDJSON format
            if (!logEntry.time || !logEntry.msg) {
              return null;
            }

            return {
              sequence:
                this.analysisProcess.logSequence -
                recentLines.length +
                index +
                1,
              timestamp: new Date(logEntry.time).toLocaleString(),
              message: logEntry.msg,
              createdAt: new Date(logEntry.time).getTime(),
            };
          } catch {
            return null; // Skip malformed lines
          }
        })
        .filter(Boolean)
        .reverse(); // Reverse to get newest first
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error; // Re-throw non-ENOENT errors
      }
      // File doesn't exist yet - this is normal
    }
  }

  /**
   * Handle oversized log files
   *
   * If log file exceeds 50MB:
   * 1. Delete the file
   * 2. Start fresh with empty logs
   * 3. Log a message about the rotation
   *
   * This prevents unbounded log file growth.
   *
   * @private
   * @returns {Promise<void>}
   */
  async handleOversizedLogFile(stats) {
    const maxFileSize = ANALYSIS_PROCESS.MAX_LOG_FILE_SIZE_BYTES;

    if (stats.size > maxFileSize) {
      const sizeMB = Math.round(stats.size / 1024 / 1024);
      this.analysisProcess.logger.warn({
        analysisName: this.analysisProcess.analysisName,
        fileSize: stats.size,
        sizeMB,
        maxSizeMB: Math.round(maxFileSize / 1024 / 1024),
        msg: `Log file is very large (${sizeMB}MB). Deleting and starting fresh.`,
      });

      // Delete the oversized log file
      await safeUnlink(
        this.analysisProcess.logFile,
        this.config.paths.analysis,
      );

      // Start fresh
      this.analysisProcess.totalLogCount = 0;
      this.analysisProcess.logSequence = 0;
      this.analysisProcess.logs = [];

      // Reinitialize file logger after deleting the file
      this.initializeFileLogger();

      // Log that we cleared the file
      await this.addLog(
        'Log file was too large and has been cleared. Starting fresh.',
      );
    }
  }

  /**
   * Initialize log state from existing file
   *
   * Called during process startup to:
   * 1. Load existing logs from file
   * 2. Check for oversized log files
   * 3. Initialize in-memory buffer
   * 4. Set up sequence tracking
   *
   * Must be called before process start to ensure proper logging.
   */
  async initializeLogState() {
    // Initialize the file logger first
    this.initializeFileLogger();

    try {
      const stats = await safeStat(
        this.analysisProcess.logFile,
        this.config.paths.analysis,
      );

      // Check if file is oversized
      await this.handleOversizedLogFile(stats);

      // For normal-sized files, load as usual
      if (stats.size <= ANALYSIS_PROCESS.MAX_LOG_FILE_SIZE_BYTES) {
        await this.loadExistingLogs();
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.analysisProcess.logger.error({
          err: error,
          analysisName: this.analysisProcess.analysisName,
          msg: 'Error initializing log state',
        });
      }
      // File doesn't exist yet, start fresh
      this.analysisProcess.totalLogCount = 0;
      this.analysisProcess.logSequence = 0;
      this.analysisProcess.logs = [];
    }
  }
}

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
  safeWriteFile,
} from '../../utils/safePath.ts';
import { ANALYSIS_PROCESS } from '../../constants.ts';
import type { Config } from '../../config/default.ts';
import type {
  AnalysisProcessState,
  MemoryLogsResult,
  SSEManagerInterface,
  LogEntry,
  PinoDestinationStream,
} from './types.ts';

// Check file size every N log entries for runtime rotation
const LOG_SIZE_CHECK_INTERVAL = 100;

// Number of recent log lines to preserve during automatic rotation (for context)
const ROTATION_PRESERVE_LINES = 100;

/**
 * Lazy-loaded SSE manager to avoid circular dependency.
 *
 * Direct import would create: LogManagement -> sse -> analysisService -> AnalysisProcess -> LogManagement
 * This pattern defers loading until first use, breaking the cycle.
 */
let _sseManager: SSEManagerInterface | null = null;
let _sseManagerPromise: Promise<SSEManagerInterface> | null = null;

async function getSseManager(): Promise<SSEManagerInterface> {
  if (_sseManager) {
    return _sseManager;
  }

  if (_sseManagerPromise) {
    await _sseManagerPromise;
    return _sseManager!;
  }

  _sseManagerPromise = (async () => {
    const { sseManager } = await import('../../utils/sse/index.ts');
    // Type assertion required: dynamic import loses type info.
    // The actual implementation matches SSEManagerInterface contract.
    _sseManager = sseManager as unknown as SSEManagerInterface;
    _sseManagerPromise = null;
    return _sseManager;
  })();

  await _sseManagerPromise;
  return _sseManager!;
}

/** Stats result from safeStat */
type FileStats = {
  readonly size: number;
};

/** Type guard for FileStats */
function isFileStats(result: unknown): result is FileStats {
  return (
    typeof result === 'object' &&
    result !== null &&
    'size' in result &&
    typeof (result as { size?: unknown }).size === 'number'
  );
}

/** Parsed log entry from JSON */
type ParsedLogEntry = {
  readonly time?: string;
  readonly msg?: string;
};

export class LogManager {
  private analysisProcess: AnalysisProcessState;
  private config: Config;

  // Log file configuration
  private fileLoggerStream: PinoDestinationStream | null = null;

  // Runtime log rotation tracking
  private estimatedFileSize = 0; // Approximate bytes written to file
  private logsSinceLastCheck = 0; // Counter for periodic size verification
  private isRotating = false; // Prevent concurrent rotation

  /**
   * Initialize log manager
   * @param analysisProcess - Parent process reference
   * @param config - Application configuration
   */
  constructor(analysisProcess: AnalysisProcessState, config: Config) {
    this.analysisProcess = analysisProcess;
    this.config = config;
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
   */
  initializeFileLogger(): void {
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
      }) as PinoDestinationStream;

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
   * 5. Track file size and rotate if needed
   * 6. Broadcast via SSE for real-time frontend updates
   *
   * @param message - Log message
   */
  async addLog(message: string): Promise<void> {
    const timestamp = new Date().toLocaleString();
    const logEntry: LogEntry = {
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

      // Estimate bytes written: {"time":"...","msg":"..."}\n
      // ~50 bytes overhead + message length
      const estimatedBytes = 50 + Buffer.byteLength(message, 'utf8');
      this.estimatedFileSize += estimatedBytes;
      this.logsSinceLastCheck++;

      // Check for runtime rotation periodically
      await this.checkRuntimeRotation();
    } else {
      // Fallback if file logger failed to initialize
      this.analysisProcess.logger.warn(
        { message, logFile: this.analysisProcess.logFile },
        'File logger not available, analysis output not saved to file',
      );
    }

    // Broadcast to connected clients via SSE
    const sseManager = await getSseManager();
    await sseManager.broadcastUpdate('log', {
      analysisId: this.analysisProcess.analysisId,
      analysisName: this.analysisProcess.analysisName,
      log: logEntry,
      totalCount: this.analysisProcess.totalLogCount,
      logFileSize: this.estimatedFileSize,
    });
  }

  /**
   * Check if runtime log rotation is needed
   *
   * Triggered periodically during logging to prevent unbounded file growth
   * while the analysis is running. Similar to manual clear but automatic.
   *
   * @private
   */
  private async checkRuntimeRotation(): Promise<void> {
    const maxFileSize = ANALYSIS_PROCESS.MAX_LOG_FILE_SIZE_BYTES;

    // Only check periodically to avoid performance impact
    if (this.logsSinceLastCheck < LOG_SIZE_CHECK_INTERVAL) {
      return;
    }

    this.logsSinceLastCheck = 0;

    // Check if estimated size exceeds threshold
    if (this.estimatedFileSize < maxFileSize) {
      return;
    }

    // Prevent concurrent rotation
    if (this.isRotating) {
      return;
    }

    // Verify actual file size before rotating
    try {
      const result = await safeStat(
        this.analysisProcess.logFile,
        this.config.paths.analysis,
      );

      if (!isFileStats(result)) {
        return;
      }

      // Update estimated size with actual size
      this.estimatedFileSize = result.size;

      if (result.size >= maxFileSize) {
        await this.rotateLogFile();
      }
    } catch (error) {
      // File doesn't exist or can't be accessed - reset estimate
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.estimatedFileSize = 0;
      }
    }
  }

  /**
   * Rotate log file while analysis is running
   *
   * Unlike manual clear, automatic rotation preserves recent logs for context:
   * 1. Read last N lines from file (for context)
   * 2. Flush and close current stream
   * 3. Write preserved lines back to file
   * 4. Update in-memory state with preserved logs
   * 5. Reinitialize logger
   * 6. Log rotation event
   *
   * Analysis continues running with preserved context.
   *
   * @private
   */
  private async rotateLogFile(): Promise<void> {
    if (this.isRotating) {
      return;
    }

    this.isRotating = true;

    try {
      const sizeMB = Math.round(this.estimatedFileSize / 1024 / 1024);
      this.analysisProcess.logger.info({
        analysisName: this.analysisProcess.analysisName,
        sizeMB,
        msg: `Rotating log file at runtime (${sizeMB}MB)`,
      });

      // Read last N lines before closing the stream (for context preservation)
      let preservedLines: Array<string> = [];
      let preservedLogs: Array<LogEntry> = [];
      try {
        const content = await safeReadFile(
          this.analysisProcess.logFile,
          this.config.paths.analysis,
          { encoding: 'utf8' },
        );

        if (typeof content !== 'string') {
          throw new Error('Failed to read log file as string');
        }

        const allLines = content
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        // Keep last N lines for context
        preservedLines = allLines.slice(-ROTATION_PRESERVE_LINES);

        // Parse preserved lines into log entries
        preservedLogs = preservedLines
          .map((line, index): LogEntry | null => {
            try {
              const logEntry = JSON.parse(line) as ParsedLogEntry;
              if (!logEntry.time || !logEntry.msg) {
                return null;
              }
              return {
                sequence: index + 1,
                timestamp: new Date(logEntry.time).toLocaleString(),
                message: logEntry.msg,
                createdAt: new Date(logEntry.time).getTime(),
              };
            } catch {
              return null;
            }
          })
          .filter((entry): entry is LogEntry => entry !== null);
      } catch (error) {
        // If we can't read the file, just proceed without preserved logs
        this.analysisProcess.logger.warn(
          { err: error },
          'Could not read logs for preservation during rotation',
        );
      }

      // Flush the current stream
      if (this.fileLoggerStream) {
        await new Promise<void>((resolve) => {
          this.fileLoggerStream!.flush();
          // Give a small delay for flush to complete
          setTimeout(resolve, 100);
        });

        // Close the stream
        this.fileLoggerStream.end();
        this.fileLoggerStream = null;
        this.analysisProcess.fileLogger = null;
        this.analysisProcess.fileLoggerStream = null;
      }

      // Write preserved lines back to file (or empty if none)
      const preservedContent =
        preservedLines.length > 0 ? preservedLines.join('\n') + '\n' : '';
      await safeWriteFile(
        this.analysisProcess.logFile,
        preservedContent,
        this.config.paths.analysis,
        { encoding: 'utf8' },
      );

      // Update in-memory state with preserved logs (newest first)
      this.analysisProcess.logs = preservedLogs.reverse();
      this.analysisProcess.logSequence = preservedLogs.length;
      this.analysisProcess.totalLogCount = preservedLogs.length;
      this.estimatedFileSize = Buffer.byteLength(preservedContent, 'utf8');

      // Reinitialize the file logger
      this.initializeFileLogger();

      // Log that rotation occurred
      // Don't use addLog here to avoid recursion - write directly
      const rotationMessage = `Log file rotated automatically (was ${sizeMB}MB, preserved last ${preservedLogs.length} entries). Analysis continues.`;
      if (this.analysisProcess.fileLogger) {
        this.analysisProcess.fileLogger.info(rotationMessage);
        this.estimatedFileSize +=
          50 + Buffer.byteLength(rotationMessage, 'utf8');
      }

      // Add rotation message to in-memory logs
      const rotationEntry: LogEntry = {
        sequence: ++this.analysisProcess.logSequence,
        timestamp: new Date().toLocaleString(),
        message: rotationMessage,
        createdAt: Date.now(),
      };
      this.analysisProcess.logs.unshift(rotationEntry);
      this.analysisProcess.totalLogCount++;

      // Broadcast rotation event
      const sseManager = await getSseManager();
      await sseManager.broadcastUpdate('logsCleared', {
        analysisId: this.analysisProcess.analysisId,
        analysisName: this.analysisProcess.analysisName,
        reason: 'rotation',
        previousSizeMB: sizeMB,
        preservedCount: preservedLogs.length,
      });
      await sseManager.broadcastUpdate('log', {
        analysisId: this.analysisProcess.analysisId,
        analysisName: this.analysisProcess.analysisName,
        log: rotationEntry,
        totalCount: this.analysisProcess.totalLogCount,
      });
    } catch (error) {
      this.analysisProcess.logger.error(
        { err: error },
        'Failed to rotate log file',
      );
    } finally {
      this.isRotating = false;
    }
  }

  /**
   * Retrieve in-memory logs with pagination
   *
   * Note: Logs are stored newest-first in memory
   *
   * @param page - Page number (1-indexed)
   * @param limit - Items per page
   * @returns Paginated logs with metadata
   */
  getMemoryLogs(page = 1, limit = 100): MemoryLogsResult {
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
   * Also initializes estimated file size for runtime rotation tracking.
   *
   * @private
   * @param fileSize - Current file size in bytes (from stat)
   */
  private async loadExistingLogs(fileSize = 0): Promise<void> {
    // Initialize estimated size for runtime rotation tracking
    this.estimatedFileSize = fileSize;

    try {
      const content = await safeReadFile(
        this.analysisProcess.logFile,
        this.config.paths.analysis,
        { encoding: 'utf8' },
      );

      if (typeof content !== 'string') {
        throw new Error('Failed to read log file as string');
      }

      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      this.analysisProcess.totalLogCount = lines.length;
      this.analysisProcess.logSequence = lines.length;

      // Load recent logs into memory (up to maxMemoryLogs)
      const recentLines = lines.slice(-this.analysisProcess.maxMemoryLogs);
      this.analysisProcess.logs = recentLines
        .map((line, index): LogEntry | null => {
          try {
            const logEntry = JSON.parse(line) as ParsedLogEntry;

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
        .filter((entry): entry is LogEntry => entry !== null)
        .reverse(); // Reverse to get newest first
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error; // Re-throw non-ENOENT errors
      }
      // File doesn't exist yet - this is normal
    }
  }

  /**
   * Handle oversized log files at startup
   *
   * Called only during initialization (not while running).
   * For runtime rotation while analysis runs, see checkRuntimeRotation().
   *
   * If log file exceeds 50MB:
   * 1. Delete the file
   * 2. Start fresh with empty logs
   * 3. Log a message about the rotation
   *
   * @private
   */
  private async handleOversizedLogFile(stats: FileStats): Promise<void> {
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
      this.estimatedFileSize = 0;

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
  async initializeLogState(): Promise<void> {
    // Initialize the file logger first
    this.initializeFileLogger();

    try {
      const result = await safeStat(
        this.analysisProcess.logFile,
        this.config.paths.analysis,
      );

      if (!isFileStats(result)) {
        // File doesn't exist or invalid stats, start fresh
        this.analysisProcess.totalLogCount = 0;
        this.analysisProcess.logSequence = 0;
        this.analysisProcess.logs = [];
        return;
      }

      // Check if file is oversized
      await this.handleOversizedLogFile(result);

      // For normal-sized files, load as usual
      if (result.size <= ANALYSIS_PROCESS.MAX_LOG_FILE_SIZE_BYTES) {
        await this.loadExistingLogs(result.size);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
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

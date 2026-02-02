/**
 * AnalysisProcess Class - Main Orchestrator
 *
 * Thin wrapper that composes the 5 specialized modules:
 * - ProcessLifecycleManager: start/stop/exit
 * - ProcessMonitor: health checks, connection detection
 * - LogManager: file & memory logging
 * - ProcessCleanupManager: resource cleanup
 *
 * Maintains backward compatibility with original API.
 * All methods delegate to appropriate manager.
 */

import path from 'path';
import type { ChildProcess } from 'child_process';
import type { Logger } from 'pino';
import { config } from '../../config/default.ts';
import { createChildLogger } from '../../utils/logging/logger.ts';
import { ANALYSIS_PROCESS } from '../../constants.ts';
import { ProcessLifecycleManager } from './ProcessLifecycle.ts';
import { ProcessMonitor } from './ProcessMonitoring.ts';
import { LogManager } from './LogManagement.ts';
import { ProcessCleanupManager } from './ProcessCleanup.ts';
import type {
  AnalysisStatus,
  AnalysisIntendedState,
  AnalysisServiceInterface,
  MemoryLogsResult,
  LogEntry,
  PinoDestinationStream,
} from './types.ts';

/** Type for IPC messages with a type property */
type IPCMessageWithType = {
  readonly type: string;
};

/** Type guard to check if a message has a type property */
function hasMessageType(message: object): message is IPCMessageWithType {
  return (
    'type' in message &&
    typeof (message as { type?: unknown }).type === 'string'
  );
}

export class AnalysisProcess {
  // Core identity
  private _analysisId: string;
  private _analysisName: string;
  service: AnalysisServiceInterface;
  logger: Logger;

  // Paths
  logFile: string;

  // Process state
  process: ChildProcess | null;
  status: AnalysisStatus;
  enabled: boolean;
  intendedState: AnalysisIntendedState;
  isStarting: boolean;
  isManualStop: boolean;
  lastStartTime: string | null;

  // Team association
  teamId: string | null;

  // Log management state
  logs: LogEntry[];
  logSequence: number;
  totalLogCount: number;
  maxMemoryLogs: number;
  fileLogger: Logger | null;
  fileLoggerStream: PinoDestinationStream | null;

  // Health check state
  restartAttempts: number;
  restartDelay: number;
  maxRestartDelay: number;
  connectionErrorDetected: boolean;

  // Connection monitoring state
  connectionGracePeriod: number;
  connectionGraceTimer: ReturnType<typeof setTimeout> | null;
  reconnectionAttempts: number;
  isConnected: boolean;

  // Output buffering
  stdoutBuffer: string;
  stderrBuffer: string;

  // Exit handling (used by ProcessLifecycleManager)
  _exitPromiseResolve?: () => void;
  _exitPromiseReject?: (error: Error) => void;

  // Managers
  logManager: LogManager;
  monitoringManager: ProcessMonitor;
  lifecycleManager: ProcessLifecycleManager;
  cleanupManager: ProcessCleanupManager;

  /**
   * Initialize AnalysisProcess with all managers
   * @param analysisId - UUID of the analysis (used for file paths)
   * @param analysisName - Display name of the analysis
   * @param service - Service reference for environment/config
   */
  constructor(
    analysisId: string,
    analysisName: string,
    service: AnalysisServiceInterface,
  ) {
    // Core identity - analysisId is the primary identifier (UUID)
    this._analysisId = analysisId;
    this._analysisName = analysisName;
    this.service = service;

    // Team association - set later by analysisService
    this.teamId = null;

    // Logging for lifecycle events (include both for debugging)
    this.logger = createChildLogger('analysis', {
      analysisId,
      analysis: analysisName,
    });

    // Initialize log file path using analysisId (not name)
    this.logFile = path.join(
      config.paths.analysis,
      analysisId,
      'logs',
      'analysis.log',
    );

    // Process state
    this.process = null;
    this.status = 'stopped';
    this.enabled = false;
    this.intendedState = 'stopped';
    this.isStarting = false;
    this.isManualStop = false;
    this.lastStartTime = null;

    // Log management state
    this.logs = [];
    this.logSequence = 0;
    this.totalLogCount = 0;
    this.maxMemoryLogs = config.analysis.maxLogsInMemory || 100;
    this.fileLogger = null;
    this.fileLoggerStream = null;

    // Health check state
    this.restartAttempts = 0;
    this.restartDelay = ANALYSIS_PROCESS.INITIAL_RESTART_DELAY_MS;
    this.maxRestartDelay = ANALYSIS_PROCESS.MAX_RESTART_DELAY_MS;
    this.connectionErrorDetected = false;

    // Connection monitoring state
    this.connectionGracePeriod = ANALYSIS_PROCESS.CONNECTION_GRACE_PERIOD_MS;
    this.connectionGraceTimer = null;
    this.reconnectionAttempts = 0;
    this.isConnected = false;

    // Output buffering
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    // Initialize managers with back-references
    this.logManager = new LogManager(this, config);
    this.monitoringManager = new ProcessMonitor(this);
    this.lifecycleManager = new ProcessLifecycleManager(this);
    this.cleanupManager = new ProcessCleanupManager(this);

    // Initialize file logger immediately
    this.logManager.initializeFileLogger();
  }

  /**
   * Get analysis ID (primary identifier)
   */
  get analysisId(): string {
    return this._analysisId;
  }

  /**
   * Get analysis name (display name)
   */
  get analysisName(): string {
    return this._analysisName;
  }

  /**
   * Set analysis name (display name only - paths use analysisId)
   * This is used for rename operations where only the display name changes
   */
  set analysisName(newName: string) {
    const oldName = this._analysisName;
    this._analysisName = newName;

    // Update logger with new analysis name (but keep analysisId)
    this.logger = createChildLogger('analysis', {
      analysisId: this._analysisId,
      analysis: newName,
    });

    // Note: logFile path is NOT updated because it's based on analysisId
    // This is intentional - rename only changes display name, not directory

    this.logger.info({ oldName, newName }, 'Updated analysis name');
  }

  // === LIFECYCLE METHODS (delegate to ProcessLifecycleManager) ===

  /**
   * Start the analysis process
   * @throws {Error} If fork fails
   */
  async start(): Promise<void> {
    return this.lifecycleManager.start();
  }

  /**
   * Stop the analysis process
   */
  async stop(): Promise<void> {
    return this.lifecycleManager.stop();
  }

  /**
   * Handle process exit (used by tests and internal handlers)
   */
  async handleExit(code: number | null): Promise<void> {
    return this.lifecycleManager.handleExit(code);
  }

  /**
   * Update process status (used by tests and internal logic)
   */
  updateStatus(status: AnalysisStatus, enabled = false): void {
    return this.lifecycleManager.updateStatus(status, enabled);
  }

  // === MONITORING METHODS (delegate to ProcessMonitor) ===

  /**
   * Handle stdout/stderr output (used by tests and handlers)
   */
  handleOutput(isError: boolean, data: Buffer): void {
    return this.monitoringManager.handleOutput(isError, data);
  }

  // === LOGGING METHODS (delegate to LogManager) ===

  /**
   * Add log entry to memory and file
   */
  async addLog(message: string): Promise<void> {
    return this.logManager.addLog(message);
  }

  /**
   * Get paginated in-memory logs
   */
  getMemoryLogs(page = 1, limit = 100): MemoryLogsResult {
    return this.logManager.getMemoryLogs(page, limit);
  }

  /**
   * Initialize log state from file
   */
  async initializeLogState(): Promise<void> {
    return this.logManager.initializeLogState();
  }

  // === CLEANUP METHODS (delegate to ProcessCleanupManager) ===

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    return this.cleanupManager.cleanup();
  }

  // === SUPPORT METHODS (keep in main class) ===

  /**
   * Safely send IPC message to child process
   * Prevents crashes when process is killed during async operations
   * @param message - Message to send
   */
  safeIPCSend(message: object): void {
    const messageType = hasMessageType(message) ? message.type : undefined;

    try {
      if (this.process && this.process.connected) {
        this.process.send(message);
      } else {
        this.logger.debug(
          { messageType },
          'Skipped IPC send - process no longer available',
        );
      }
    } catch (error) {
      this.logger.warn(
        { err: error, messageType },
        'Failed to send IPC message to child process',
      );
    }
  }

  /**
   * Save configuration via service
   */
  async saveConfig(): Promise<void> {
    if (!this.service) {
      this.logger.error({
        analysisName: this.analysisName,
        msg: 'Service is undefined for analysis',
      });
      return;
    }
    return this.service.saveConfig();
  }
}

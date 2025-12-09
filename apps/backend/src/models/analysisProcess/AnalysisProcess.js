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
import { config } from '../../config/default.js';
import { createChildLogger } from '../../utils/logging/logger.js';
import { ANALYSIS_PROCESS } from '../../constants.js';
import { ProcessLifecycleManager } from './ProcessLifecycle.js';
import { ProcessMonitor } from './ProcessMonitoring.js';
import { LogManager } from './LogManagement.js';
import { ProcessCleanupManager } from './ProcessCleanup.js';

export class AnalysisProcess {
  /**
   * Initialize AnalysisProcess with all managers
   * @param {string} analysisId - UUID of the analysis (used for file paths)
   * @param {string} analysisName - Display name of the analysis
   * @param {Object} service - Service reference for environment/config
   */
  constructor(analysisId, analysisName, service) {
    // Core identity - analysisId is the primary identifier (UUID)
    this._analysisId = analysisId;
    this._analysisName = analysisName;
    this.service = service;

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
    this.fileLoggerStream = null; // NEW: Track stream separately

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
    this.monitoringManager = new ProcessMonitor(this, config);
    this.lifecycleManager = new ProcessLifecycleManager(this, config);
    this.cleanupManager = new ProcessCleanupManager(this);

    // Initialize file logger immediately
    this.logManager.initializeFileLogger();
  }

  /**
   * Get analysis ID (primary identifier)
   */
  get analysisId() {
    return this._analysisId;
  }

  /**
   * Get analysis name (display name)
   */
  get analysisName() {
    return this._analysisName;
  }

  /**
   * Set analysis name (display name only - paths use analysisId)
   * This is used for rename operations where only the display name changes
   */
  set analysisName(newName) {
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
  async start() {
    return this.lifecycleManager.start();
  }

  /**
   * Stop the analysis process
   */
  async stop() {
    return this.lifecycleManager.stop();
  }

  /**
   * Handle process exit (used by tests and internal handlers)
   */
  async handleExit(code) {
    return this.lifecycleManager.handleExit(code);
  }

  /**
   * Update process status (used by tests and internal logic)
   */
  updateStatus(status, enabled = false) {
    return this.lifecycleManager.updateStatus(status, enabled);
  }

  // === MONITORING METHODS (delegate to ProcessMonitor) ===

  /**
   * Handle stdout/stderr output (used by tests and handlers)
   */
  handleOutput(isError, data) {
    return this.monitoringManager.handleOutput(isError, data);
  }

  // === LOGGING METHODS (delegate to LogManager) ===

  /**
   * Add log entry to memory and file
   */
  async addLog(message) {
    return this.logManager.addLog(message);
  }

  /**
   * Get paginated in-memory logs
   */
  getMemoryLogs(page = 1, limit = 100) {
    return this.logManager.getMemoryLogs(page, limit);
  }

  /**
   * Initialize log state from file
   */
  async initializeLogState() {
    return this.logManager.initializeLogState();
  }

  // === CLEANUP METHODS (delegate to ProcessCleanupManager) ===

  /**
   * Clean up all resources
   */
  async cleanup() {
    return this.cleanupManager.cleanup();
  }

  // === SUPPORT METHODS (keep in main class) ===

  /**
   * Safely send IPC message to child process
   * Prevents crashes when process is killed during async operations
   * @param {Object} message - Message to send
   */
  safeIPCSend(message) {
    try {
      if (this.process && !this.process.killed) {
        this.process.send(message);
      } else {
        this.logger.debug('Skipped IPC send - process no longer available', {
          messageType: message.type,
        });
      }
    } catch (error) {
      this.logger.warn(
        { err: error, messageType: message.type },
        'Failed to send IPC message to child process',
      );
    }
  }

  /**
   * Save configuration via service
   */
  async saveConfig() {
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

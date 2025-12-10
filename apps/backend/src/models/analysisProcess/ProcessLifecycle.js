/**
 * ProcessLifecycle Module
 *
 * Manages the complete process lifecycle:
 * - Process forking and initialization
 * - Graceful and forceful shutdown
 * - Exit code processing and normalization
 * - Auto-restart logic with exponential backoff
 *
 * Exit Scenarios:
 * 1. Manual stop (isManualStop=true) → Code normalized to 0, no restart
 * 2. Unexpected exit (code !== 0) → Auto-restart if intendedState='running'
 * 3. Connection error → Restart with exponential backoff
 * 4. Graceful exit (code=0, manual) → No restart
 */

import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { config } from '../../config/default.js';
import { ANALYSIS_PROCESS } from '../../constants.js';

// Lazy-load SSE manager
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

// Lazy-load DNS cache
let _dnsCache = null;
let _dnsCachePromise = null;
async function getDnsCache() {
  if (_dnsCache) {
    return _dnsCache;
  }

  if (_dnsCachePromise) {
    await _dnsCachePromise;
    return _dnsCache;
  }

  _dnsCachePromise = (async () => {
    const { dnsCache } = await import('../../services/dnsCache.js');
    _dnsCache = dnsCache;
    _dnsCachePromise = null;
    return _dnsCache;
  })();

  await _dnsCachePromise;
  return _dnsCache;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WRAPPER_SCRIPT = path.join(
  __dirname,
  '..',
  '..',
  'utils',
  'analysisWrapper.js',
);

export class ProcessLifecycleManager {
  /**
   * Initialize lifecycle manager
   * @param {AnalysisProcess} analysisProcess - Parent process reference
   * @param {Object} config - Application configuration
   */
  constructor(analysisProcess, config) {
    this.analysisProcess = analysisProcess;
    this.config = config;
  }

  /**
   * Calculate exponential backoff delay
   *
   * Formula: min(initial * 2^(attempts-1), max)
   *
   * Example progression:
   * - Attempt 1: 5000ms
   * - Attempt 2: 10000ms
   * - Attempt 3: 20000ms
   * - Attempt 4+: 60000ms (max)
   *
   * @private
   * @param {number} attempts - Current attempt number
   * @returns {number} Delay in milliseconds
   */
  calculateRestartDelay(attempts) {
    return Math.min(
      this.analysisProcess.restartDelay * Math.pow(2, attempts - 1),
      this.analysisProcess.maxRestartDelay,
    );
  }

  /**
   * Determine if process should auto-restart
   *
   * Restart conditions:
   * - NOT a manual stop
   * - intendedState is 'running'
   * - Either: non-zero exit code OR connection error detected
   *
   * @private
   * @param {number|null} exitCode - Process exit code
   * @returns {boolean} True if should restart
   */
  shouldRestart(exitCode) {
    const wasManualStop = this.analysisProcess.isManualStop;
    const intendedRunning = this.analysisProcess.intendedState === 'running';
    const errorExit = exitCode !== 0;
    const connectionError = this.analysisProcess.connectionErrorDetected;

    return !wasManualStop && intendedRunning && (errorExit || connectionError);
  }

  /**
   * Schedule auto-restart with regular delay
   *
   * Used for unexpected exits (non-zero exit code).
   * Restart happens without attempt counter / backoff.
   *
   * @private
   */
  scheduleAutoRestart() {
    const delay = this.config.analysis.autoRestartDelay || 5000;

    this.analysisProcess.logger.warn(
      'Listener exited unexpectedly, scheduling auto-restart',
    );
    this.analysisProcess.addLog(
      'Listener exited unexpectedly, auto-restarting...',
    );

    setTimeout(() => this.analysisProcess.start(), delay);
  }

  /**
   * Schedule restart after connection error with exponential backoff
   *
   * Used when SDK fails to establish initial connection.
   * Uses exponential backoff to prevent rapid restart loops.
   * No max attempt limit - retries indefinitely.
   *
   * @private
   */
  scheduleConnectionRestart() {
    this.analysisProcess.restartAttempts++;

    const delay = this.calculateRestartDelay(
      this.analysisProcess.restartAttempts,
    );

    this.analysisProcess.logger.warn(
      `Connection error detected, scheduling restart attempt ${this.analysisProcess.restartAttempts} in ${delay}ms`,
    );
    this.analysisProcess.addLog(
      `Connection error - restart attempt ${this.analysisProcess.restartAttempts} in ${delay / 1000}s`,
    );

    setTimeout(async () => {
      // Reset connection error flag before restart
      this.analysisProcess.connectionErrorDetected = false;
      try {
        await this.analysisProcess.start();
        // Reset attempts on successful start
        this.analysisProcess.restartAttempts = 0;
      } catch (error) {
        this.analysisProcess.logger.error(
          { err: error },
          'Failed to restart after connection error',
        );
        // Will retry again on next exit
      }
    }, delay);
  }

  /**
   * Register handlers for process events
   *
   * Handlers:
   * - stdout/stderr: Data streaming
   * - IPC messages: DNS cache requests
   * - exit: Process termination
   *
   * @private
   */
  setupProcessHandlers() {
    this.analysisProcess.stdoutBuffer = '';
    this.analysisProcess.stderrBuffer = '';

    // Handle stdout data
    if (this.analysisProcess.process.stdout) {
      this.analysisProcess.process.stdout.on(
        'data',
        this.analysisProcess.monitoringManager.handleOutput.bind(
          this.analysisProcess.monitoringManager,
          false,
        ),
      );
    }

    // Handle stderr data
    if (this.analysisProcess.process.stderr) {
      this.analysisProcess.process.stderr.on(
        'data',
        this.analysisProcess.monitoringManager.handleOutput.bind(
          this.analysisProcess.monitoringManager,
          true,
        ),
      );
    }

    // Handle IPC messages from child process (DNS cache requests)
    this.analysisProcess.process.on('message', async (message) => {
      const dnsCache = await getDnsCache();

      if (message.type === 'DNS_LOOKUP_REQUEST') {
        const result = await dnsCache.handleDNSLookupRequest(
          message.hostname,
          message.options,
        );
        this.analysisProcess.safeIPCSend({
          type: 'DNS_LOOKUP_RESPONSE',
          requestId: message.requestId,
          result,
        });
      } else if (message.type === 'DNS_RESOLVE4_REQUEST') {
        const result = await dnsCache.handleDNSResolve4Request(
          message.hostname,
        );
        this.analysisProcess.safeIPCSend({
          type: 'DNS_RESOLVE4_RESPONSE',
          requestId: message.requestId,
          result,
        });
      } else if (message.type === 'DNS_RESOLVE6_REQUEST') {
        const result = await dnsCache.handleDNSResolve6Request(
          message.hostname,
        );
        this.analysisProcess.safeIPCSend({
          type: 'DNS_RESOLVE6_RESPONSE',
          requestId: message.requestId,
          result,
        });
      }
    });

    // Handle process exit
    this.analysisProcess.process.once('exit', this.handleExit.bind(this));
  }

  /**
   * Start the analysis process
   *
   * Flow:
   * 1. Check for race conditions (already running, already starting)
   * 2. Initialize log state
   * 3. Fork child process with wrapper script
   * 4. Register process handlers
   * 5. Update status
   * 6. Notify frontend via SSE
   *
   * Throws on fork failure.
   */
  async start() {
    // Prevent race conditions - exit if already running or starting
    if (this.analysisProcess.process || this.analysisProcess.isStarting) {
      return;
    }

    this.analysisProcess.isStarting = true;

    try {
      // Initialize log state before starting
      await this.analysisProcess.logManager.initializeLogState();

      const filePath = path.join(
        config.paths.analysis,
        this.analysisProcess.analysisId,
        'index.js',
      );

      this.analysisProcess.logger.info('Starting analysis process');

      await this.analysisProcess.addLog(`Node.js ${process.version}`);

      // Load custom environment variables for this analysis
      const storedEnv = this.analysisProcess.service
        ? await this.analysisProcess.service.getEnvironment(
            this.analysisProcess.analysisId,
          )
        : {};

      // Construct a sanitized environment for the child process
      const safeEnv = {};
      if (config.process && config.process.allowedParentEnv) {
        for (const key of config.process.allowedParentEnv) {
          if (process.env[key]) {
            safeEnv[key] = process.env[key];
          }
        }
      }

      // Fork the wrapper script
      // stdio: ['inherit', 'pipe', 'pipe', 'ipc']
      // - inherit stdin
      // - pipe stdout for monitoring
      // - pipe stderr for monitoring
      // - ipc for DNS cache communication
      this.analysisProcess.process = fork(WRAPPER_SCRIPT, [filePath], {
        env: {
          ...safeEnv,
          ...(config.process?.additionalEnv || {}),
          ...storedEnv,
          STORAGE_BASE: config.storage.base,
        },
        stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      });

      if (!this.analysisProcess.process) {
        throw new Error('Failed to start analysis process');
      }

      this.analysisProcess.logger.info('Analysis process started successfully');

      // Register event handlers
      this.setupProcessHandlers();

      // Update status
      this.updateStatus('running', true);

      // Notify frontend
      const sseManager = await getSseManager();
      sseManager.broadcastAnalysisUpdate(this.analysisProcess.analysisId, {
        type: 'analysisUpdate',
        analysisId: this.analysisProcess.analysisId,
        analysisName: this.analysisProcess.analysisName,
        update: {
          status: 'running',
          enabled: true,
          startTime: new Date().toISOString(),
          startSequence: Date.now(),
        },
      });
    } catch (error) {
      this.analysisProcess.logger.error(
        { err: error },
        'Failed to start analysis process',
      );
      await this.analysisProcess.addLog(`ERROR: ${error.message}`);
      throw error;
    } finally {
      // Always reset the flag
      this.analysisProcess.isStarting = false;
    }
  }

  /**
   * Stop the analysis process gracefully
   *
   * Flow:
   * 1. Check if process is running
   * 2. Send SIGTERM (graceful shutdown)
   * 3. Wait for handleExit to complete all async cleanup
   * 4. Send SIGKILL if timeout exceeded
   * 5. handleExit performs all cleanup operations
   *
   * Force kill timeout: 5000ms (configurable)
   *
   * Note: All async cleanup (logging, status updates, config save) is handled
   * by handleExit() to avoid async callbacks in Promise constructors.
   */
  async stop() {
    if (
      !this.analysisProcess.process ||
      this.analysisProcess.status !== 'running'
    ) {
      return;
    }

    this.analysisProcess.logger.info('Stopping analysis process');

    await this.analysisProcess.addLog('Stopping analysis...');

    // Mark as manual stop for exit code normalization
    this.analysisProcess.isManualStop = true;
    this.analysisProcess.intendedState = 'stopped';

    // Create promise that handleExit will resolve when cleanup is complete
    const exitPromise = new Promise((resolve, reject) => {
      this.analysisProcess._exitPromiseResolve = resolve;
      this.analysisProcess._exitPromiseReject = reject;
    });

    // Send graceful termination signal
    this.analysisProcess.process.kill('SIGTERM');

    // Set up force kill timeout
    const forceKillTimer = setTimeout(() => {
      if (this.analysisProcess.process) {
        this.analysisProcess.logger.warn(
          'Force stopping process after timeout',
        );
        // Log without await - handleExit will handle final cleanup
        this.analysisProcess
          .addLog('Force stopping process...')
          .catch((err) => {
            this.analysisProcess.logger.error(
              { err },
              'Failed to log force stop message',
            );
          });
        this.analysisProcess.process.kill('SIGKILL');
      }
    }, config.analysis.forceKillTimeout);

    try {
      // Wait for handleExit to complete all async operations
      await exitPromise;
    } finally {
      clearTimeout(forceKillTimer);
      delete this.analysisProcess._exitPromiseResolve;
      delete this.analysisProcess._exitPromiseReject;
    }
  }

  /**
   * Update process status and intended state
   *
   * intendedState is only modified when:
   * - Starting: set to 'running'
   * - Manual stop: set to 'stopped' (done explicitly in stop())
   *
   * For unexpected exits, intendedState is preserved to allow auto-restart.
   * Connection errors also preserve intendedState.
   *
   * @param {string} status - Current status (running|stopped)
   * @param {boolean} enabled - User intent to run
   */
  updateStatus(status, enabled = false) {
    const previousStatus = this.analysisProcess.status;
    this.analysisProcess.status = status;
    this.analysisProcess.enabled = enabled;

    // Update intended state only when starting
    // For stopping, intendedState is preserved to allow auto-restart
    // Manual stops explicitly set intendedState = 'stopped' in stop()
    if (status === 'running') {
      this.analysisProcess.intendedState = 'running';
      this.analysisProcess.lastStartTime = new Date().toString();
    }

    this.analysisProcess.logger.debug(
      { previousStatus, status },
      'Status updated',
    );
  }

  /**
   * Handle process exit event
   *
   * Flow:
   * 1. Flush any remaining output buffers
   * 2. Normalize exit code (manual stops return 0)
   * 3. Log exit event
   * 4. Update status
   * 5. Notify frontend via SSE
   * 6. Save configuration
   * 7. Decide whether to auto-restart
   *    - Regular exit: restart if intendedState='running'
   *    - Connection error: restart with exponential backoff
   *    - Manual stop: don't restart
   *
   * @private
   * @param {number|null} code - Process exit code
   */
  async handleExit(code) {
    // Flush remaining buffered output
    if (this.analysisProcess.stdoutBuffer.trim()) {
      await this.analysisProcess.addLog(
        this.analysisProcess.stdoutBuffer.trim(),
      );
    }
    if (this.analysisProcess.stderrBuffer.trim()) {
      await this.analysisProcess.addLog(
        `ERROR: ${this.analysisProcess.stderrBuffer.trim()}`,
      );
    }

    // Normalize exit code for manual stops
    // When killed by signal (SIGTERM/SIGKILL), code is null
    // For manual stops, we report as code 0 (success)
    const wasManualStop = this.analysisProcess.isManualStop;
    const normalizedCode = wasManualStop ? 0 : code;

    this.analysisProcess.logger.info(
      {
        exitCode: code,
        normalizedCode,
        isManualStop: wasManualStop,
      },
      'Analysis process exited',
    );

    await this.analysisProcess.addLog(
      `Process exited with code ${normalizedCode}`,
    );
    this.analysisProcess.process = null;

    // Reset manual stop flag
    this.analysisProcess.isManualStop = false;

    // Update status
    this.updateStatus('stopped', false);

    // Notify frontend
    const sseManager = await getSseManager();
    sseManager.broadcastAnalysisUpdate(this.analysisProcess.analysisId, {
      type: 'analysisUpdate',
      analysisId: this.analysisProcess.analysisId,
      analysisName: this.analysisProcess.analysisName,
      update: {
        status: 'stopped',
        enabled: false,
        exitCode: normalizedCode,
        exitTime: new Date().toISOString(),
        exitSequence: Date.now(),
      },
    });

    // Save configuration
    await this.analysisProcess.saveConfig();

    // Notify stop() that exit handling is complete
    if (this.analysisProcess._exitPromiseResolve) {
      this.analysisProcess._exitPromiseResolve();
      delete this.analysisProcess._exitPromiseResolve;
      delete this.analysisProcess._exitPromiseReject;
    }

    // Decide whether to restart
    if (this.shouldRestart(code)) {
      if (this.analysisProcess.connectionErrorDetected) {
        this.scheduleConnectionRestart();
      } else {
        this.scheduleAutoRestart();
      }
    } else if (this.analysisProcess.connectionErrorDetected) {
      // Reset connection error flag if not restarting
      this.analysisProcess.connectionErrorDetected = false;
      this.analysisProcess.restartAttempts = 0;
    }
  }
}

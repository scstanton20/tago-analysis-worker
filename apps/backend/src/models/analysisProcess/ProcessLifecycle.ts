/**
 * ProcessLifecycle Module
 *
 * Manages the complete process lifecycle:
 * - Process forking and initialization
 * - Graceful and forceful shutdown
 * - Exit code processing and normalization
 * - Connection error restart with exponential backoff
 *
 * Restart Decision:
 * Only restarts when connectionErrorDetected AND intendedState is 'running'.
 * - Manual stop sets intendedState='stopped' → no restart
 * - Fatal API error (analysis not found) sets intendedState='stopped' → no restart
 * - Transient connection loss sets connectionErrorDetected=true → restart with backoff
 * - Code errors (non-zero exit without connection error) → no restart
 */

import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { config } from '../../config/default.ts';
import {
  formatError,
  formatExitCode,
  formatNodeVersion,
  formatStopping,
  formatForceStop,
  formatConnectionRestart,
} from '../../utils/logging/index.ts';
import { getServerTime, formatCompactTime } from '../../utils/serverTime.ts';
import { getSseManager, getDnsCache } from '../../utils/lazyLoader.ts';
import type {
  AnalysisProcessState,
  AnalysisStatus,
  DNSLookupRequest,
  DNSResolve4Request,
  DNSResolve6Request,
} from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WRAPPER_SCRIPT = path.resolve(
  __dirname,
  '..',
  '..',
  'utils',
  'analysisWrapper.ts',
);
// Resolve to absolute paths (no '..' segments) for Node.js Permission Model
const BACKEND_SRC = path.resolve(__dirname, '..', '..');
const BACKEND_ROOT = path.resolve(BACKEND_SRC, '..');

/** Sandbox configuration type */
type SandboxConfig = {
  readonly enabled: boolean;
  readonly allowChildProcess: boolean;
  readonly allowWorkerThreads: boolean;
};

/**
 * Build execArgv array with permission flags for sandboxed execution
 *
 * @param analysisFilePath - Path to the analysis index.js file
 * @param sandboxConfig - Sandbox configuration from config
 * @returns Array of Node.js CLI flags
 */
function buildSandboxExecArgv(
  analysisFilePath: string,
  sandboxConfig: SandboxConfig,
): string[] {
  if (!sandboxConfig.enabled) {
    return [];
  }

  const execArgv: string[] = ['--permission'];

  // Calculate allowed read paths (minimal set for security)
  // All paths must be absolute (resolved) for Node.js Permission Model
  // Use separate --allow-fs-read flags for each path
  const allowedReadPaths = [
    // The specific analysis index.js file - ONLY this analysis, not others
    path.resolve(analysisFilePath),
    // Backend utils/ folder for wrapper dependencies (logger, DNS cache)
    path.resolve(BACKEND_SRC, 'utils/'),
    // Backend constants.js (needed by logging utilities)
    path.resolve(BACKEND_SRC, 'constants.ts'),
    // node_modules (includes .pnpm/ with actual packages and symlinks)
    // With pnpm deploy, all dependencies are within this single node_modules
    path.resolve(BACKEND_ROOT, 'node_modules/'),
  ];

  // Add each path as a separate --allow-fs-read flag
  for (const allowedPath of allowedReadPaths) {
    execArgv.push(`--allow-fs-read=${allowedPath}`);
  }

  // Allow child process spawning only if explicitly enabled (default: false)
  if (sandboxConfig.allowChildProcess) {
    execArgv.push('--allow-child-process');
  }

  // Allow worker threads only if explicitly enabled (default: false)
  if (sandboxConfig.allowWorkerThreads) {
    execArgv.push('--allow-worker');
  }

  return execArgv;
}

/** Extended AnalysisProcess with method access */
type AnalysisProcessWithMethods = AnalysisProcessState & {
  addLog: (message: string) => Promise<void>;
  saveConfig: () => Promise<void>;
  monitoringManager: {
    handleOutput: (isError: boolean, data: Buffer) => void;
  };
  logManager: {
    initializeLogState: () => Promise<void>;
  };
  cleanupManager: {
    clearRuntimeState: () => void;
  };
  safeIPCSend: (message: object) => void;
  start: () => Promise<void>;
};

export class ProcessLifecycleManager {
  private analysisProcess: AnalysisProcessWithMethods;

  /**
   * Initialize lifecycle manager
   * @param analysisProcess - Parent process reference
   */
  constructor(analysisProcess: AnalysisProcessState) {
    this.analysisProcess = analysisProcess as AnalysisProcessWithMethods;
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
   * @param attempts - Current attempt number
   * @returns Delay in milliseconds
   */
  private calculateRestartDelay(attempts: number): number {
    return Math.min(
      this.analysisProcess.restartDelay * Math.pow(2, attempts - 1),
      this.analysisProcess.maxRestartDelay,
    );
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
  private scheduleConnectionRestart(): void {
    this.analysisProcess.restartAttempts++;

    const delay = this.calculateRestartDelay(
      this.analysisProcess.restartAttempts,
    );

    const restartTime = formatCompactTime(Date.now() + delay);

    this.analysisProcess.logger.warn(
      `Connection error detected, scheduling restart attempt ${this.analysisProcess.restartAttempts} at ${restartTime}`,
    );
    void this.analysisProcess.addLog(
      formatConnectionRestart(
        this.analysisProcess.restartAttempts,
        restartTime,
      ),
    );

    this.analysisProcess.restartTimer = setTimeout(async () => {
      this.analysisProcess.restartTimer = null;
      this.analysisProcess.connectionErrorDetected = false;
      try {
        await this.analysisProcess.start();
        this.analysisProcess.restartAttempts = 0;
      } catch (error) {
        this.analysisProcess.logger.error(
          { err: error },
          'Failed to restart after connection error',
        );
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
  private setupProcessHandlers(): void {
    this.analysisProcess.stdoutBuffer = '';
    this.analysisProcess.stderrBuffer = '';

    const process = this.analysisProcess.process!;

    // Handle stdout data
    if (process.stdout) {
      process.stdout.on(
        'data',
        this.analysisProcess.monitoringManager.handleOutput.bind(
          this.analysisProcess.monitoringManager,
          false,
        ),
      );
    }

    // Handle stderr data
    if (process.stderr) {
      process.stderr.on(
        'data',
        this.analysisProcess.monitoringManager.handleOutput.bind(
          this.analysisProcess.monitoringManager,
          true,
        ),
      );
    }

    // Handle IPC messages from child process (DNS cache requests)
    process.on('message', async (message: unknown) => {
      const dnsCache = await getDnsCache();
      const analysisId = this.analysisProcess.analysisId;
      const msg = message as
        | DNSLookupRequest
        | DNSResolve4Request
        | DNSResolve6Request;

      if (msg.type === 'DNS_LOOKUP_REQUEST') {
        const result = await dnsCache.handleDNSLookupRequest(
          msg.hostname,
          msg.options,
          analysisId,
        );
        this.analysisProcess.safeIPCSend({
          type: 'DNS_LOOKUP_RESPONSE',
          requestId: msg.requestId,
          result,
        });
      } else if (msg.type === 'DNS_RESOLVE4_REQUEST') {
        const result = await dnsCache.handleDNSResolve4Request(
          msg.hostname,
          analysisId,
        );
        this.analysisProcess.safeIPCSend({
          type: 'DNS_RESOLVE4_RESPONSE',
          requestId: msg.requestId,
          result,
        });
      } else if (msg.type === 'DNS_RESOLVE6_REQUEST') {
        const result = await dnsCache.handleDNSResolve6Request(
          msg.hostname,
          analysisId,
        );
        this.analysisProcess.safeIPCSend({
          type: 'DNS_RESOLVE6_RESPONSE',
          requestId: msg.requestId,
          result,
        });
      }
    });

    // Handle process-level errors (e.g. EPIPE on IPC channel)
    // Without this, an asynchronous 'error' event crashes the parent process
    process.on('error', (error) => {
      this.analysisProcess.logger.warn({ err: error }, 'Child process error');
    });

    // Handle process exit
    process.once('exit', this.handleExit.bind(this));
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
  async start(): Promise<void> {
    // Cancel any pending restart timer to prevent dual instances
    if (this.analysisProcess.restartTimer) {
      clearTimeout(this.analysisProcess.restartTimer);
      this.analysisProcess.restartTimer = null;
    }

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

      await this.analysisProcess.addLog(formatNodeVersion(process.version));

      // Load custom environment variables for this analysis
      const storedEnv = this.analysisProcess.service
        ? await this.analysisProcess.service.getEnvironment(
            this.analysisProcess.analysisId,
          )
        : {};

      // Construct a sanitized environment for the child process
      const safeEnv: Record<string, string> = {};
      if (config.process && config.process.allowedParentEnv) {
        for (const key of config.process.allowedParentEnv) {
          if (process.env[key]) {
            safeEnv[key] = process.env[key]!;
          }
        }
      }

      // Build sandbox execArgv if enabled
      const sandboxExecArgv = buildSandboxExecArgv(filePath, config.sandbox);

      if (sandboxExecArgv.length > 0) {
        this.analysisProcess.logger.info(
          { sandboxEnabled: true, execArgv: sandboxExecArgv },
          'Sandbox enabled - filesystem access restricted',
        );
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
          // Force ANSI colors in child process since stdout is piped (not a TTY)
          FORCE_COLOR: '1',
        },
        stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
        execArgv: sandboxExecArgv,
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
      await sseManager.broadcastAnalysisUpdate(
        this.analysisProcess.analysisId,
        {
          type: 'analysisUpdate',
          analysisId: this.analysisProcess.analysisId,
          analysisName: this.analysisProcess.analysisName,
          update: {
            status: 'running',
            enabled: true,
            startTime: getServerTime(),
            startSequence: Date.now(),
          },
        },
      );
    } catch (error) {
      this.analysisProcess.logger.error(
        { err: error },
        'Failed to start analysis process',
      );
      await this.analysisProcess.addLog(formatError((error as Error).message));
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
  async stop(): Promise<void> {
    if (
      !this.analysisProcess.process ||
      this.analysisProcess.status !== 'running'
    ) {
      return;
    }

    this.analysisProcess.logger.info('Stopping analysis process');

    await this.analysisProcess.addLog(formatStopping());

    // Cancel any pending restart timer
    if (this.analysisProcess.restartTimer) {
      clearTimeout(this.analysisProcess.restartTimer);
      this.analysisProcess.restartTimer = null;
    }

    // Mark as manual stop for exit code normalization
    this.analysisProcess.isManualStop = true;
    this.analysisProcess.intendedState = 'stopped';

    // Create promise that handleExit will resolve when cleanup is complete
    const exitPromise = new Promise<void>((resolve, reject) => {
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
        this.analysisProcess.addLog(formatForceStop()).catch((err) => {
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

    // Clear runtime state for fresh restart (logs, buffers, file logger)
    this.analysisProcess.cleanupManager.clearRuntimeState();

    // Clear DNS cache stats for this analysis
    const dnsCache = await getDnsCache();
    dnsCache.resetAnalysisStats(this.analysisProcess.analysisId);

    this.analysisProcess.logger.info(
      'Analysis stopped and runtime state cleared',
    );
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
   * @param status - Current status (running|stopped)
   * @param enabled - User intent to run
   */
  updateStatus(status: AnalysisStatus, enabled = false): void {
    const previousStatus = this.analysisProcess.status;
    this.analysisProcess.status = status;
    this.analysisProcess.enabled = enabled;

    // Update intended state only when starting
    // For stopping, intendedState is preserved to allow auto-restart
    // Manual stops explicitly set intendedState = 'stopped' in stop()
    if (status === 'running') {
      this.analysisProcess.intendedState = 'running';
      this.analysisProcess.lastStartTime = getServerTime();
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
   * 4. Update status and notify frontend via SSE
   * 5. Save configuration
   * 6. Auto-restart only if connectionErrorDetected AND intendedState='running'
   *
   * @private
   * @param code - Process exit code
   */
  async handleExit(code: number | null): Promise<void> {
    // Flush remaining buffered output
    if (this.analysisProcess.stdoutBuffer.trim()) {
      await this.analysisProcess.addLog(
        this.analysisProcess.stdoutBuffer.trim(),
      );
    }
    if (this.analysisProcess.stderrBuffer.trim()) {
      await this.analysisProcess.addLog(
        formatError(this.analysisProcess.stderrBuffer.trim()),
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

    await this.analysisProcess.addLog(formatExitCode(normalizedCode));
    this.analysisProcess.process = null;

    // Reset manual stop flag
    this.analysisProcess.isManualStop = false;

    // Update status
    this.updateStatus('stopped', false);

    // Notify frontend
    const sseManager = await getSseManager();
    await sseManager.broadcastAnalysisUpdate(this.analysisProcess.analysisId, {
      type: 'analysisUpdate',
      analysisId: this.analysisProcess.analysisId,
      analysisName: this.analysisProcess.analysisName,
      update: {
        status: 'stopped',
        enabled: false,
        exitCode: normalizedCode,
        exitTime: getServerTime(),
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

    // Restart only for connection errors when the analysis should be running.
    // Fatal errors and manual stops set intendedState='stopped', skipping this.
    if (this.analysisProcess.connectionErrorDetected) {
      if (this.analysisProcess.intendedState === 'running') {
        this.scheduleConnectionRestart();
      } else {
        this.analysisProcess.connectionErrorDetected = false;
        this.analysisProcess.restartAttempts = 0;
      }
    }
  }
}

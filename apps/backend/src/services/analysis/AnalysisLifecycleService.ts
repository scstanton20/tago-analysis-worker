/**
 * Analysis Lifecycle Service
 *
 * Manages the lifecycle of analysis processes including initialization,
 * starting, stopping, health checks, and connection verification.
 *
 * This service is responsible for:
 * - Initializing analyses from configuration and filesystem
 * - Starting and stopping analysis processes
 * - Managing health checks and automatic recovery
 * - Collecting process metrics
 * - Verifying intended state on startup
 *
 * @module analysis/AnalysisLifecycleService
 */
import type { Logger } from 'pino';
import type { AnalysisStatus } from '@tago-analysis-worker/types/domain';

import { config } from '../../config/default.ts';
import { ANALYSIS_SERVICE } from '../../constants.ts';
import {
  AnalysisProcess,
  type AnalysisServiceInterface,
} from '../../models/analysisProcess/index.ts';
import { createChildLogger } from '../../utils/logging/logger.ts';
import { collectChildProcessMetrics } from '../../utils/metrics-enhanced.ts';
import { safeReaddir, safeStat } from '../../utils/safePath.ts';
import { teamService } from '../teamService.ts';

import type {
  AnalysisConfigEntry,
  AnalysisToStart,
  IAnalysisConfigService,
  IAnalysisEnvironmentService,
  IAnalysisLogService,
  RunAnalysisResult,
  StartAnalysisWithLoggingResult,
  StopAnalysisResult,
  VerifyIntendedStateResult,
} from './types.ts';

const moduleLogger = createChildLogger('analysis-lifecycle-service');

/**
 * Service for managing analysis process lifecycle.
 *
 * Handles initialization, starting, stopping, health checks, and metrics collection.
 */
export class AnalysisLifecycleService {
  private readonly configService: IAnalysisConfigService;
  private readonly logService: IAnalysisLogService;
  private environmentService: IAnalysisEnvironmentService | null = null;

  /** Health check interval timer */
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /** Metrics collection interval timer */
  private metricsInterval: NodeJS.Timeout | null = null;

  /** Map of analysis IDs to their pending start promises (prevents concurrent starts) */
  private startLocks: Map<string, Promise<RunAnalysisResult>> = new Map();

  constructor(
    configService: IAnalysisConfigService,
    logService: IAnalysisLogService,
  ) {
    this.configService = configService;
    this.logService = logService;
  }

  /**
   * Set the environment service (called after construction to avoid circular dependencies).
   */
  setEnvironmentService(envService: IAnalysisEnvironmentService): void {
    this.environmentService = envService;
  }

  /**
   * Create a service adapter for AnalysisProcess.
   * Combines environment lookup with config saving.
   */
  private createServiceAdapter(): AnalysisServiceInterface {
    return {
      getEnvironment: async (analysisId: string) => {
        if (!this.environmentService) {
          moduleLogger.warn('Environment service not set, returning empty env');
          return {};
        }
        return this.environmentService.getEnvironment(analysisId);
      },
      saveConfig: () => this.configService.saveConfig(),
    };
  }

  /**
   * Initialize the lifecycle service.
   *
   * Loads configuration, initializes team service, discovers analyses from filesystem,
   * and starts periodic health checks.
   */
  async initialize(): Promise<void> {
    const configuration = await this.configService.getConfig();

    // Log config state for debugging
    const configAnalysesCount = Object.keys(
      configuration.analyses || {},
    ).length;
    moduleLogger.info(
      {
        configVersion: configuration.version,
        configAnalysesCount,
        sampleAnalysis:
          configAnalysesCount > 0
            ? Object.entries(configuration.analyses || {})[0]
            : null,
      },
      'Config loaded for initialization',
    );

    // Initialize team service after config is loaded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await teamService.initialize(this.configService as any);

    // Discover analyses from filesystem (directories are named by analysisId/UUID)
    const analysisDirectories = (await safeReaddir(
      config.paths.analysis,
    )) as string[];

    await Promise.all(
      analysisDirectories.map(async (analysisId: string) => {
        try {
          const indexPath = `${config.paths.analysis}/${analysisId}/index.js`;
          let stats;
          try {
            stats = await safeStat(indexPath, config.paths.analysis);
          } catch {
            moduleLogger.warn(
              { analysisId },
              'Skipping orphaned analysis directory (missing index.js)',
            );
            return;
          }
          if (stats.isFile()) {
            const analysisConfig = configuration.analyses?.[analysisId];
            await this.initializeAnalysis(analysisId, analysisConfig);
          }
        } catch (error) {
          moduleLogger.error({ error, analysisId }, 'Error loading analysis');
        }
      }),
    );

    // Save config to ensure any newly discovered analyses are persisted
    await this.configService.saveConfig();

    // Start periodic health check
    this.startHealthCheck();
  }

  /**
   * Initialize a single analysis from config.
   *
   * Creates an AnalysisProcess instance with the appropriate configuration
   * and initializes its log state.
   */
  async initializeAnalysis(
    analysisId: string,
    analysisConfig: Partial<AnalysisConfigEntry> = {},
  ): Promise<void> {
    const defaultConfig = {
      enabled: false,
      status: 'stopped' as AnalysisStatus,
      intendedState: 'stopped' as const,
      lastStartTime: null,
      teamId: null,
    };

    const fullConfig = { ...defaultConfig, ...analysisConfig };
    const analysisName = fullConfig.name || analysisId;

    // Warn if name is falling back to ID (indicates potential config issue)
    if (!fullConfig.name) {
      moduleLogger.warn(
        {
          analysisId,
          hasAnalysisConfig: !!analysisConfig,
          configKeys: analysisConfig ? Object.keys(analysisConfig) : [],
        },
        'Analysis name not found in config, using analysisId as name',
      );
    }

    const analysis = new AnalysisProcess(
      analysisId,
      analysisName,
      this.createServiceAdapter(),
    );

    Object.assign(analysis, {
      enabled: fullConfig.enabled,
      status: 'stopped',
      intendedState: fullConfig.intendedState || 'stopped',
      lastStartTime: fullConfig.lastStartTime,
      teamId: fullConfig.teamId,
    });

    await analysis.initializeLogState();

    this.configService.setAnalysis(analysisId, analysis);
  }

  /**
   * Start an analysis process with lock protection to prevent race conditions.
   *
   * If a start operation is already in progress for this analysis, waits for
   * that operation to complete and returns its result.
   */
  async runAnalysis(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<RunAnalysisResult> {
    logger.debug({ action: 'runAnalysis', analysisId }, 'Running analysis');

    const analysis = this.configService.getAnalysisProcess(analysisId);
    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    // Check if a start operation is already in progress
    if (this.startLocks.has(analysisId)) {
      logger.debug(
        { action: 'runAnalysis', analysisId },
        'Start operation already in progress, waiting for completion',
      );

      try {
        const result = await this.startLocks.get(analysisId)!;
        logger.debug(
          { action: 'runAnalysis', analysisId },
          'Concurrent start operation completed',
        );
        return result;
      } catch (error) {
        logger.error(
          { action: 'runAnalysis', analysisId, error },
          'Concurrent start operation failed',
        );
        throw error;
      }
    }

    // Check if analysis is already running
    if (analysis.status === 'running' && analysis.process) {
      logger.debug(
        { action: 'runAnalysis', analysisId },
        'Analysis is already running',
      );
      return {
        success: true,
        status: analysis.status,
        logs: analysis.logs,
        alreadyRunning: true,
      };
    }

    // Create a promise for this start operation and store it as a lock
    const startPromise = this.executeStart(analysis, analysisId, logger);
    this.startLocks.set(analysisId, startPromise);

    return startPromise;
  }

  /**
   * Execute the actual start operation for an analysis.
   */
  private async executeStart(
    analysis: AnalysisProcess,
    analysisId: string,
    logger: Logger,
  ): Promise<RunAnalysisResult> {
    try {
      await analysis.start();
      await this.configService.saveConfig();

      logger.info(
        { action: 'runAnalysis', analysisId, status: analysis.status },
        'Analysis started successfully',
      );

      return { success: true, status: analysis.status, logs: analysis.logs };
    } catch (error) {
      logger.error(
        { action: 'runAnalysis', analysisId, error },
        'Failed to start analysis',
      );
      throw error;
    } finally {
      this.startLocks.delete(analysisId);
    }
  }

  /**
   * Stop an analysis process.
   *
   * Sets the intended state to 'stopped' and terminates the process.
   */
  async stopAnalysis(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<StopAnalysisResult> {
    logger.debug({ action: 'stopAnalysis', analysisId }, 'Stopping analysis');

    const analysis = this.configService.getAnalysisProcess(analysisId);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    analysis.intendedState = 'stopped';
    await analysis.stop();
    await this.configService.saveConfig();

    logger.info({ action: 'stopAnalysis', analysisId }, 'Analysis stopped');
    return { success: true };
  }

  /**
   * Check if a start operation is currently in progress for an analysis.
   */
  isStartInProgress(analysisId: string): boolean {
    return this.startLocks.has(analysisId);
  }

  /**
   * Get the list of analysis IDs with start operations in progress.
   */
  getStartOperationsInProgress(): string[] {
    return Array.from(this.startLocks.keys());
  }

  /**
   * Start periodic health check for analyses.
   *
   * Runs every 5 minutes and helps recover from connection issues and internet outages.
   */
  startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const healthCheckIntervalMs = ANALYSIS_SERVICE.HEALTH_CHECK_INTERVAL_MS;

    this.healthCheckInterval = setInterval(async () => {
      moduleLogger.debug('Running periodic health check for analyses');

      try {
        await this.runHealthCheck();
      } catch (error) {
        moduleLogger.error(
          { err: error },
          'Error during periodic health check',
        );
      }
    }, healthCheckIntervalMs);

    moduleLogger.info(
      'Started periodic health check for analyses (5 minute interval)',
    );

    this.startMetricsCollection();
  }

  /**
   * Execute a single health check pass.
   */
  private async runHealthCheck(): Promise<void> {
    const analyses = this.configService.getAllAnalysisProcesses();

    for (const [analysisId, analysis] of analyses) {
      // Only restart if enabled AND intendedState is running
      // This prevents restarting disabled analyses that still have intendedState='running'
      if (
        analysis.enabled &&
        analysis.intendedState === 'running' &&
        analysis.status !== 'running'
      ) {
        moduleLogger.warn(
          `Health check: ${analysisId} should be running but is ${analysis.status}. Attempting restart.`,
        );

        try {
          await analysis.start();
          await this.logService.addLog(
            analysisId,
            'Restarted by periodic health check',
          );
          moduleLogger.info(
            `Health check: Successfully restarted ${analysisId}`,
          );

          if (analysis.connectionErrorDetected) {
            analysis.connectionErrorDetected = false;
            analysis.restartAttempts = 0;
          }
        } catch (error) {
          moduleLogger.error(
            { err: error, analysisId },
            'Health check: Failed to restart analysis',
          );
        }
      }
    }
  }

  /**
   * Stop periodic health checks and metrics collection.
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      moduleLogger.info('Stopped periodic health check');
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      moduleLogger.info('Stopped metrics collection');
    }
  }

  /**
   * Start periodic metrics collection for all analysis processes.
   */
  startMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    const metricsIntervalMs = ANALYSIS_SERVICE.METRICS_COLLECTION_INTERVAL_MS;

    this.metricsInterval = setInterval(async () => {
      try {
        const analyses = this.configService.getAllAnalysisProcesses();
        await collectChildProcessMetrics(analyses);
      } catch (error) {
        moduleLogger.debug({ err: error }, 'Error collecting process metrics');
      }
    }, metricsIntervalMs);

    moduleLogger.info('Started process metrics collection (1 second interval)');
  }

  /**
   * Verify intended state and restart analyses that should be running.
   *
   * Uses batched concurrent startup with connection verification.
   */
  async verifyIntendedState(): Promise<VerifyIntendedStateResult> {
    const shouldBeRunning = this.getAnalysesThatShouldBeRunning();
    const results: VerifyIntendedStateResult = {
      shouldBeRunning: shouldBeRunning.length,
      attempted: [],
      succeeded: [],
      failed: [],
      alreadyRunning: [],
      connected: [],
      connectionTimeouts: [],
    };

    moduleLogger.info(
      `Intended state verification: Found ${shouldBeRunning.length} analyses that should be running`,
    );

    const toStart = this.collectAnalysesToStart(shouldBeRunning, results);

    if (toStart.length === 0) {
      moduleLogger.info('No analyses need starting');
      return results;
    }

    const batchSize = parseInt(
      process.env.ANALYSIS_BATCH_SIZE ||
        String(ANALYSIS_SERVICE.BATCH_SIZE_DEFAULT),
      10,
    );
    const batches = this.createAnalysisBatches(toStart, batchSize);

    moduleLogger.info(
      `Starting ${batches.length} batches of up to ${batchSize} analyses each`,
    );

    await this.processBatches(batches, results);

    moduleLogger.info(
      `State verification complete: ${results.succeeded.length}/${toStart.length} started, ` +
        `${results.connected.length}/${results.succeeded.length} connected successfully`,
    );

    return results;
  }

  /**
   * Get the list of analysis IDs that have intendedState === 'running'.
   */
  getAnalysesThatShouldBeRunning(): string[] {
    const shouldBeRunning: string[] = [];
    const analyses = this.configService.getAllAnalysisProcesses();

    analyses.forEach((analysis, analysisId) => {
      if (analysis.intendedState === 'running') {
        shouldBeRunning.push(analysisId);
      }
    });

    return shouldBeRunning;
  }

  /**
   * Wait for an analysis to establish connection to TagoIO.
   */
  async waitForAnalysisConnection(
    analysis: AnalysisProcess,
    timeoutMs: number = ANALYSIS_SERVICE.CONNECTION_TIMEOUT_MS,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let resolved = false;

      if (analysis.isConnected) {
        resolve(true);
        return;
      }

      const checkInterval = setInterval(() => {
        if (analysis.isConnected) {
          clearInterval(checkInterval);
          if (!resolved) {
            resolved = true;
            resolve(true);
          }
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        }
      }, ANALYSIS_SERVICE.CONNECTION_CHECK_INTERVAL_MS);
    });
  }

  /**
   * Get the status of an analysis process.
   */
  getProcessStatus(analysisId: string): AnalysisStatus {
    const analysis = this.configService.getAnalysisProcess(analysisId);
    return analysis ? analysis.status : 'stopped';
  }

  /**
   * Get the count of currently running analyses.
   */
  getRunningAnalysesCount(): number {
    const analyses = this.configService.getAllAnalysisProcesses();
    return Array.from(analyses.values()).filter(
      (analysis) => analysis && analysis.status === 'running',
    ).length;
  }

  // ============================================================================
  // BATCH PROCESSING HELPERS
  // ============================================================================

  /**
   * Collect analyses that need to be started.
   *
   * Filters out already-running and healthy analyses.
   */
  collectAnalysesToStart(
    shouldBeRunning: string[],
    results: VerifyIntendedStateResult,
  ): AnalysisToStart[] {
    const toStart: AnalysisToStart[] = [];

    for (const analysisId of shouldBeRunning) {
      const analysis = this.configService.getAnalysisProcess(analysisId);
      if (!analysis) continue;

      results.attempted.push(analysisId);
      const hasLiveProcess =
        analysis.process && !analysis.process.killed && analysis.process.pid;

      if (analysis.status === 'running' && hasLiveProcess) {
        results.alreadyRunning.push(analysisId);
        moduleLogger.debug(
          `${analysisId} is already running with PID ${analysis.process?.pid}`,
        );
        continue;
      }

      // Reset status if process is dead but marked as running
      if (analysis.status === 'running' && !hasLiveProcess) {
        moduleLogger.info(
          `${analysisId} status shows running but no live process found - resetting status and restarting`,
        );
        analysis.status = 'stopped';
        analysis.process = null;
      }

      toStart.push({ analysisId, analysis });
    }

    return toStart;
  }

  /**
   * Create batches of analyses for concurrent startup.
   */
  createAnalysisBatches(
    toStart: AnalysisToStart[],
    batchSize: number,
  ): AnalysisToStart[][] {
    const batches: AnalysisToStart[][] = [];
    for (let i = 0; i < toStart.length; i += batchSize) {
      batches.push(toStart.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process all batches of analyses.
   *
   * Starts each batch and waits for connections.
   */
  async processBatches(
    batches: AnalysisToStart[][],
    results: VerifyIntendedStateResult,
  ): Promise<void> {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      moduleLogger.info(
        `Starting batch ${batchIndex + 1}/${batches.length} with ${batch.length} analyses`,
      );

      await this.processBatch(batch, results);

      moduleLogger.info(`Batch ${batchIndex + 1} complete`);

      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, ANALYSIS_SERVICE.BATCH_DELAY_MS),
        );
      }
    }
  }

  /**
   * Process a single batch of analyses.
   */
  async processBatch(
    batch: AnalysisToStart[],
    results: VerifyIntendedStateResult,
  ): Promise<void> {
    const startPromises = batch.map(({ analysisId, analysis }) =>
      this.startAnalysisWithLogging(analysisId, analysis, results),
    );

    const startResults = await Promise.all(startPromises);

    const connectionPromises = startResults
      .filter((r) => r.started)
      .map(({ analysisId, analysis }) =>
        this.verifyAnalysisConnection(analysisId, analysis, results),
      );

    await Promise.all(connectionPromises);
  }

  /**
   * Start an analysis and log the result.
   */
  async startAnalysisWithLogging(
    analysisId: string,
    analysis: AnalysisProcess,
    results: VerifyIntendedStateResult,
  ): Promise<StartAnalysisWithLoggingResult> {
    try {
      moduleLogger.info(`Starting ${analysisId}`);
      await analysis.start();
      results.succeeded.push(analysisId);
      await this.logService.addLog(
        analysisId,
        'Restarted during intended state verification',
      );
      return { analysisId, analysis, started: true };
    } catch (error) {
      moduleLogger.error(
        { err: error, analysisId },
        'Failed to start analysis',
      );
      results.failed.push({ analysisId, error: (error as Error).message });
      return { analysisId, analysis, started: false, error: error as Error };
    }
  }

  /**
   * Verify that an analysis has established a connection.
   */
  async verifyAnalysisConnection(
    analysisId: string,
    analysis: AnalysisProcess,
    results: VerifyIntendedStateResult,
  ): Promise<void> {
    const connected = await this.waitForAnalysisConnection(
      analysis,
      ANALYSIS_SERVICE.CONNECTION_TIMEOUT_MS,
    );

    if (connected) {
      moduleLogger.info(`${analysisId} connected successfully`);
      results.connected.push(analysisId);
    } else {
      moduleLogger.warn(`${analysisId} connection timeout (proceeding anyway)`);
      results.connectionTimeouts.push(analysisId);
    }
  }

  // ==========================================================================
  // TEST HELPERS (for resetting state in tests)
  // ==========================================================================

  /**
   * Reset the startLocks Map (for testing only).
   */
  resetStartLocks(): void {
    this.startLocks = new Map();
  }

  /**
   * Get the startLocks Map (for testing only).
   */
  getStartLocks(): Map<string, Promise<RunAnalysisResult>> {
    return this.startLocks;
  }

  /**
   * Get the healthCheckInterval (for testing only).
   */
  getHealthCheckInterval(): NodeJS.Timeout | null {
    return this.healthCheckInterval;
  }

  /**
   * Get the metricsInterval (for testing only).
   */
  getMetricsInterval(): NodeJS.Timeout | null {
    return this.metricsInterval;
  }
}

/**
 * Factory function to create an AnalysisLifecycleService instance.
 */
export function createAnalysisLifecycleService(
  configService: IAnalysisConfigService,
  logService: IAnalysisLogService,
): AnalysisLifecycleService {
  return new AnalysisLifecycleService(configService, logService);
}

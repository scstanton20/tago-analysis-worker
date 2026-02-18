/**
 * ProcessCleanup Module
 *
 * Responsible for cleaning up all resources associated with an analysis process.
 * Ensures proper closure of file handles, timers, and state cleanup.
 *
 * CRITICAL: Fixes Pino file logger resource leak by properly closing streams.
 */

import type { AnalysisProcessState } from './types.ts';

/** Extended AnalysisProcess with method access for cleanup operations */
type AnalysisProcessWithMethods = AnalysisProcessState & {
  logManager: {
    initializeFileLogger: () => void;
  };
};

export class ProcessCleanupManager {
  private analysisProcess: AnalysisProcessWithMethods;

  /**
   * Initialize cleanup manager
   * @param analysisProcess - Parent process reference
   */
  constructor(analysisProcess: AnalysisProcessState) {
    this.analysisProcess = analysisProcess as AnalysisProcessWithMethods;
  }

  /**
   * Close file logger stream and prevent resource leaks
   *
   * This is the KEY fix for the resource leak issue:
   * 1. Pino doesn't automatically close destination streams
   * 2. We must track and destroy the stream explicitly
   * 3. Without this, file descriptors accumulate
   *
   * @private
   */
  private closeFileLogger(): void {
    if (!this.analysisProcess.fileLogger) {
      return;
    }

    try {
      // Step 1: Flush any pending data to disk
      if (typeof this.analysisProcess.fileLogger.flush === 'function') {
        this.analysisProcess.fileLogger.flush();
      }

      // Step 2: Close the underlying stream (THIS FIXES THE LEAK)
      if (this.analysisProcess.fileLoggerStream) {
        // The destination stream must be explicitly destroyed
        if (
          typeof this.analysisProcess.fileLoggerStream.destroy === 'function'
        ) {
          this.analysisProcess.fileLoggerStream.destroy();
        }
        this.analysisProcess.fileLoggerStream = null;
      }

      // Step 3: Clear logger reference
      this.analysisProcess.fileLogger = null;
    } catch (error) {
      this.analysisProcess.logger.warn(
        { err: error },
        'Error closing file logger during cleanup',
      );
      // Ensure references are cleared even if error occurs
      this.analysisProcess.fileLogger = null;
      this.analysisProcess.fileLoggerStream = null;
    }
  }

  /**
   * Clear connection grace timer
   * @private
   */
  private clearConnectionGracePeriod(): void {
    if (this.analysisProcess.connectionGraceTimer) {
      clearTimeout(this.analysisProcess.connectionGraceTimer);
      this.analysisProcess.connectionGraceTimer = null;
    }
  }

  /**
   * Reset connection-related state
   * @private
   */
  private resetConnectionState(): void {
    this.analysisProcess.reconnectionAttempts = 0;
    this.analysisProcess.isConnected = false;
    this.analysisProcess.connectionErrorDetected = false;
    if (this.analysisProcess.restartTimer) {
      clearTimeout(this.analysisProcess.restartTimer);
      this.analysisProcess.restartTimer = null;
    }
  }

  /**
   * Reset log-related state
   * @private
   */
  private resetLogState(): void {
    this.analysisProcess.logs = [];
    this.analysisProcess.logSequence = 0;
    this.analysisProcess.totalLogCount = 0;
  }

  /**
   * Reset output buffers
   * @private
   */
  private resetOutputBuffers(): void {
    this.analysisProcess.stdoutBuffer = '';
    this.analysisProcess.stderrBuffer = '';
  }

  /**
   * Reset process-related state
   * @private
   */
  private resetProcessState(): void {
    this.analysisProcess.status = 'stopped';
    this.analysisProcess.enabled = false;
    this.analysisProcess.intendedState = 'stopped';
    this.analysisProcess.connectionErrorDetected = false;
    this.analysisProcess.restartAttempts = 0;
    this.analysisProcess.isStarting = false;
    this.analysisProcess.isManualStop = false;
  }

  /**
   * Clear runtime state after stopping an analysis
   *
   * Called after stop() to ensure a fresh start on next run.
   * Clears logs, resets counters, and reinitializes file logger.
   *
   * Unlike cleanup(), this preserves the AnalysisProcess instance
   * and prepares it for restart.
   */
  clearRuntimeState(): void {
    this.analysisProcess.logger.debug(
      'Clearing runtime state for fresh restart',
    );

    // Step 1: Clear in-memory logs
    this.resetLogState();

    // Step 2: Clear output buffers
    this.resetOutputBuffers();

    // Step 3: Reset connection state
    this.resetConnectionState();

    // Step 4: Clear connection grace timer
    this.clearConnectionGracePeriod();

    // Step 5: Close and reinitialize file logger for fresh log file
    this.closeFileLogger();
    this.analysisProcess.logManager.initializeFileLogger();

    this.analysisProcess.logger.debug('Runtime state cleared successfully');
  }

  /**
   * Orchestrate full cleanup of analysis resources
   *
   * Called when:
   * - Analysis is deleted
   * - Process needs to be stopped permanently
   * - Error recovery requires clean slate
   *
   * Ensures all file descriptors, timers, and memory are released.
   */
  async cleanup(): Promise<void> {
    this.analysisProcess.logger.info('Cleaning up analysis resources');

    // Step 1: Kill process if still running
    if (this.analysisProcess.process && !this.analysisProcess.process.killed) {
      try {
        this.analysisProcess.process.kill('SIGKILL');
      } catch (error) {
        this.analysisProcess.logger.warn(
          { err: error },
          'Error killing process during cleanup',
        );
      }
      this.analysisProcess.process = null;
    }

    // Step 2: Clear connection grace timer
    this.clearConnectionGracePeriod();

    // Step 3: Close file logger and fix resource leak
    this.closeFileLogger();

    // Step 4: Reset all state
    this.resetConnectionState();
    this.resetLogState();
    this.resetOutputBuffers();
    this.resetProcessState();

    this.analysisProcess.logger.info(
      'Analysis resources cleaned up successfully',
    );
  }
}

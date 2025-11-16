/**
 * ProcessCleanup Module
 *
 * Responsible for cleaning up all resources associated with an analysis process.
 * Ensures proper closure of file handles, timers, and state cleanup.
 *
 * CRITICAL: Fixes Pino file logger resource leak by properly closing streams.
 */

export class ProcessCleanupManager {
  /**
   * Initialize cleanup manager
   * @param {AnalysisProcess} analysisProcess - Parent process reference
   */
  constructor(analysisProcess) {
    this.analysisProcess = analysisProcess;
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
  closeFileLogger() {
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
  async clearConnectionGracePeriod() {
    if (this.analysisProcess.connectionGraceTimer) {
      clearTimeout(this.analysisProcess.connectionGraceTimer);
      this.analysisProcess.connectionGraceTimer = null;
    }
  }

  /**
   * Reset connection-related state
   * @private
   */
  async resetConnectionState() {
    this.analysisProcess.reconnectionAttempts = 0;
    this.analysisProcess.isConnected = false;
    this.analysisProcess.connectionErrorDetected = false;
  }

  /**
   * Reset log-related state
   * @private
   */
  async resetLogState() {
    this.analysisProcess.logs = [];
    this.analysisProcess.logSequence = 0;
    this.analysisProcess.totalLogCount = 0;
  }

  /**
   * Reset output buffers
   * @private
   */
  async resetOutputBuffers() {
    this.analysisProcess.stdoutBuffer = '';
    this.analysisProcess.stderrBuffer = '';
  }

  /**
   * Reset process-related state
   * @private
   */
  async resetProcessState() {
    this.analysisProcess.status = 'stopped';
    this.analysisProcess.enabled = false;
    this.analysisProcess.intendedState = 'stopped';
    this.analysisProcess.connectionErrorDetected = false;
    this.analysisProcess.restartAttempts = 0;
    this.analysisProcess.isStarting = false;
    this.analysisProcess.isManualStop = false;
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
  async cleanup() {
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
    await this.clearConnectionGracePeriod();

    // Step 3: Close file logger and fix resource leak
    this.closeFileLogger();

    // Step 4: Reset all state
    await this.resetConnectionState();
    await this.resetLogState();
    await this.resetOutputBuffers();
    await this.resetProcessState();

    this.analysisProcess.logger.info(
      'Analysis resources cleaned up successfully',
    );
  }
}

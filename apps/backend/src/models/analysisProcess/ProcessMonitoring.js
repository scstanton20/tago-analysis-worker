/**
 * ProcessMonitoring Module
 *
 * Monitors process health and connection status:
 * - Detects SDK connection state from stdout/stderr
 * - Manages connection grace period (30s timeout)
 * - Handles reconnection attempts with exponential backoff
 * - Processes stdout/stderr with line buffering
 *
 * Patterns Detected:
 * 1. "Connection was closed, trying to reconnect..." → Start grace period
 * 2. "Error :: Analysis not found or not active." → Fatal error, kill immediately
 * 3. "Connected to TagoIO ::" or "Waiting for analysis trigger" → Connection success
 */

export class ProcessMonitor {
  /**
   * Initialize process monitor
   * @param {AnalysisProcess} analysisProcess - Parent process reference
   * @param {Object} config - Application configuration
   */
  constructor(analysisProcess, config) {
    this.analysisProcess = analysisProcess;
    this.config = config;
  }

  /**
   * Detect SDK reconnection attempt pattern
   * @private
   * @param {string} line - Output line to check
   * @returns {boolean} True if reconnection attempt detected
   */
  detectReconnectionAttempt(line) {
    return line.includes('¬ Connection was closed, trying to reconnect...');
  }

  /**
   * Detect SDK connection success pattern
   * @private
   * @param {string} line - Output line to check
   * @returns {boolean} True if connection success detected
   */
  detectConnectionSuccess(line) {
    return (
      line.includes('¬ Connected to TagoIO ::') ||
      line.includes('¬ Waiting for analysis trigger')
    );
  }

  /**
   * Detect fatal analysis error pattern
   * @private
   * @param {string} line - Output line to check
   * @returns {boolean} True if fatal error detected
   */
  detectFatalError(line) {
    return line.includes('¬ Error :: Analysis not found or not active.');
  }

  /**
   * Handle SDK reconnection attempt
   *
   * - Increment reconnection counter
   * - Start grace period on first attempt
   * - Add log message with attempt count
   *
   * Grace period (30 seconds):
   * - SDK is allowed to reconnect within this window
   * - If connected within window, cancel the timer
   * - If window expires without connection, kill process
   *
   * @private
   */
  handleReconnectionAttempt() {
    this.analysisProcess.reconnectionAttempts++;
    this.analysisProcess.isConnected = false;

    this.analysisProcess.logger.info(
      `SDK reconnection attempt ${this.analysisProcess.reconnectionAttempts}`,
    );

    // Start grace period timer on first attempt
    if (!this.analysisProcess.connectionGraceTimer) {
      this.analysisProcess.logger.info(
        `Starting ${this.analysisProcess.connectionGracePeriod}ms grace period for SDK reconnection`,
      );

      this.analysisProcess.connectionGraceTimer = setTimeout(() => {
        // Grace period expired without successful connection
        if (!this.analysisProcess.isConnected) {
          this.analysisProcess.logger.warn(
            `Connection grace period expired without success after ${this.analysisProcess.reconnectionAttempts} attempts`,
          );
          this.analysisProcess.connectionErrorDetected = true;

          // Kill the process since connection failed
          if (
            this.analysisProcess.process &&
            !this.analysisProcess.process.killed
          ) {
            this.analysisProcess.process.kill('SIGTERM');
          }
        }
      }, this.analysisProcess.connectionGracePeriod);
    }
  }

  /**
   * Handle successful SDK connection
   *
   * - Clear grace period timer
   * - Reset reconnection attempt counter
   * - Reset connection error flag
   * - Update connection state
   *
   * @private
   */
  async handleConnectionSuccess() {
    // Clear grace timer if active
    if (this.analysisProcess.connectionGraceTimer) {
      clearTimeout(this.analysisProcess.connectionGraceTimer);
      this.analysisProcess.connectionGraceTimer = null;

      this.analysisProcess.logger.info(
        `SDK connection successful after ${this.analysisProcess.reconnectionAttempts} reconnection attempts`,
      );
    }

    this.analysisProcess.isConnected = true;
    this.analysisProcess.reconnectionAttempts = 0;
    this.analysisProcess.connectionErrorDetected = false;
  }

  /**
   * Handle fatal analysis error
   *
   * Fatal errors (analysis not found/inactive) indicate:
   * - Configuration mismatch
   * - Analysis was deleted
   * - Permission issues
   *
   * Should kill immediately, not wait for grace period.
   *
   * @private
   */
  async handleFatalError() {
    this.analysisProcess.logger.error(
      'Analysis not found or not active - fatal error',
    );
    this.analysisProcess.connectionErrorDetected = true;

    // Clear grace timer if active
    if (this.analysisProcess.connectionGraceTimer) {
      clearTimeout(this.analysisProcess.connectionGraceTimer);
      this.analysisProcess.connectionGraceTimer = null;
    }

    // Kill immediately for fatal errors
    if (this.analysisProcess.process && !this.analysisProcess.process.killed) {
      this.analysisProcess.process.kill('SIGTERM');
    }
  }

  /**
   * Process stdout/stderr output with pattern detection
   *
   * Flow:
   * 1. Buffer incomplete lines
   * 2. Process complete lines
   * 3. Detect patterns (connection, errors)
   * 4. Take appropriate action (grace period, kill, log)
   * 5. Broadcast logs via SSE
   *
   * Line buffering handles:
   * - Data arriving in chunks mid-line
   * - Multiple lines in single chunk
   * - Final incomplete lines
   *
   * @param {boolean} isError - True for stderr, false for stdout
   * @param {Buffer} data - Output data chunk
   */
  async handleOutput(isError, data) {
    const buffer = isError
      ? this.analysisProcess.stderrBuffer
      : this.analysisProcess.stdoutBuffer;
    const lines = data.toString().split('\n');

    lines.forEach((line, index) => {
      if (index === lines.length - 1) {
        // Last item: incomplete line, save to buffer
        if (isError) {
          this.analysisProcess.stderrBuffer = line;
        } else {
          this.analysisProcess.stdoutBuffer = line;
        }
      } else {
        // Complete line: process it
        const fullLine = (buffer + line).trim();
        if (fullLine) {
          // Process pattern detection
          if (this.detectReconnectionAttempt(fullLine)) {
            this.handleReconnectionAttempt();
            this.analysisProcess.addLog(
              `SDK reconnecting (attempt ${this.analysisProcess.reconnectionAttempts})...`,
            );
          } else if (this.detectFatalError(fullLine)) {
            this.handleFatalError();
          } else if (this.detectConnectionSuccess(fullLine)) {
            this.handleConnectionSuccess();
          }

          // Log the message (with ERROR prefix for stderr)
          this.analysisProcess.addLog(
            isError ? `ERROR: ${fullLine}` : fullLine,
          );
        }

        // Clear buffer for next line
        if (isError) {
          this.analysisProcess.stderrBuffer = '';
        } else {
          this.analysisProcess.stdoutBuffer = '';
        }
      }
    });
  }

  /**
   * Get current connection status
   * @returns {Object} Connection status info
   */
  getConnectionStatus() {
    return {
      isConnected: this.analysisProcess.isConnected,
      reconnectionAttempts: this.analysisProcess.reconnectionAttempts,
      connectionErrorDetected: this.analysisProcess.connectionErrorDetected,
      graceTimerActive: this.analysisProcess.connectionGraceTimer !== null,
    };
  }

  /**
   * Reset connection state
   * Called during cleanup or error recovery
   */
  resetConnectionState() {
    this.analysisProcess.reconnectionAttempts = 0;
    this.analysisProcess.isConnected = false;
    this.analysisProcess.connectionErrorDetected = false;
  }
}

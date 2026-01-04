/**
 * Frontend Log Event Bus
 *
 * Mirrors the backend's better-sse per-analysis channels on the frontend.
 * Provides a lightweight pub/sub for routing logs from SSE to LazyLog
 * without going through React state.
 *
 * Architecture:
 *   Backend SSE channel → SSEAnalysesProvider.handleLog → logEventBus.emit()
 *                                                              ↓
 *                                          useAnalysisLogs subscription
 *                                                              ↓
 *                                          LazyLog.appendLines() (no re-render)
 *
 * This is a pure pipe - no caching, no deduplication. Backend is trusted.
 */
class LogEventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} analysisId → callbacks */
    this.listeners = new Map();
  }

  /**
   * Check if there are any subscribers for an analysis
   * Used for early exit optimization in handleLog
   * @param {string} analysisId - The analysis ID
   * @returns {boolean} True if there are subscribers
   */
  hasSubscribers(analysisId) {
    const callbacks = this.listeners.get(analysisId);
    return callbacks !== undefined && callbacks.size > 0;
  }

  /**
   * Subscribe to log events for a specific analysis
   * @param {string} analysisId - The analysis ID to subscribe to
   * @param {Function} callback - Called with each log entry
   * @returns {Function} Unsubscribe function
   */
  subscribe(analysisId, callback) {
    if (!this.listeners.has(analysisId)) {
      this.listeners.set(analysisId, new Set());
    }
    this.listeners.get(analysisId).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(analysisId);
      if (callbacks) {
        callbacks.delete(callback);
        // Clean up empty sets
        if (callbacks.size === 0) {
          this.listeners.delete(analysisId);
        }
      }
    };
  }

  /**
   * Emit a log event to subscribers of a specific analysis
   * @param {string} analysisId - The analysis ID
   * @param {Object} log - The log entry
   */
  emit(analysisId, log) {
    const callbacks = this.listeners.get(analysisId);
    if (!callbacks) return; // Early exit if no subscribers

    for (const cb of callbacks) {
      try {
        cb(log);
      } catch (error) {
        console.error('Error in log event bus callback:', error);
      }
    }
  }

  /**
   * Notify subscribers that logs were cleared for an analysis
   * @param {string} analysisId - The analysis ID
   */
  clear(analysisId) {
    const callbacks = this.listeners.get(analysisId);
    if (!callbacks) return; // Early exit if no subscribers

    for (const cb of callbacks) {
      try {
        cb({ _cleared: true });
      } catch (error) {
        console.error('Error in log clear callback:', error);
      }
    }
  }
}

// Singleton instance
export const logEventBus = new LogEventBus();

/**
 * Shared utilities, constants, and helpers for SSE module
 * No external dependencies - can be used standalone
 */

// ========================================================================
// CONSTANTS (from SSE constant imports)
// ========================================================================

// Import SSE constants from constants.js for consistency
import { SSE } from '../../constants.js';

// Re-export for convenience
export const HEARTBEAT_INTERVAL_MS = SSE.HEARTBEAT_INTERVAL_MS;
export const METRICS_INTERVAL_MS = SSE.METRICS_BROADCAST_INTERVAL_MS;
export const STALE_CONNECTION_TIMEOUT = SSE.STALE_CONNECTION_TIMEOUT_MS;
export const SSE_API_VERSION = SSE.API_VERSION;
export const SESSION_ID_SUBSTRING_START = SSE.SESSION_ID_SUBSTRING_START;
export const SESSION_ID_SUBSTRING_END = SSE.SESSION_ID_SUBSTRING_END;
export const FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS =
  SSE.FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS;

// ========================================================================
// SESSION UTILITIES
// ========================================================================

/**
 * Generate unique session ID
 * Matches original implementation from sse.js lines 100-112
 * @returns {string} Unique session identifier
 */
export function generateSessionId() {
  return (
    Math.random()
      .toString(36)
      .substring(SESSION_ID_SUBSTRING_START, SESSION_ID_SUBSTRING_END) +
    Math.random()
      .toString(36)
      .substring(SESSION_ID_SUBSTRING_START, SESSION_ID_SUBSTRING_END)
  );
}

/**
 * Validate analysis name format
 * @param {string} name - Analysis name to validate
 * @returns {boolean} True if valid
 */
export function isValidAnalysisName(name) {
  return typeof name === 'string' && name.length > 0 && name.trim() === name;
}

/**
 * Validate team ID format
 * @param {string} teamId - Team ID to validate
 * @returns {boolean} True if valid
 */
export function isValidTeamId(teamId) {
  return typeof teamId === 'string' && teamId.length > 0;
}

/**
 * Extract analysis ID from various log data formats
 * @param {Object} logData - Log data object
 * @returns {string|null} Analysis ID or null
 */
export function extractAnalysisId(logData) {
  return logData?.analysisId || null;
}

/**
 * Format container status for display
 * @param {string} status - Raw status
 * @returns {string} Human-readable status
 */
export function formatContainerStatus(status) {
  const statusMap = {
    ready: 'healthy',
    error: 'error',
    initializing: 'initializing',
  };
  return statusMap[status] || 'unknown';
}

/**
 * Check if a value is iterable (Set, Array, etc.)
 * @param {*} value - Value to check
 * @returns {boolean} True if iterable
 */
export function isIterable(value) {
  return value != null && typeof value[Symbol.iterator] === 'function';
}

// ========================================================================
// TYPE DEFINITIONS (JSDoc)
// ========================================================================

/**
 * @typedef {Object} Session
 * @property {string} id - Unique session identifier
 * @property {Function} push - Push data to client
 * @property {Object} state - Session state object
 * @property {string} state.userId - User ID
 * @property {Object} state.user - User object
 * @property {string} state.user.id - User ID
 * @property {string} state.user.role - User role
 * @property {Set<string>} state.subscribedChannels - Subscribed analysis IDs
 * @property {boolean} isConnected - Connection status
 * @property {Date} [lastPushAt] - Last push timestamp
 */

/**
 * @typedef {Object} SSEMessage
 * @property {string} type - Message type (init, log, statusUpdate, etc.)
 * @property {*} [data] - Message payload
 * @property {string} [timestamp] - Message timestamp
 */

/**
 * @typedef {Object} ContainerState
 * @property {string} status - Container status
 * @property {Date} startTime - Container start timestamp
 * @property {string} message - Status message
 */

/**
 * @typedef {Object} SubscriptionResult
 * @property {boolean} success - Operation success
 * @property {string[]} subscribed - Successfully subscribed analyses
 * @property {string[]} [denied] - Permission denied analyses
 * @property {string} sessionId - Session identifier
 */

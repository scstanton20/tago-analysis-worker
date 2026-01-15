/**
 * Shared utilities, constants, and helpers for SSE module
 * No external dependencies - can be used standalone
 */

import { v4 as uuidv4 } from 'uuid';

// Import SSE constants from constants.js for consistency
import { SSE } from '../../constants.ts';

// Re-export types from shared package for backward compatibility
export type {
  SubscriptionResult,
  UnsubscriptionResult,
  ConnectionStats,
} from '@tago-analysis-worker/types';

// Re-export for convenience
export const HEARTBEAT_INTERVAL_MS = SSE.HEARTBEAT_INTERVAL_MS;
export const METRICS_INTERVAL_MS = SSE.METRICS_BROADCAST_INTERVAL_MS;
export const STALE_CONNECTION_TIMEOUT = SSE.STALE_CONNECTION_TIMEOUT_MS;
export const SSE_API_VERSION = SSE.API_VERSION;
export const FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS =
  SSE.FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS;

// ========================================================================
// TYPE DEFINITIONS (Backend-specific, not in shared types)
// ========================================================================

/** User object attached to session */
export interface SessionUser {
  id: string;
  role?: string;
  email?: string;
  name?: string;
}

/** Session state */
export interface SessionState {
  userId: string;
  user: SessionUser;
  // Channel subscriptions
  subscribedChannels: Set<string>; // Logs channels (analysis IDs)
  subscribedStatsChannels?: Set<string>; // Stats channels (analysis IDs)
  subscribedToMetrics?: boolean; // Metrics channel subscription
  _disconnecting?: boolean;
  // Index signature for better-sse DefaultSessionState compatibility
  [key: string]: unknown;
}

/** SSE Message (backend-specific base) */
export interface SSEMessage {
  type: string;
  data?: unknown;
  timestamp?: string;
}

/** SSE Session (backend-specific, uses better-sse) */
export interface Session {
  id: string;
  push: (data: SSEMessage | object) => Promise<void>;
  state: SessionState;
  isConnected: boolean;
  lastPushAt?: Date;
}

/** Container State (backend-specific) */
export interface ContainerState {
  status: string;
  startTime: Date;
  message: string;
}

/** Log data with analysis ID */
export interface LogData {
  analysisId?: string;
  [key: string]: unknown;
}

// ========================================================================
// SESSION UTILITIES
// ========================================================================

/**
 * Generate unique session ID using UUID v4
 * @returns Unique session identifier
 */
export function generateSessionId(): string {
  return uuidv4();
}

/**
 * Validate analysis name format
 * @param name - Analysis name to validate
 * @returns True if valid
 */
export function isValidAnalysisName(name: unknown): boolean {
  return typeof name === 'string' && name.length > 0 && name.trim() === name;
}

/**
 * Validate team ID format
 * @param teamId - Team ID to validate
 * @returns True if valid
 */
export function isValidTeamId(teamId: unknown): boolean {
  return typeof teamId === 'string' && teamId.length > 0;
}

/**
 * Extract analysis ID from various log data formats
 * @param logData - Log data object
 * @returns Analysis ID or null
 */
export function extractAnalysisId(
  logData: LogData | null | undefined,
): string | null {
  return logData?.analysisId || null;
}

/**
 * Format container status for display
 * @param status - Raw status
 * @returns Human-readable status
 */
export function formatContainerStatus(status: string): string {
  const statusMap: Record<string, string> = {
    ready: 'healthy',
    error: 'error',
    initializing: 'initializing',
  };
  return statusMap[status] || 'unknown';
}

/**
 * Check if a value is iterable (Set, Array, etc.)
 * @param value - Value to check
 * @returns True if iterable
 */
export function isIterable(value: unknown): boolean {
  return (
    value != null &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
      'function'
  );
}

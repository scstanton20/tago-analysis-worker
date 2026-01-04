/**
 * Log Colors Utility
 *
 * Provides ANSI-colored formatting for system log messages using picocolors.
 * These colors are preserved through SSE and rendered by the frontend LazyLog component.
 *
 * Uses shared types from @tago-analysis-worker/types for type safety.
 */

import pc from 'picocolors';
import type {
  LogColorMap,
  ExitCodeStatus,
} from '@tago-analysis-worker/types/domain';
import { classifyExitCode } from '@tago-analysis-worker/types/domain';

/**
 * ANSI color formatters for system log messages
 *
 * Each function wraps a message in the appropriate ANSI escape codes:
 * - error: Red (31m) - failures, crashes, stderr
 * - warn: Yellow (33m) - reconnection attempts, deprecations
 * - info: Cyan (36m) - status updates, system info
 * - success: Green (32m) - successful operations
 * - dim: Gray (2m) - less important info
 */
export const logColors: LogColorMap = {
  error: (msg: string) => pc.red(msg),
  warn: (msg: string) => pc.yellow(msg),
  info: (msg: string) => pc.cyan(msg),
  success: (msg: string) => pc.green(msg),
  dim: (msg: string) => pc.dim(msg),
} as const;

/**
 * Format error message with ERROR prefix
 * @param msg - Error message
 * @returns Red-colored message with ERROR prefix
 */
export function formatError(msg: string): string {
  return logColors.error(`ERROR: ${msg}`);
}

/**
 * Format warning message with WARN prefix
 * @param msg - Warning message
 * @returns Yellow-colored message with WARN prefix
 */
export function formatWarn(msg: string): string {
  return logColors.warn(`WARN: ${msg}`);
}

/**
 * Format info message (no prefix)
 * @param msg - Info message
 * @returns Cyan-colored message
 */
export function formatInfo(msg: string): string {
  return logColors.info(msg);
}

/**
 * Format success message (no prefix)
 * @param msg - Success message
 * @returns Green-colored message
 */
export function formatSuccess(msg: string): string {
  return logColors.success(msg);
}

/**
 * Format dim/secondary message (no prefix)
 * @param msg - Message
 * @returns Dimmed gray message
 */
export function formatDim(msg: string): string {
  return logColors.dim(msg);
}

/**
 * Format exit code message based on exit status
 *
 * Uses shared classifyExitCode to determine success/error:
 * - Code 0 or null: Green success message
 * - Non-zero: Red error message
 *
 * @param code - Process exit code (null normalized to 0)
 * @returns Colored exit code message
 */
export function formatExitCode(code: number | null): string {
  const normalizedCode = code ?? 0;
  const status: ExitCodeStatus = classifyExitCode(code);
  const message = `Process exited with code ${normalizedCode}`;

  return status === 'success'
    ? logColors.success(message)
    : logColors.error(message);
}

/**
 * Format reconnection attempt message
 * @param attempt - Current attempt number
 * @returns Yellow-colored reconnection message
 */
export function formatReconnectionAttempt(attempt: number): string {
  return logColors.warn(`SDK reconnecting (attempt ${attempt})...`);
}

/**
 * Format connection error restart message
 * @param attempt - Restart attempt number
 * @param delaySeconds - Delay before restart in seconds
 * @returns Yellow-colored restart message
 */
export function formatConnectionRestart(
  attempt: number,
  delaySeconds: number,
): string {
  return logColors.warn(
    `Connection error - restart attempt ${attempt} in ${delaySeconds}s`,
  );
}

/**
 * Format log rotation message
 * @param sizeMB - Previous file size in MB
 * @param preservedCount - Number of entries preserved
 * @returns Cyan-colored rotation message
 */
export function formatLogRotation(
  sizeMB: number,
  preservedCount: number,
): string {
  return logColors.info(
    `Log file rotated automatically (was ${sizeMB}MB, preserved last ${preservedCount} entries). Analysis continues.`,
  );
}

/**
 * Format oversized log file warning
 * @returns Yellow-colored warning message
 */
export function formatOversizedLogWarning(): string {
  return logColors.warn(
    'Log file was too large and has been cleared. Starting fresh.',
  );
}

/**
 * Format Node.js version message
 * @param version - Node.js version string
 * @returns Cyan-colored version message
 */
export function formatNodeVersion(version: string): string {
  return logColors.info(`Node.js ${version}`);
}

/**
 * Format stop message
 * @returns Cyan-colored stop message
 */
export function formatStopping(): string {
  return logColors.info('Stopping analysis...');
}

/**
 * Format force stop warning
 * @returns Yellow-colored force stop message
 */
export function formatForceStop(): string {
  return logColors.warn('Force stopping process...');
}

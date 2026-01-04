/**
 * Logging Domain Types
 *
 * Shared types for system logging, ANSI formatting, and log categorization.
 * Used by backend logging utilities and frontend log rendering.
 */

/**
 * System log message types for categorization
 *
 * Used to determine appropriate ANSI color formatting:
 * - error: Red - failures, crashes, stderr output
 * - warn: Yellow - reconnection attempts, deprecations, oversized files
 * - info: Cyan - status updates, system info
 * - success: Green - successful operations, graceful exits
 * - dim: Gray - less important info
 */
export type SystemLogType = 'error' | 'warn' | 'info' | 'success' | 'dim';

/**
 * Log color function signature
 * Takes a message string and returns an ANSI-colored string
 */
export type LogColorFn = (msg: string) => string;

/**
 * Log color formatter map
 * Maps SystemLogType to color functions
 */
export type LogColorMap = {
  readonly [K in SystemLogType]: LogColorFn;
};

/**
 * Exit code classification
 * Used to determine log formatting for exit messages
 */
export type ExitCodeStatus = 'success' | 'error';

/**
 * Classify exit code for formatting
 * @param code - Process exit code (null treated as 0)
 * @returns Exit code status for color selection
 */
export function classifyExitCode(code: number | null): ExitCodeStatus {
  const normalizedCode = code ?? 0;
  return normalizedCode === 0 ? 'success' : 'error';
}

/**
 * Log Entry Types
 *
 * Represents log entries from analysis execution.
 */

/** Log level types */
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** Log entry as stored/transmitted */
export interface LogEntry {
  /** Sequential log number within analysis */
  sequence: number;
  /** Formatted timestamp string */
  timestamp: string;
  /** Log message content */
  message: string;
  /** Log level */
  level?: LogLevel;
  /** Unix timestamp in milliseconds for sorting */
  createdAt?: number;
}

/** Log response with pagination info */
export interface LogsResponse {
  /** Array of log entries */
  logs: LogEntry[];
  /** Whether more logs exist */
  hasMore: boolean;
  /** Total log count */
  totalCount: number;
  /** Data source indicator */
  source?: 'memory' | 'file' | 'file-stream';
}

/** Time range options for log downloads */
export type LogTimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

/** Log time range option with label */
export interface LogTimeRangeOption {
  value: LogTimeRange;
  label: string;
}

/** Log time range options */
export const LOG_TIME_RANGE_OPTIONS: LogTimeRangeOption[] = [
  { value: '1h', label: 'Last Hour' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'all', label: 'All Logs' },
];

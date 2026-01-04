/**
 * Server Time Utility
 *
 * Provides consistent timestamp formatting across the application.
 * Uses local server time for human readability in logs and API responses.
 *
 * Format: "Thu Jan 08 2026 23:05:31 GMT-0500 (Eastern Standard Time)"
 */

/**
 * Get current server time as a human-readable string
 * Uses Date.toString() for local timezone representation
 *
 * @returns Server time string in local timezone
 * @example "Thu Jan 08 2026 23:05:31 GMT-0500 (Eastern Standard Time)"
 */
export function getServerTime(): string {
  return new Date().toString();
}

/**
 * Get current server time as ISO string (UTC)
 * Use for machine-readable timestamps or external APIs
 *
 * @returns ISO 8601 formatted UTC timestamp
 * @example "2026-01-09T04:05:31.123Z"
 */
export function getServerTimeISO(): string {
  return new Date().toISOString();
}

/**
 * Format a Date object to server time string
 *
 * @param date - Date to format
 * @returns Server time string in local timezone
 */
export function formatServerTime(date: Date): string {
  return date.toString();
}

/**
 * Get current timestamp in milliseconds (Unix epoch)
 * Use for efficient sorting and comparisons
 *
 * @returns Unix timestamp in milliseconds
 */
export function getTimestamp(): number {
  return Date.now();
}

/**
 * Format a timestamp (number, Date, or string) as compact time string (HH:MM:SS)
 * Uses local server timezone for consistency
 *
 * @param timestamp - Unix timestamp in milliseconds, Date object, or date string
 * @returns Compact time string in HH:MM:SS format
 * @example "23:05:31"
 */
export function formatCompactTime(timestamp: number | Date | string): string {
  let date: Date;
  if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (typeof timestamp === 'string') {
    // Handle string timestamps (from JSON parsing or storage)
    const parsed = Date.parse(timestamp);
    date = isNaN(parsed) ? new Date() : new Date(parsed);
  } else {
    date = timestamp;
  }

  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get current server time as compact string (HH:MM:SS)
 * Use for log display where full timestamp is too verbose
 *
 * @returns Compact time string in HH:MM:SS format
 * @example "23:05:31"
 */
export function getCompactServerTime(): string {
  return formatCompactTime(new Date());
}

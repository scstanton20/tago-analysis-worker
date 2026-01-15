/**
 * Formatting utilities for human-readable output.
 *
 * Consolidated from duplicate implementations across services.
 */

/** Size units for file size formatting */
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Bytes per kilobyte */
const BYTES_PER_KB = 1024;

/**
 * Format byte count as human-readable file size.
 *
 * @param bytes - File size in bytes
 * @returns Human-readable size string (e.g., "1.5 MB")
 *
 * @example
 * formatFileSize(0)        // "0 B"
 * formatFileSize(1024)     // "1 KB"
 * formatFileSize(1536)     // "1.5 KB"
 * formatFileSize(1048576)  // "1 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const unitIndex = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_KB));
  const clampedIndex = Math.min(unitIndex, SIZE_UNITS.length - 1);
  const value = bytes / Math.pow(BYTES_PER_KB, clampedIndex);

  return `${parseFloat(value.toFixed(2))} ${SIZE_UNITS[clampedIndex]}`;
}

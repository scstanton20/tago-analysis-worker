// Backend Application Constants
// This file centralizes magic numbers used throughout the application

// Time constants (in milliseconds)
export const TIME = {
  ONE_SECOND: 1000,
  THREE_SECONDS: 3000,
  FIVE_SECONDS: 5000,
  TEN_SECONDS: 10000,
  FIVE_MINUTES: 5 * 60 * 1000,
  FIFTEEN_MINUTES: 15 * 60 * 1000,
  ONE_MINUTE: 60 * 1000,
};

// Analysis Process constants
export const ANALYSIS_PROCESS = {
  // Log management
  MAX_MEMORY_LOGS_DEFAULT: 100, // Default in-memory log buffer size
  MAX_MEMORY_LOGS_FALLBACK: 1000, // Fallback if config is not available
  MAX_LOG_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB

  // Process restart behavior
  INITIAL_RESTART_DELAY_MS: 5000, // 5 seconds
  MAX_RESTART_DELAY_MS: 60000, // 1 minute
  AUTO_RESTART_DELAY_MS: 1000, // 1 second (for unexpected exits)
  FORCE_KILL_TIMEOUT_MS: 3000, // 3 seconds
};

// DNS Cache constants
export const DNS_CACHE = {
  // Cache configuration defaults
  DEFAULT_TTL_MS: 300000, // 5 minutes
  DEFAULT_MAX_ENTRIES: 1000,

  // Stats broadcasting
  STATS_BROADCAST_INTERVAL_MS: 10000, // 10 seconds
};

// Rate Limiting constants
export const RATE_LIMIT = {
  // Window durations
  WINDOW_FIFTEEN_MINUTES_MS: 15 * 60 * 1000,
  WINDOW_FIVE_MINUTES_MS: 5 * 60 * 1000,

  // Request limits per window
  FILE_OPERATIONS_MAX: 200, // General file operations
  UPLOADS_MAX: 50, // Upload operations
  ANALYSIS_RUN_MAX: 100, // Analysis run requests
  DELETIONS_MAX: 50, // Deletion operations
  VERSION_OPERATIONS_MAX: 500, // Version operations (mostly reads)
  AUTH_MAX: 100, // Authentication attempts
};

// File size constants
export const FILE_SIZE = {
  MEGABYTES_50: 50 * 1024 * 1024, // 50MB in bytes
};

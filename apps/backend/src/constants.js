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
  THIRTY_SECONDS: 30 * 1000,
  TWENTY_FOUR_HOURS: 24 * 60 * 60 * 1000,
  SEVEN_DAYS: 60 * 60 * 24 * 7 * 1000,
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

  // Connection management
  CONNECTION_GRACE_PERIOD_MS: 30000, // 30 seconds - grace period for SDK reconnection

  // Pagination
  DEFAULT_LOG_PAGINATION_LIMIT: 100, // Default number of logs per page
};

// DNS Cache constants
export const DNS_CACHE = {
  // Cache configuration defaults
  DEFAULT_TTL_MS: 300000, // 5 minutes
  DEFAULT_MAX_ENTRIES: 1000,

  // Stats broadcasting
  STATS_BROADCAST_INTERVAL_MS: 10000, // 10 seconds

  // TTL limits for validation (in milliseconds)
  TTL_MIN_MS: 1000, // 1 second minimum
  TTL_MAX_MS: 86400000, // 24 hours maximum

  // Entry limits for validation
  MAX_ENTRIES_MIN: 10,
  MAX_ENTRIES_MAX: 10000,
};

// Rate Limiting constants
export const RATE_LIMIT = {
  // Window durations
  WINDOW_FIFTEEN_MINUTES_MS: 15 * 60 * 1000,
  WINDOW_FIVE_MINUTES_MS: 5 * 60 * 1000,
  WINDOW_ONE_MINUTE_SECONDS: 60, // for better-auth rate limiting

  // Request limits per window
  FILE_OPERATIONS_MAX: 200, // General file operations
  UPLOADS_MAX: 50, // Upload operations
  ANALYSIS_RUN_MAX: 100, // Analysis run requests
  DELETIONS_MAX: 50, // Deletion operations
  VERSION_OPERATIONS_MAX: 500, // Version operations (mostly reads)
  TEAM_OPERATIONS_MAX: 200, // Team management operations
  USER_OPERATIONS_MAX: 200, // User management operations
  SETTINGS_OPERATIONS_MAX: 200, // Settings operations
  AUTH_MAX: 100, // Authentication attempts
};

// File size constants
export const FILE_SIZE = {
  KILOBYTES: 1024,
  MEGABYTES_50: 50 * 1024 * 1024, // 50MB in bytes
};

// SSE (Server-Sent Events) constants
export const SSE = {
  // Connection timeouts
  STALE_CONNECTION_TIMEOUT_MS: 60000, // 60 seconds - remove connections idle this long
  HEARTBEAT_INTERVAL_MS: 30 * 1000, // 30 seconds - heartbeat frequency
  HEARTBEAT_CHECK_INTERVAL_MS: 100, // 100ms - how often to check connection health

  // Metrics broadcasting
  METRICS_BROADCAST_INTERVAL_MS: 1000, // 1 second
  METRICS_INITIAL_BROADCAST_MS: 1000, // 1 second - initial broadcast on first client

  // Message delivery
  FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS: 400, // 400ms - wait for logout message to be delivered

  // Session ID generation
  SESSION_ID_SUBSTRING_START: 2,
  SESSION_ID_SUBSTRING_END: 15,

  // API version
  API_VERSION: '4.0',
};

// Server Shutdown constants
export const SERVER_SHUTDOWN = {
  // Process shutdown timeouts
  STOP_ANALYSES_TIMEOUT_MS: 5000, // 5 seconds - timeout for stopping all analyses
  CLIENT_NOTIFICATION_DELAY_MS: 1000, // 1 second - time to let clients receive shutdown notification
  CLOSE_SERVERS_TIMEOUT_MS: 3000, // 3 seconds - timeout for closing HTTP/HTTPS servers
};

// Authentication constants
export const AUTH = {
  // Session configuration (in seconds for better-auth, converted to ms elsewhere)
  SESSION_UPDATE_AGE_SECONDS: 24 * 60 * 60, // 24 hours
  SESSION_EXPIRES_IN_SECONDS: 60 * 60 * 24 * 7, // 7 days

  // Rate limiting
  RATE_LIMIT_WINDOW_SECONDS: 60, // 1 minute window
  RATE_LIMIT_MAX_REQUESTS: 100, // Max requests per window

  // Organization limits
  ORGANIZATION_MEMBER_LIMIT: 1000, // Max members per organization
  ORGANIZATION_TEAMS_LIMIT: 50, // Max teams per organization
};

// Logging constants
export const LOGGING = {
  // Loki transport timeouts
  LOKI_TIMEOUT_MS: 30000, // 30 seconds - timeout for Loki API requests
  LOKI_BATCH_INTERVAL_MS: 5000, // 5 seconds - interval for batch sending to Loki

  // Nanosecond conversion for timestamps
  NANOSECONDS_PER_MILLISECOND: 1000000,
};

// Analysis Service constants
export const ANALYSIS_SERVICE = {
  // Pagination defaults
  DEFAULT_LOGS_LIMIT: 50, // Default logs returned per request
  DEFAULT_PAGINATION_LIMIT: 100, // Default pagination limit

  // Log file processing
  LOG_REVERSE_SORT_BUFFER: 100, // Buffer for reverse sort when reading files

  // Timing
  SMALL_DELAY_MS: 100, // Small delay for UI visibility (e.g., rollback logs)
  BATCH_SIZE_DEFAULT: 5, // Default analyses to start concurrently
  BATCH_DELAY_MS: 1000, // Delay between batches (1 second)

  // Connection verification
  CONNECTION_CHECK_INTERVAL_MS: 100, // Check every 100ms
  CONNECTION_TIMEOUT_MS: 10000, // 10 seconds - timeout for connection verification

  // Health checks
  HEALTH_CHECK_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes

  // Metrics collection
  METRICS_COLLECTION_INTERVAL_MS: 1 * 1000, // 1 second
};

// Metrics Service constants
export const METRICS = {
  // Health score thresholds
  HEALTH_SCORE_BACKEND_WEIGHT: 40, // Backend status weight in health score (%)
  HEALTH_SCORE_PROCESS_WEIGHT: 30, // Process health weight in health score (%)
  HEALTH_SCORE_ERROR_WEIGHT: 20, // Error rate weight in health score (%)
  HEALTH_SCORE_RESOURCE_WEIGHT: 10, // Resource utilization weight in health score (%)

  // Error rate thresholds
  ERROR_RATE_GOOD_THRESHOLD: 1, // Error rate below 1% is good
  ERROR_RATE_ACCEPTABLE_THRESHOLD: 5, // Error rate below 5% is acceptable

  // CPU thresholds (percentage)
  CPU_USAGE_GOOD_THRESHOLD: 80, // CPU below 80% is good
  CPU_USAGE_ACCEPTABLE_THRESHOLD: 90, // CPU below 90% is acceptable

  // Memory thresholds (MB)
  MEMORY_USAGE_GOOD_THRESHOLD_MB: 1024, // 1GB - memory usage good threshold
  MEMORY_USAGE_ACCEPTABLE_THRESHOLD_MB: 2048, // 2GB - memory usage acceptable threshold

  // Metrics collection
  LAST_CHECK_INTERVAL_MS: 60000, // 60 seconds - interval for last metrics check
};

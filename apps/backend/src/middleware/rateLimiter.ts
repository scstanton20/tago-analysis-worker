import rateLimit from 'express-rate-limit';
import { RATE_LIMIT } from '../constants.ts';

/** Configuration for creating a rate limiter */
type RateLimiterConfig = {
  /** Time window in milliseconds */
  readonly windowMs: number;
  /** Maximum requests allowed in window */
  readonly maxRequests: number;
  /** Environment variable name for test overrides */
  readonly testEnvVar: string;
  /** Operation name for error message */
  readonly operationName: string;
};

/**
 * Allow tests to override rate limits via environment variables
 */
const getLimit = (defaultValue: number, envVar: string): number => {
  const override = process.env[envVar];
  return override ? parseInt(override, 10) : defaultValue;
};

/**
 * Factory function to create rate limiters with consistent configuration.
 * Reduces duplication across rate limiter definitions.
 */
const createRateLimiter = (config: RateLimiterConfig) =>
  rateLimit({
    windowMs: config.windowMs,
    max: getLimit(config.maxRequests, config.testEnvVar),
    message: {
      error: `Too many ${config.operationName} from this IP, please try again later.`,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

// General rate limiter for file operations
export const fileOperationLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  maxRequests: RATE_LIMIT.FILE_OPERATIONS_MAX,
  testEnvVar: 'TEST_RATE_LIMIT_FILE_OPS',
  operationName: 'file operations',
});

// Stricter rate limiter for upload operations
export const uploadLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  maxRequests: RATE_LIMIT.UPLOADS_MAX,
  testEnvVar: 'TEST_RATE_LIMIT_UPLOADS',
  operationName: 'uploads',
});

// Rate limiter for running analyses
export const analysisRunLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_FIVE_MINUTES_MS,
  maxRequests: RATE_LIMIT.ANALYSIS_RUN_MAX,
  testEnvVar: 'TEST_RATE_LIMIT_ANALYSIS_RUN',
  operationName: 'analysis run requests',
});

// Stricter rate limiter for deletion operations
export const deletionLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  maxRequests: RATE_LIMIT.DELETIONS_MAX,
  testEnvVar: 'TEST_RATE_LIMIT_DELETIONS',
  operationName: 'deletion requests',
});

// More generous rate limiter for version operations (mostly read operations)
export const versionOperationLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  maxRequests: RATE_LIMIT.VERSION_OPERATIONS_MAX,
  testEnvVar: 'TEST_RATE_LIMIT_VERSION_OPS',
  operationName: 'version operations',
});

// Rate limiter for team management operations
export const teamOperationLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  maxRequests: RATE_LIMIT.TEAM_OPERATIONS_MAX,
  testEnvVar: 'TEST_RATE_LIMIT_TEAM_OPS',
  operationName: 'team operations',
});

// Rate limiter for user management operations
export const userOperationLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  maxRequests: RATE_LIMIT.USER_OPERATIONS_MAX,
  testEnvVar: 'TEST_RATE_LIMIT_USER_OPS',
  operationName: 'user operations',
});

// Rate limiter for settings operations (DNS config, cache management)
export const settingsOperationLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  maxRequests: RATE_LIMIT.SETTINGS_OPERATIONS_MAX,
  testEnvVar: 'TEST_RATE_LIMIT_SETTINGS_OPS',
  operationName: 'settings operations',
});

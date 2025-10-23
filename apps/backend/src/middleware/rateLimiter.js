import rateLimit from 'express-rate-limit';
import { RATE_LIMIT } from '../constants.js';

// Allow tests to override rate limits via environment variables
const getLimit = (defaultValue, envVar) => {
  const override = process.env[envVar];
  return override ? parseInt(override, 10) : defaultValue;
};

// General rate limiter for file operations
export const fileOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: getLimit(RATE_LIMIT.FILE_OPERATIONS_MAX, 'TEST_RATE_LIMIT_FILE_OPS'),
  message: {
    error: 'Too many file operations from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter rate limiter for upload operations
export const uploadLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: getLimit(RATE_LIMIT.UPLOADS_MAX, 'TEST_RATE_LIMIT_UPLOADS'),
  message: {
    error: 'Too many uploads from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for running analyses
export const analysisRunLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIVE_MINUTES_MS,
  max: getLimit(RATE_LIMIT.ANALYSIS_RUN_MAX, 'TEST_RATE_LIMIT_ANALYSIS_RUN'),
  message: {
    error:
      'Too many analysis run requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for deletion operations
export const deletionLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: getLimit(RATE_LIMIT.DELETIONS_MAX, 'TEST_RATE_LIMIT_DELETIONS'),
  message: {
    error: 'Too many deletion requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// More generous rate limiter for version operations (mostly read operations)
export const versionOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: getLimit(
    RATE_LIMIT.VERSION_OPERATIONS_MAX,
    'TEST_RATE_LIMIT_VERSION_OPS',
  ),
  message: {
    error: 'Too many version operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for team management operations (create, update, delete, folder operations)
export const teamOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: getLimit(200, 'TEST_RATE_LIMIT_TEAM_OPS'),
  message: {
    error: 'Too many team operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for user management operations (add, update, delete, assign teams)
export const userOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: getLimit(200, 'TEST_RATE_LIMIT_USER_OPS'),
  message: {
    error: 'Too many user operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for settings operations (DNS config, cache management)
export const settingsOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: getLimit(200, 'TEST_RATE_LIMIT_SETTINGS_OPS'),
  message: {
    error: 'Too many settings operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

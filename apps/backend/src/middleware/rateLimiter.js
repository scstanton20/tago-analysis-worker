import rateLimit from 'express-rate-limit';
import { RATE_LIMIT } from '../constants.js';

// General rate limiter for file operations
export const fileOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: RATE_LIMIT.FILE_OPERATIONS_MAX,
  message: {
    error: 'Too many file operations from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter rate limiter for upload operations
export const uploadLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: RATE_LIMIT.UPLOADS_MAX,
  message: {
    error: 'Too many uploads from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for running analyses
export const analysisRunLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIVE_MINUTES_MS,
  max: RATE_LIMIT.ANALYSIS_RUN_MAX,
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
  max: RATE_LIMIT.DELETIONS_MAX,
  message: {
    error: 'Too many deletion requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// More generous rate limiter for version operations (mostly read operations)
export const versionOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: RATE_LIMIT.VERSION_OPERATIONS_MAX,
  message: {
    error: 'Too many version operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for team management operations (create, update, delete, folder operations)
export const teamOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: 200,
  message: {
    error: 'Too many team operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for user management operations (add, update, delete, assign teams)
export const userOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: 200,
  message: {
    error: 'Too many user operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for settings operations (DNS config, cache management)
export const settingsOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: 200,
  message: {
    error: 'Too many settings operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

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

// Stricter rate limiter for authentication endpoints (login, registration)
// Exempts session checks to allow frequent polling without hitting limits
export const authLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_FIFTEEN_MINUTES_MS,
  max: RATE_LIMIT.AUTH_MAX,
  message: {
    error:
      'Too many authentication attempts from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests to avoid penalizing legitimate users
  skipSuccessfulRequests: false, // Count all attempts to prevent brute force
  // Skip session checks - they're read-only and need to be frequent
  skip: (req) => {
    return (
      req.method === 'GET' &&
      (req.path === '/api/auth/get-session' ||
        req.url?.includes('/get-session'))
    );
  },
});

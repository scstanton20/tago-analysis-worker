/**
 * SSE Compression Middleware
 *
 * Configures HTTP compression specifically optimized for Server-Sent Events (SSE) endpoints.
 * Provides significant bandwidth savings (30-70%) for repetitive JSON structures in SSE messages.
 */

import compression from 'compression';
import { constants as zlibConstants } from 'zlib';
import type { Request, Response, RequestHandler } from 'express';

/**
 * Compression filter function for SSE endpoints
 * Exported separately for testability
 *
 * @param req - Express request object
 * @param res - Express response object
 * @returns true if response should be compressed
 */
export function sseCompressionFilter(req: Request, res: Response): boolean {
  // Handle null/undefined request
  if (!req) {
    return compression.filter(req, res);
  }

  // Check if this is an SSE endpoint
  if (req.path && req.path.includes('/sse/')) {
    return true;
  }

  // For non-SSE paths, use default compression filter
  return compression.filter(req, res);
}

/**
 * Create compression middleware optimized for SSE endpoints
 *
 * @returns Express middleware function
 *
 * Configuration:
 * - filter: Always compress SSE paths (/sse/), fallback to default for others
 * - threshold: 0 (compress everything, even small messages)
 * - level: 9 (maximum compression for text data)
 * - strategy: Z_DEFAULT_STRATEGY (best for text/JSON)
 *
 * SSE Paths:
 * - Any path containing '/sse/'
 *
 * Browser Support:
 * - gzip: All modern browsers (>99% support)
 * - Automatic decompression by browser
 * - Transparent to client-side EventSource API
 */
export function sseCompression(): RequestHandler {
  return compression({
    filter: sseCompressionFilter,
    threshold: 0,
    level: 6,
    strategy: zlibConstants.Z_DEFAULT_STRATEGY,
  });
}

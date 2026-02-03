import type { Request, Response } from 'express';
import express from 'express';
import { handleSSEConnection, sseManager } from '../utils/sse/index.ts';
import { sseCompression } from '../middleware/compression.ts';
import { authMiddleware } from '../middleware/betterAuthMiddleware.ts';
import { validateRequest } from '../middleware/validateRequest.ts';
import { sseValidationSchemas } from '../validation/sseSchemas.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

const router = express.Router();

router.use(authMiddleware);

router.get(
  '/events',
  validateRequest(sseValidationSchemas.connectSSE),
  sseCompression(),
  handleSSEConnection,
);

// ============================================================================
// Stats Channel (lightweight - for Info Modal)
// ============================================================================

router.post(
  '/subscribe/stats',
  validateRequest(sseValidationSchemas.subscribe),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleSubscribeStatsRequest(req, res);
  }, 'subscribe to analysis stats'),
);

router.post(
  '/unsubscribe/stats',
  validateRequest(sseValidationSchemas.unsubscribe),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleUnsubscribeStatsRequest(req, res);
  }, 'unsubscribe from analysis stats'),
);

// ============================================================================
// Logs Channel (heavy - for Log Viewer)
// ============================================================================

router.post(
  '/subscribe/logs',
  validateRequest(sseValidationSchemas.subscribe),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleSubscribeLogsRequest(req, res);
  }, 'subscribe to analysis logs'),
);

router.post(
  '/unsubscribe/logs',
  validateRequest(sseValidationSchemas.unsubscribe),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleUnsubscribeLogsRequest(req, res);
  }, 'unsubscribe from analysis logs'),
);

// ============================================================================
// Metrics Channel (for Settings modal)
// ============================================================================

router.post(
  '/subscribe/metrics',
  validateRequest(sseValidationSchemas.subscribeMetrics),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleSubscribeMetricsRequest(req, res);
  }, 'subscribe to metrics'),
);

router.post(
  '/unsubscribe/metrics',
  validateRequest(sseValidationSchemas.subscribeMetrics),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleUnsubscribeMetricsRequest(req, res);
  }, 'unsubscribe from metrics'),
);

export { router as sseRouter };

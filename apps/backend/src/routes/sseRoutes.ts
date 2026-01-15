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

/**
 * @swagger
 * /sse/events:
 *   get:
 *     summary: Server-Sent Events stream for real-time updates
 *     description: |
 *       Establishes a Server-Sent Events (SSE) connection for receiving real-time updates.
 *       After connection, subscribe to specific channels for targeted updates.
 *
 *       **Channel Architecture:**
 *       - Global: Essential state for all clients (init, statusUpdate, analysisUpdate)
 *       - Stats: Per-analysis lightweight stats (log count, file size, DNS, metrics)
 *       - Logs: Per-analysis heavy log lines (for Log Viewer only)
 *       - Metrics: Detailed system metrics (for Settings modal only)
 *
 *     tags: [Real-time Events]
 *     responses:
 *       200:
 *         description: SSE connection established successfully
 *       401:
 *         description: Authentication required or failed
 */
router.get(
  '/events',
  validateRequest(sseValidationSchemas.connectSSE),
  sseCompression(),
  handleSSEConnection,
);

// ============================================================================
// Stats Channel (lightweight - for Info Modal)
// ============================================================================

/**
 * @swagger
 * /sse/subscribe/stats:
 *   post:
 *     summary: Subscribe to analysis stats channels (lightweight)
 *     description: |
 *       Subscribe to lightweight stats for analyses: log count, file size, DNS stats, process metrics.
 *       Use this for Info Modal and analysis cards that need metadata without log lines.
 *
 *       On subscription, immediately pushes current stats to the session.
 *     tags: [Real-time Events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, analyses]
 *             properties:
 *               sessionId:
 *                 type: string
 *               analyses:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Subscription successful
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Session not found
 */
router.post(
  '/subscribe/stats',
  validateRequest(sseValidationSchemas.subscribe),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleSubscribeStatsRequest(req, res);
  }, 'subscribe to analysis stats'),
);

/**
 * @swagger
 * /sse/unsubscribe/stats:
 *   post:
 *     summary: Unsubscribe from analysis stats channels
 *     tags: [Real-time Events]
 */
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

/**
 * @swagger
 * /sse/subscribe/logs:
 *   post:
 *     summary: Subscribe to analysis logs channels (heavy)
 *     description: |
 *       Subscribe to receive individual log lines from analyses.
 *       Use this only when Log Viewer is open, as it streams every log line.
 *     tags: [Real-time Events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, analyses]
 *             properties:
 *               sessionId:
 *                 type: string
 *               analyses:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Subscription successful
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Session not found
 */
router.post(
  '/subscribe/logs',
  validateRequest(sseValidationSchemas.subscribe),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleSubscribeLogsRequest(req, res);
  }, 'subscribe to analysis logs'),
);

/**
 * @swagger
 * /sse/unsubscribe/logs:
 *   post:
 *     summary: Unsubscribe from analysis logs channels
 *     tags: [Real-time Events]
 */
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

/**
 * @swagger
 * /sse/subscribe/metrics:
 *   post:
 *     summary: Subscribe to detailed system metrics channel
 *     description: |
 *       Subscribe to receive detailed system metrics: CPU, memory, process details.
 *       Use this only when Settings modal or Metrics Dashboard is open.
 *
 *       On subscription, immediately pushes current metrics to the session.
 *     tags: [Real-time Events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId]
 *             properties:
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription successful
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Session not found
 */
router.post(
  '/subscribe/metrics',
  validateRequest(sseValidationSchemas.subscribeMetrics),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleSubscribeMetricsRequest(req, res);
  }, 'subscribe to metrics'),
);

/**
 * @swagger
 * /sse/unsubscribe/metrics:
 *   post:
 *     summary: Unsubscribe from metrics channel
 *     tags: [Real-time Events]
 */
router.post(
  '/unsubscribe/metrics',
  validateRequest(sseValidationSchemas.subscribeMetrics),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleUnsubscribeMetricsRequest(req, res);
  }, 'unsubscribe from metrics'),
);

export { router as sseRouter };

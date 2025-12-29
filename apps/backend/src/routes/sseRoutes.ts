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
 * components:
 *   schemas:
 *     SSEEvent:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           description: Event type
 *           enum: [init, statusUpdate, analysisUpdate, log, departmentUpdate, sessionInvalidated]
 *         data:
 *           type: object
 *           description: Event data payload
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Event timestamp
 *       example:
 *         type: "analysisUpdate"
 *         data: { fileName: "example-analysis", status: "running" }
 *         timestamp: "2024-06-29T10:30:00.000Z"
 */

/**
 * @swagger
 * /sse/events:
 *   get:
 *     summary: Server-Sent Events stream for real-time updates
 *     description: |
 *       Establishes a Server-Sent Events (SSE) connection for receiving real-time updates about:
 *       - Analysis status changes and logs
 *       - System status updates
 *       - Department changes
 *       - Session invalidation notifications
 *
 *       **Authentication:** Uses existing session cookies - same auth as API access.
 *
 *       **Connection:** Keep-alive with automatic browser reconnection support.
 *
 *       **Events Sent:**
 *       - `init`: Initial data load (analyses, departments)
 *       - `statusUpdate`: Server health and Tago connection status
 *       - `analysisUpdate`: Analysis state changes
 *       - `log`: Real-time analysis log entries
 *       - `departmentUpdate`: Department creation/modification/deletion
 *       - `sessionInvalidated`: Authentication session expired
 *
 *     tags: [Real-time Events]
 *     responses:
 *       200:
 *         description: SSE connection established successfully
 *         content:
 *           text/event-stream:
 *             schema:
 *               $ref: "..."
 *       401:
 *         description: Authentication required or failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               no_token:
 *                 summary: No authentication token
 *                 value:
 *                   error: "Authentication required"
 *               invalid_token:
 *                 summary: Invalid authentication token
 *                 value:
 *                   error: "Authentication failed"
 *               invalid_user:
 *                 summary: User not found
 *                 value:
 *                   error: "Invalid user"
 */
router.get(
  '/events',
  validateRequest(sseValidationSchemas.connectSSE),
  sseCompression(),
  handleSSEConnection,
);

/**
 * @swagger
 * /sse/subscribe:
 *   post:
 *     summary: Subscribe to analysis channels
 *     description: |
 *       Subscribe an SSE session to receive real-time events from specific analyses.
 *       Only events from subscribed analyses will be sent to the session.
 *
 *       **Permission Checking:**
 *       - Admin users can subscribe to any analysis
 *       - Regular users can only subscribe to analyses in teams they have access to
 *       - Uncategorized analyses are accessible to all users
 *
 *       **Use Case:** When user opens an analysis view, frontend subscribes to that analysis
 *     tags: [Real-time Events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - analyses
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: SSE session ID from the connection
 *                 example: "abc123xyz"
 *               analyses:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of analysis names to subscribe to
 *                 example: ["my-analysis.js", "another-analysis.js"]
 *     responses:
 *       200:
 *         description: Subscription successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 subscribed:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Analyses successfully subscribed to
 *                 denied:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Analyses that were denied due to permissions
 *                 sessionId:
 *                   type: string
 *                   description: The session ID that was subscribed
 *       400:
 *         description: Invalid request (missing sessionId or analyses)
 *       404:
 *         description: Session not found
 *       401:
 *         description: Authentication required
 */
router.post(
  '/subscribe',
  validateRequest(sseValidationSchemas.subscribe),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleSubscribeRequest(req, res);
  }, 'subscribe to analysis channels'),
);

/**
 * @swagger
 * /sse/unsubscribe:
 *   post:
 *     summary: Unsubscribe from analysis channels
 *     description: |
 *       Unsubscribe an SSE session from receiving logs from specific analyses.
 *       This stops log streaming for the specified analyses.
 *
 *       **Use Case:** When user closes an analysis view, frontend unsubscribes from that analysis
 *     tags: [Real-time Events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - analyses
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: SSE session ID from the connection
 *                 example: "abc123xyz"
 *               analyses:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of analysis names to unsubscribe from
 *                 example: ["my-analysis.js", "another-analysis.js"]
 *     responses:
 *       200:
 *         description: Unsubscription successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 unsubscribed:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Analyses successfully unsubscribed from
 *                 sessionId:
 *                   type: string
 *                   description: The session ID that was unsubscribed
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Session not found
 *       401:
 *         description: Authentication required
 */
router.post(
  '/unsubscribe',
  validateRequest(sseValidationSchemas.unsubscribe),
  asyncHandler(async (req: Request, res: Response) => {
    await sseManager.handleUnsubscribeRequest(req, res);
  }, 'unsubscribe from analysis channels'),
);

export { router as sseRouter };

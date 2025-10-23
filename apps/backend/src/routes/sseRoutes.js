// backend/src/routes/sseRoutes.js
import { Router } from 'express';
import { authenticateSSE, handleSSEConnection } from '../utils/sse.js';
import { sseCompression } from '../middleware/compression.js';

const router = Router();

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
//  * @swagger
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
router.get('/events', authenticateSSE, sseCompression(), handleSSEConnection);

export default router;

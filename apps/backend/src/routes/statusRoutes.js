// backend/src/routes/statusRoutes.js
import { Router } from 'express';
import StatusController from '../controllers/statusController.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     SystemStatus:
 *       type: object
 *       properties:
 *         container_health:
 *           type: object
 *           properties:
 *             status:
 *               type: string
 *               enum: [healthy, initializing]
 *               description: Container health status
 *             message:
 *               type: string
 *               description: Human-readable status message
 *             uptime:
 *               type: object
 *               properties:
 *                 seconds:
 *                   type: integer
 *                   description: Uptime in seconds
 *                 formatted:
 *                   type: string
 *                   description: Human-readable uptime
 *         tagoConnection:
 *           type: object
 *           properties:
 *             sdkVersion:
 *               type: string
 *               description: Version of Tago SDK being used
 *             runningAnalyses:
 *               type: integer
 *               description: Number of currently running analyses
 *         serverTime:
 *           type: string
 *           description: Current server timestamp
 *       example:
 *         container_health:
 *           status: "healthy"
 *           message: "Container is ready"
 *           uptime:
 *             seconds: 3600
 *             formatted: "1 hour"
 *         tagoConnection:
 *           sdkVersion: "12.0.0"
 *           runningAnalyses: 2
 *         serverTime: "Sat Jun 22 2024 10:30:00 GMT+0000 (UTC)"
 */

/**
 * @swagger
 * /status:
 *   get:
 *     summary: Get system status and health information
 *     description: Returns comprehensive status information about the analysis worker including container health, Tago SDK version, and running analyses count. Status updates are also streamed via SSE at /sse/events for real-time monitoring.
 *     tags: [Status]
 *     responses:
 *       200:
 *         description: System is healthy and ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SystemStatus'
 *       203:
 *         description: System is initializing (Non-Authoritative Information)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SystemStatus'
 *       500:
 *         description: System error occurred
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 *                 message:
 *                   type: string
 *                   example: "Detailed error message"
 */
router.get('/', StatusController.getSystemStatus);

export default router;

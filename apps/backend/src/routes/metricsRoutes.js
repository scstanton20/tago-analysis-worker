import express from 'express';
import { register } from '../utils/metrics-enhanced.js';
import { authMiddleware } from '../middleware/betterAuthMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { metricsValidationSchemas } from '../validation/metricsSchemas.js';

const router = express.Router();

router.use(authMiddleware);
/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Get Prometheus metrics
 *     description: Returns application metrics in Prometheus/OpenMetrics format for monitoring and observability
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/openmetrics-text:
 *             schema:
 *               type: string
 *               description: Prometheus-formatted metrics
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/metrics',
  validateRequest(metricsValidationSchemas.getMetrics),
  asyncHandler(async (req, res) => {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.end(metrics);
  }, 'retrieve metrics'),
);

export { router as metricsRouter };

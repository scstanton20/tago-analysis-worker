import type { Request, Response } from 'express';
import express from 'express';
import { register } from '../utils/metrics-enhanced.ts';
import { authMiddleware } from '../middleware/betterAuthMiddleware.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { validateRequest } from '../middleware/validateRequest.ts';
import { metricsValidationSchemas } from '../validation/metricsSchemas.ts';

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
  asyncHandler(async (_req: Request, res: Response) => {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.end(metrics);
  }, 'retrieve metrics'),
);

export { router as metricsRouter };

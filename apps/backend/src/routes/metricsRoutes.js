import express from 'express';
import { register } from '../utils/metrics-enhanced.js';
import { authMiddleware } from '../middleware/betterAuthMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { metricsValidationSchemas } from '../validation/metricsSchemas.js';

const router = express.Router();

router.use(authMiddleware);
// Prometheus metrics endpoint
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

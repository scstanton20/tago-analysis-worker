import type { Request, Response } from 'express';
import express from 'express';
import { register } from '../utils/metrics-enhanced.ts';
import { authMiddleware } from '../middleware/betterAuthMiddleware.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { validateRequest } from '../middleware/validateRequest.ts';
import { metricsValidationSchemas } from '../validation/metricsSchemas.ts';

const router = express.Router();

router.use(authMiddleware);

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

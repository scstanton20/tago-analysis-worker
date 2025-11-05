import express from 'express';
import { register } from '../utils/metrics-enhanced.js';
import { authMiddleware } from '../middleware/betterAuthMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
// Prometheus metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.end(metrics);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

export default router;

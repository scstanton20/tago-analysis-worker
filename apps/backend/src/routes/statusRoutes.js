// backend/src/routes/statusRoutes.js
import express from 'express';
import StatusController from '../controllers/statusController.js';

export default function createStatusRoutes(analysisService, containerState) {
  const router = express.Router();
  const statusController = new StatusController(
    analysisService,
    containerState,
  );

  // System status endpoint
  router.get('/', statusController.getSystemStatus);

  return router;
}

// backend/src/routes/statusRoutes.js
import express from 'express';
import StatusController from '../controllers/statusController.js';
import { getContainerState } from '../utils/websocket.js';

export default function createStatusRoutes(analysisService) {
  const router = express.Router();
  const statusController = new StatusController(
    analysisService,
    getContainerState(),
  );

  // System status endpoint
  router.get('/', statusController.getSystemStatus);

  return router;
}
//

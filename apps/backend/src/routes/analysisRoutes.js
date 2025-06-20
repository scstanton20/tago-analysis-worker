// backend/src/routes/analysisRoutes.js
import express from 'express';
import * as analysisController from '../controllers/analysisController.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = express.Router();

// Apply authentication to all analysis routes
router.use(authMiddleware);

// Add error handling middleware specifically for this router
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Analysis management routes
router.post(
  '/upload',
  requirePermission('upload_analyses'),
  asyncHandler(analysisController.uploadAnalysis),
);
router.get(
  '/',
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getAnalyses),
);
router.post(
  '/:fileName/run',
  requirePermission('run_analyses'),
  asyncHandler(analysisController.runAnalysis),
);
router.post(
  '/:fileName/stop',
  requirePermission('run_analyses'),
  asyncHandler(analysisController.stopAnalysis),
);
router.delete(
  '/:fileName',
  requirePermission('delete_analyses'),
  asyncHandler(analysisController.deleteAnalysis),
);
router.get(
  '/:fileName/content',
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getAnalysisContent),
);
router.put(
  '/:fileName',
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.updateAnalysis),
);
router.put(
  '/:fileName/rename',
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.renameAnalysis),
);
router.get(
  '/:fileName/download',
  requirePermission('download_analyses'),
  asyncHandler(analysisController.downloadAnalysis),
);

// Environment management routes
router.get(
  '/:fileName/environment',
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getEnvironment),
);
router.put(
  '/:fileName/environment',
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.updateEnvironment),
);

// Logs management routes
router.get(
  '/:fileName/logs',
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getLogs),
);
router.get(
  '/:fileName/logs/download',
  requirePermission('download_analyses'),
  asyncHandler(analysisController.downloadLogs),
);
router.delete(
  '/:fileName/logs',
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.clearLogs),
);

export default router;

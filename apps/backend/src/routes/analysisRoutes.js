// backend/src/routes/analysisRoutes.js
import express from 'express';
import * as analysisController from '../controllers/analysisController.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import {
  fileOperationLimiter,
  uploadLimiter,
  analysisRunLimiter,
  deletionLimiter,
} from '../middleware/rateLimiter.js';

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
  uploadLimiter,
  requirePermission('upload_analyses'),
  asyncHandler(analysisController.uploadAnalysis),
);
router.get(
  '/',
  fileOperationLimiter,
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getAnalyses),
);
router.post(
  '/:fileName/run',
  analysisRunLimiter,
  requirePermission('run_analyses'),
  asyncHandler(analysisController.runAnalysis),
);
router.post(
  '/:fileName/stop',
  analysisRunLimiter,
  requirePermission('run_analyses'),
  asyncHandler(analysisController.stopAnalysis),
);
router.delete(
  '/:fileName',
  deletionLimiter,
  requirePermission('delete_analyses'),
  asyncHandler(analysisController.deleteAnalysis),
);
router.get(
  '/:fileName/content',
  fileOperationLimiter,
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getAnalysisContent),
);
router.put(
  '/:fileName',
  fileOperationLimiter,
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.updateAnalysis),
);
router.put(
  '/:fileName/rename',
  fileOperationLimiter,
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.renameAnalysis),
);
router.get(
  '/:fileName/download',
  fileOperationLimiter,
  requirePermission('download_analyses'),
  asyncHandler(analysisController.downloadAnalysis),
);

// Environment management routes
router.get(
  '/:fileName/environment',
  fileOperationLimiter,
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getEnvironment),
);
router.put(
  '/:fileName/environment',
  fileOperationLimiter,
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.updateEnvironment),
);

// Logs management routes
router.get(
  '/:fileName/logs',
  fileOperationLimiter,
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getLogs),
);
router.get(
  '/:fileName/logs/download',
  fileOperationLimiter,
  requirePermission('download_analyses'),
  asyncHandler(analysisController.downloadLogs),
);
router.delete(
  '/:fileName/logs',
  deletionLimiter,
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.clearLogs),
);

export default router;

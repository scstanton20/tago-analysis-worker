// backend/src/routes/analysisRoutes.js
import express from 'express';
import * as analysisController from '../controllers/analysisController.js';

const router = express.Router();

// Add error handling middleware specifically for this router
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Analysis management routes
router.post('/upload', asyncHandler(analysisController.uploadAnalysis));
router.get('/', asyncHandler(analysisController.getAnalyses));
router.post('/:fileName/run', asyncHandler(analysisController.runAnalysis));
router.post('/:fileName/stop', asyncHandler(analysisController.stopAnalysis));
router.delete('/:fileName', asyncHandler(analysisController.deleteAnalysis));
router.get(
  '/:fileName/content',
  asyncHandler(analysisController.getAnalysisContent),
);
router.put('/:fileName', asyncHandler(analysisController.updateAnalysis));
router.put(
  '/:fileName/rename',
  asyncHandler(analysisController.renameAnalysis),
);
router.get(
  '/:fileName/download',
  asyncHandler(analysisController.downloadAnalysis),
);

// Environment management routes
router.get(
  '/:fileName/environment',
  asyncHandler(analysisController.getEnvironment),
);
router.put(
  '/:fileName/environment',
  asyncHandler(analysisController.updateEnvironment),
);

// Logs management routes
router.get('/:fileName/logs', asyncHandler(analysisController.getLogs));
router.get(
  '/:fileName/logs/download',
  asyncHandler(analysisController.downloadLogs),
);
router.delete('/:fileName/logs', asyncHandler(analysisController.clearLogs));

export default router;

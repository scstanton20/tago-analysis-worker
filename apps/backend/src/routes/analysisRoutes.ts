import type { Request, Response } from 'express';
import express from 'express';
import { AnalysisController } from '../controllers/analysisController.ts';
import {
  authMiddleware,
  extractAnalysisTeam,
  requireTeamPermission,
  requireAnyTeamPermission,
} from '../middleware/betterAuthMiddleware.ts';
import {
  fileOperationLimiter,
  uploadLimiter,
  analysisRunLimiter,
  deletionLimiter,
  versionOperationLimiter,
} from '../middleware/rateLimiter.ts';
import { validateRequest } from '../middleware/validateRequest.ts';
import {
  analysisValidationSchemas,
  LOG_TIME_RANGE_OPTIONS,
} from '../validation/analysisSchemas.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

const router = express.Router();

// Apply authentication to all analysis routes
router.use(authMiddleware);

// Analysis management routes
router.post(
  '/upload',
  uploadLimiter,
  validateRequest(analysisValidationSchemas.uploadAnalysis),
  requireTeamPermission('upload_analyses'),
  asyncHandler(AnalysisController.uploadAnalysis, 'upload analysis'),
);
router.get(
  '/',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getAnalyses),
  // For listing all analyses, allow if user has view permission in ANY team
  // The controller will filter analyses based on user's team memberships
  requireAnyTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalyses, 'get analyses'),
);

const analysisIdRouter = express.Router({ mergeParams: true });

// Common middleware for all /:analysisId routes
// Note: No sanitization needed for UUIDs - they're inherently safe
analysisIdRouter.use(extractAnalysisTeam);

analysisIdRouter.post(
  '/run',
  analysisRunLimiter,
  validateRequest(analysisValidationSchemas.runAnalysis),
  requireTeamPermission('run_analyses'),
  asyncHandler(AnalysisController.runAnalysis, 'run analysis'),
);
analysisIdRouter.post(
  '/stop',
  analysisRunLimiter,
  validateRequest(analysisValidationSchemas.stopAnalysis),
  requireTeamPermission('run_analyses'),
  asyncHandler(AnalysisController.stopAnalysis, 'stop analysis'),
);
analysisIdRouter.delete(
  '/',
  deletionLimiter,
  validateRequest(analysisValidationSchemas.deleteAnalysis),
  requireTeamPermission('delete_analyses'),
  asyncHandler(AnalysisController.deleteAnalysis, 'delete analysis'),
);
analysisIdRouter.get(
  '/content',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getAnalysisContent),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalysisContent, 'get analysis content'),
);
analysisIdRouter.put(
  '/',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.updateAnalysis),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.updateAnalysis, 'update analysis'),
);
analysisIdRouter.put(
  '/rename',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.renameAnalysis),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.renameAnalysis, 'rename analysis'),
);
analysisIdRouter.get(
  '/download',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.downloadAnalysis),
  requireTeamPermission('download_analyses'),
  asyncHandler(AnalysisController.downloadAnalysis, 'download analysis'),
);

// Environment management routes
analysisIdRouter.get(
  '/environment',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getEnvironment),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getEnvironment, 'get environment'),
);
analysisIdRouter.put(
  '/environment',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.updateEnvironment),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.updateEnvironment, 'update environment'),
);

// Logs management routes
analysisIdRouter.get(
  '/logs',
  validateRequest(analysisValidationSchemas.getLogs),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getLogs, 'get logs'),
);
analysisIdRouter.get(
  '/logs/download',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.downloadLogs),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.downloadLogs, 'download logs'),
);

analysisIdRouter.get(
  '/logs/options',
  requireTeamPermission('view_analyses'),
  (_req: Request, res: Response) => {
    res.json({ timeRangeOptions: LOG_TIME_RANGE_OPTIONS });
  },
);

analysisIdRouter.delete(
  '/logs',
  deletionLimiter,
  validateRequest(analysisValidationSchemas.clearLogs),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.clearLogs, 'clear logs'),
);

// Version management routes
analysisIdRouter.get(
  '/versions',
  versionOperationLimiter,
  validateRequest(analysisValidationSchemas.getVersions),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getVersions, 'get versions'),
);

analysisIdRouter.post(
  '/rollback',
  versionOperationLimiter,
  validateRequest(analysisValidationSchemas.rollbackToVersion),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.rollbackToVersion, 'rollback to version'),
);

// Analysis info routes
analysisIdRouter.get(
  '/info/meta',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getAnalysisMeta),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalysisMeta, 'get analysis metadata'),
);

analysisIdRouter.get(
  '/info',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getAnalysisNotes),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalysisNotes, 'get analysis notes'),
);

analysisIdRouter.put(
  '/info',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.updateAnalysisNotes),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.updateAnalysisNotes, 'update analysis notes'),
);

router.use('/:analysisId', analysisIdRouter);

export { router as analysisRouter };

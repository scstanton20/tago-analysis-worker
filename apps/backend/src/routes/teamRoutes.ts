import express from 'express';
import { TeamController } from '../controllers/teamController.ts';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.ts';
import { validateRequest } from '../middleware/validateRequest.ts';
import { teamValidationSchemas } from '../validation/teamSchemas.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { teamOperationLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

// Apply authentication to all team routes
router.use(authMiddleware);
router.use(requireAdmin);

// Custom team endpoints that handle Better Auth team table with custom properties
// We use custom endpoints because Better Auth's client methods don't support our custom fields

router.get(
  '/',
  validateRequest(teamValidationSchemas.getAllTeams),
  asyncHandler(TeamController.getAllTeams, 'get all teams'),
);

router.post(
  '/',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.createTeam),
  asyncHandler(TeamController.createTeam, 'create team'),
);

router.put(
  '/reorder',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.reorderTeams),
  asyncHandler(TeamController.reorderTeams, 'reorder teams'),
);

const teamIdRouter = express.Router({ mergeParams: true });

teamIdRouter.put(
  '/',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.updateTeam),
  asyncHandler(TeamController.updateTeam, 'update team'),
);

teamIdRouter.delete(
  '/',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.deleteTeam),
  asyncHandler(TeamController.deleteTeam, 'delete team'),
);

teamIdRouter.get(
  '/count',
  validateRequest(teamValidationSchemas.getTeamAnalysisCount),
  asyncHandler(TeamController.getTeamAnalysisCount, 'get team analysis count'),
);

router.use('/:id', teamIdRouter);

// Analysis-team routes
router.put(
  '/analyses/:analysisId/team',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.moveAnalysisToTeam),
  asyncHandler(TeamController.moveAnalysisToTeam, 'move analysis to team'),
);

const teamManagementRouter = express.Router({ mergeParams: true });
const folderRouter = express.Router({ mergeParams: true });
const folderIdRouter = express.Router({ mergeParams: true });

// Folder management routes
folderRouter.post(
  '/',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.createFolder),
  asyncHandler(TeamController.createFolder, 'create folder'),
);

folderIdRouter.put(
  '/',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.updateFolder),
  asyncHandler(TeamController.updateFolder, 'update folder'),
);

folderIdRouter.delete(
  '/',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.deleteFolder),
  asyncHandler(TeamController.deleteFolder, 'delete folder'),
);

folderRouter.use('/:folderId', folderIdRouter);

teamManagementRouter.post(
  '/items/move',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.moveItem),
  asyncHandler(TeamController.moveItem, 'move item'),
);

teamManagementRouter.use('/folders', folderRouter);
router.use('/:teamId', teamManagementRouter);

export { router as teamRouter };

import express from 'express';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.ts';
import { UserController } from '../controllers/userController.ts';
import { validateRequest } from '../middleware/validateRequest.ts';
import { userValidationSchemas } from '../validation/userSchemas.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { userOperationLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

// Apply authentication to all user routes
router.use(authMiddleware);

// Admin-only routes
router.use(requireAdmin);

router.post(
  '/add-to-organization',
  userOperationLimiter,
  validateRequest(userValidationSchemas.addToOrganization),
  asyncHandler(UserController.addToOrganization, 'add to organization'),
);

router.post(
  '/assign-teams',
  userOperationLimiter,
  validateRequest(userValidationSchemas.assignUserToTeams),
  asyncHandler(UserController.assignUserToTeams, 'assign user to teams'),
);

router.post(
  '/force-logout/:userId',
  userOperationLimiter,
  validateRequest(userValidationSchemas.forceLogout),
  asyncHandler(UserController.forceLogout, 'force logout'),
);

const userIdRouter = express.Router({ mergeParams: true });

userIdRouter.get(
  '/teams/edit',
  asyncHandler(UserController.getUserTeamsForEdit, 'get user teams for edit'),
);

userIdRouter.put(
  '/team-assignments',
  userOperationLimiter,
  validateRequest(userValidationSchemas.updateUserTeamAssignments),
  asyncHandler(
    UserController.updateUserTeamAssignments,
    'update user team assignments',
  ),
);

userIdRouter.put(
  '/organization-role',
  userOperationLimiter,
  validateRequest(userValidationSchemas.updateUserOrganizationRole),
  asyncHandler(
    UserController.updateUserOrganizationRole,
    'update user organization role',
  ),
);

userIdRouter.delete(
  '/organization',
  userOperationLimiter,
  validateRequest(userValidationSchemas.removeUserFromOrganization),
  asyncHandler(
    UserController.removeUserFromOrganization,
    'remove user from organization',
  ),
);

router.use('/:userId', userIdRouter);

export { router as userRouter };

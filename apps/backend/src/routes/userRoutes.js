import { Router } from 'express';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.js';
import UserController from '../controllers/userController.js';

const router = Router();

// Apply authentication to all user routes
router.use(authMiddleware);

// Get user team memberships (users can get their own, admins can get any)
router.get('/:userId/team-memberships', UserController.getUserTeamMemberships);

// Clear password change requirement (used after password onboarding) - allows users to clear their own
router.patch(
  '/:userId/clear-password-change',
  UserController.clearRequirePasswordChange,
);

// Set initial password for first-time users (password onboarding)
router.post('/set-initial-password', UserController.setInitialPassword);

// Admin-only routes
router.use(requireAdmin);

// Set user to require password change
router.patch(
  '/:userId/require-password-change',
  UserController.setRequirePasswordChange,
);

// Add user to organization endpoint
router.post('/add-to-organization', UserController.addToOrganization);

// Assign user to teams with permissions
router.post('/assign-teams', UserController.assignUserToTeams);

// Update user team assignments
router.put(
  '/:userId/team-assignments',
  UserController.updateUserTeamAssignments,
);

// Update user organization role
router.put(
  '/:userId/organization-role',
  UserController.updateUserOrganizationRole,
);

// Remove user from organization
router.delete(
  '/:userId/organization',
  UserController.removeUserFromOrganization,
);

// Delete user with proper cleanup
router.delete('/:userId', UserController.deleteUser);

export default router;

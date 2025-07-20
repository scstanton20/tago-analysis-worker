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

// Admin-only routes
router.use(requireAdmin);

// Add user to organization endpoint
router.post('/add-to-organization', UserController.addToOrganization);

// Assign user to teams with permissions
router.post('/assign-teams', UserController.assignUserToTeams);

// Update user team assignments
router.put(
  '/:userId/team-assignments',
  UserController.updateUserTeamAssignments,
);

// Delete user with proper cleanup
router.delete('/:userId', UserController.deleteUser);

export default router;

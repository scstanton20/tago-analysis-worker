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

/**
 * @swagger
 * /users/add-to-organization:
 *   post:
 *     summary: Add user to organization
 *     description: Add a user to the main organization with specified role (admin only)
 *     tags: [User Management - Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID of the user to add to organization
 *               organizationId:
 *                 type: string
 *                 description: ID of the organization to add user to
 *               role:
 *                 type: string
 *                 enum: ['member', 'admin', 'owner']
 *                 default: 'member'
 *                 description: Role to assign to the user in the organization
 *             required:
 *               - userId
 *               - organizationId
 *     responses:
 *       200:
 *         description: User added to organization successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Organization membership data from Better Auth
 *       400:
 *         description: Invalid request data or user already in organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/add-to-organization',
  userOperationLimiter,
  validateRequest(userValidationSchemas.addToOrganization),
  asyncHandler(UserController.addToOrganization, 'add to organization'),
);

/**
 * @swagger
 * /users/assign-teams:
 *   post:
 *     summary: Assign user to teams with permissions
 *     description: Assign a user to multiple teams with specific permissions (admin only)
 *     tags: [User Management - Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID of the user to assign to teams
 *               teamAssignments:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/TeamAssignment'
 *                 description: Array of team assignments with permissions
 *             required:
 *               - userId
 *               - teamAssignments
 *     responses:
 *       200:
 *         description: User assigned to teams successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     assignments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamId:
 *                             type: string
 *                           permissions:
 *                             type: array
 *                             items:
 *                               type: string
 *                           status:
 *                             type: string
 *                             enum: ['success', 'updated_permissions']
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Any errors encountered during assignment
 *       400:
 *         description: Invalid request data or team assignment failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/assign-teams',
  userOperationLimiter,
  validateRequest(userValidationSchemas.assignUserToTeams),
  asyncHandler(UserController.assignUserToTeams, 'assign user to teams'),
);

/**
 * @swagger
 * /users/force-logout/{userId}:
 *   post:
 *     summary: Force logout a user
 *     description: Force logout a user by closing all their SSE connections and sending a logout notification (admin only)
 *     tags: [User Management - Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to force logout
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for forcing logout
 *                 default: "Your session has been terminated"
 *     responses:
 *       200:
 *         description: User forced logout successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     closedConnections:
 *                       type: number
 *                       description: Number of SSE connections closed
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/force-logout/:userId',
  userOperationLimiter,
  validateRequest(userValidationSchemas.forceLogout),
  asyncHandler(UserController.forceLogout, 'force logout'),
);

const userIdRouter = express.Router({ mergeParams: true });

/**
 * @swagger
 * /users/{userId}/teams/edit:
 *   get:
 *     summary: Get user teams for editing (Admin only)
 *     description: Get team memberships for a user when editing. Admin-only endpoint.
 *     tags: [User Management]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Team memberships retrieved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       404:
 *         description: User not found
 */
userIdRouter.get(
  '/teams/edit',
  asyncHandler(UserController.getUserTeamsForEdit, 'get user teams for edit'),
);

/**
 * @swagger
 * /users/{userId}/team-assignments:
 *   put:
 *     summary: Update user team assignments
 *     description: Update a user's team assignments, removing them from old teams and adding to new ones (admin only)
 *     tags: [User Management - Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to update team assignments for
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teamAssignments:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/TeamAssignment'
 *                 description: Complete list of team assignments with permissions
 *             required:
 *               - teamAssignments
 *     responses:
 *       200:
 *         description: User team assignments updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     assignments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamId:
 *                             type: string
 *                           permissions:
 *                             type: array
 *                             items:
 *                               type: string
 *                           status:
 *                             type: string
 *                             enum: ['success', 'updated_permissions']
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Any errors encountered during update
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
userIdRouter.put(
  '/team-assignments',
  userOperationLimiter,
  validateRequest(userValidationSchemas.updateUserTeamAssignments),
  asyncHandler(
    UserController.updateUserTeamAssignments,
    'update user team assignments',
  ),
);

/**
 * @swagger
 * /users/{userId}/organization-role:
 *   put:
 *     summary: Update user organization role
 *     description: Update a user's role within the organization (admin only)
 *     tags: [User Management - Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organizationId:
 *                 type: string
 *                 description: ID of the organization
 *               role:
 *                 type: string
 *                 enum: ['member', 'admin', 'owner']
 *                 description: New role for the user
 *             required:
 *               - organizationId
 *               - role
 *     responses:
 *       200:
 *         description: User organization role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Updated membership data from Better Auth
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required or unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
userIdRouter.put(
  '/organization-role',
  userOperationLimiter,
  validateRequest(userValidationSchemas.updateUserOrganizationRole),
  asyncHandler(
    UserController.updateUserOrganizationRole,
    'update user organization role',
  ),
);

/**
 * @swagger
 * /users/{userId}/organization:
 *   delete:
 *     summary: Remove user from organization and delete user
 *     description: Remove a user from the organization (admin only). Due to single-organization architecture, this automatically deletes the user entirely via the afterRemoveMember hook, including cleanup of all user data (sessions, team memberships, etc.). The backend always uses the main organization.
 *     tags: [User Management - Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to remove from organization and delete
 *     responses:
 *       200:
 *         description: User removed from organization and deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User removed from organization"
 *               description: Note - User is also automatically deleted via hook after organization removal
 *       400:
 *         description: Invalid request data or user/organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required or unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

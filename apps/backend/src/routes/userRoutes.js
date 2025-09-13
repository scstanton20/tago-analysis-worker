import { Router } from 'express';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.js';
import UserController from '../controllers/userController.js';

const router = Router();

// Apply authentication to all user routes
router.use(authMiddleware);

/**
 * @swagger
 * /users/{userId}/team-memberships:
 *   get:
 *     summary: Get user team memberships
 *     description: Get team memberships for a user. Users can only access their own memberships, admins can access any user's memberships.
 *     tags: [User Management]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to get team memberships for
 *     responses:
 *       200:
 *         description: Team memberships retrieved successfully
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
 *                     teams:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/UserTeamMembership'
 *       400:
 *         description: Invalid userId provided
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
 *         description: Forbidden - can only access own memberships unless admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:userId/team-memberships', UserController.getUserTeamMemberships);

/**
 * @swagger
 * /users/set-initial-password:
 *   post:
 *     summary: Set initial password for new users
 *     description: Set password for users who need to change their password on first login (password onboarding)
 *     tags: [User Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPassword:
 *                 type: string
 *                 description: New password for the user
 *                 minLength: 6
 *             required:
 *               - newPassword
 *     responses:
 *       200:
 *         description: Password set successfully
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
 *                   example: "Password set successfully"
 *       400:
 *         description: Invalid password or missing newPassword
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
 */
router.post('/set-initial-password', UserController.setInitialPassword);

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
router.post('/add-to-organization', UserController.addToOrganization);

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
router.post('/assign-teams', UserController.assignUserToTeams);

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
router.put(
  '/:userId/team-assignments',
  UserController.updateUserTeamAssignments,
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
router.put(
  '/:userId/organization-role',
  UserController.updateUserOrganizationRole,
);

/**
 * @swagger
 * /users/{userId}/organization:
 *   delete:
 *     summary: Remove user from organization and delete user
 *     description: Remove a user from the organization (admin only). Due to single-organization architecture, this automatically deletes the user entirely via the afterRemoveMember hook, including cleanup of all user data (sessions, team memberships, etc.)
 *     tags: [User Management - Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to remove from organization and delete
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organizationId:
 *                 type: string
 *                 description: ID of the organization to remove user from
 *               userId:
 *                 type: string
 *                 description: ID of the user (must match path parameter)
 *             required:
 *               - organizationId
 *               - userId
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
router.delete(
  '/:userId/organization',
  UserController.removeUserFromOrganization,
);

export default router;

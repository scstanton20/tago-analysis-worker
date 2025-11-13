import { Router } from 'express';
import TeamController from '../controllers/teamController.js';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { teamValidationSchemas } from '../validation/teamSchemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { teamOperationLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Apply authentication to all team routes
router.use(authMiddleware);
router.use(requireAdmin);

// Custom team endpoints that handle Better Auth team table with custom properties
// We use custom endpoints because Better Auth's client methods don't support our custom fields

/**
 * @swagger
 * /teams:
 *   get:
 *     summary: Get all teams
 *     description: Get all teams with custom properties from Better Auth team table
 *     tags: [Team Management]
 *     responses:
 *       200:
 *         description: Teams retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Team'
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
router.get('/', asyncHandler(TeamController.getAllTeams));

/**
 * @swagger
 * /teams:
 *   post:
 *     summary: Create team with custom properties
 *     description: Create team in Better Auth table with custom properties (color, order)
 *     tags: [Team Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TeamCreateRequest'
 *     responses:
 *       201:
 *         description: Team created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Team'
 *       400:
 *         description: Invalid request data or team name already exists
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
 *       409:
 *         description: Team name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.createTeam),
  asyncHandler(TeamController.createTeam),
);

/**
 * @swagger
 * /teams/reorder:
 *   put:
 *     summary: Reorder teams
 *     description: Update the display order of teams
 *     tags: [Team Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderedIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of team IDs in desired order
 *     responses:
 *       200:
 *         description: Teams reordered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
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
  '/reorder',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.reorderTeams),
  asyncHandler(TeamController.reorderTeams),
);

/**
 * @swagger
 * /teams/{id}:
 *   put:
 *     summary: Update team with custom properties
 *     description: Update team in Better Auth table with custom properties
 *     tags: [Team Management]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TeamUpdateRequest'
 *     responses:
 *       200:
 *         description: Team updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Team'
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
 *       404:
 *         description: Team not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/:id',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.updateTeam),
  asyncHandler(TeamController.updateTeam),
);

/**
 * @swagger
 * /teams/{id}:
 *   delete:
 *     summary: Delete team with analysis migration
 *     description: Handle analysis migration before team deletion
 *     tags: [Team Management]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID to delete
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               moveAnalysesTo:
 *                 type: string
 *                 description: Team ID to move analyses to, or 'uncategorized'
 *                 default: 'uncategorized'
 *     responses:
 *       200:
 *         description: Team deleted successfully
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
 *                   example: "Team deleted successfully"
 *                 analysesMovedTo:
 *                   type: string
 *                   description: Where analyses were moved to
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
 *       404:
 *         description: Team not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  '/:id',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.deleteTeam),
  asyncHandler(TeamController.deleteTeam),
);

/**
 * @swagger
 * /teams/{id}/count:
 *   get:
 *     summary: Get analysis count for team
 *     description: Get the number of analyses assigned to a specific team
 *     tags: [Team Management]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID
 *     responses:
 *       200:
 *         description: Analysis count retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: number
 *                   description: Number of analyses in the team
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
 *       404:
 *         description: Team not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/:id/count',
  validateRequest(teamValidationSchemas.getTeamAnalysisCount),
  asyncHandler(TeamController.getTeamAnalysisCount),
);

// Analysis-team routes
/**
 * @swagger
 * /teams/analyses/{name}/team:
 *   put:
 *     summary: Move analysis to different team
 *     description: Move an analysis from one team to another
 *     tags: [Team Management]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file to move
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teamId:
 *                 type: string
 *                 description: Target team ID to move the analysis to
 *             required:
 *               - teamId
 *     responses:
 *       200:
 *         description: Analysis moved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 analysis:
 *                   type: string
 *                   description: Name of the moved analysis
 *                 from:
 *                   type: string
 *                   description: Source team ID
 *                 to:
 *                   type: string
 *                   description: Target team ID
 *       400:
 *         description: Invalid request data or missing teamId
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
 *       404:
 *         description: Analysis or team not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/analyses/:name/team',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.moveAnalysisToTeam),
  asyncHandler(TeamController.moveAnalysisToTeam),
);

// Folder management routes
/**
 * @swagger
 * /teams/{teamId}/folders:
 *   post:
 *     summary: Create folder in team
 *     description: Create a new folder within a team's structure
 *     tags: [Team Management, Folders]
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Folder name
 *               parentFolderId:
 *                 type: string
 *                 nullable: true
 *                 description: Parent folder ID (null for root level)
 *             required:
 *               - name
 *     responses:
 *       201:
 *         description: Folder created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TeamStructure'
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
 *       404:
 *         description: Team or parent folder not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/:teamId/folders',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.createFolder),
  asyncHandler(TeamController.createFolder),
);

/**
 * @swagger
 * /teams/{teamId}/folders/{folderId}:
 *   put:
 *     summary: Update folder
 *     description: Update folder name or expanded state
 *     tags: [Team Management, Folders]
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Folder ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New folder name
 *               expanded:
 *                 type: boolean
 *                 description: Folder expanded state
 *     responses:
 *       200:
 *         description: Folder updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TeamStructure'
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
 *       404:
 *         description: Team or folder not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/:teamId/folders/:folderId',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.updateFolder),
  asyncHandler(TeamController.updateFolder),
);

/**
 * @swagger
 * /teams/{teamId}/folders/{folderId}:
 *   delete:
 *     summary: Delete folder
 *     description: Delete folder and move children to parent
 *     tags: [Team Management, Folders]
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Folder ID
 *     responses:
 *       200:
 *         description: Folder deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TeamStructure'
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
 *       404:
 *         description: Team or folder not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  '/:teamId/folders/:folderId',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.deleteFolder),
  asyncHandler(TeamController.deleteFolder),
);

/**
 * @swagger
 * /teams/{teamId}/items/move:
 *   post:
 *     summary: Move item in tree
 *     description: Move an item (analysis or folder) within the team structure
 *     tags: [Team Management, Folders]
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MoveItemRequest'
 *     responses:
 *       200:
 *         description: Item moved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TeamStructure'
 *       400:
 *         description: Invalid move operation
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
 *       404:
 *         description: Team or item not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/:teamId/items/move',
  teamOperationLimiter,
  validateRequest(teamValidationSchemas.moveItem),
  asyncHandler(TeamController.moveItem),
);

export default router;

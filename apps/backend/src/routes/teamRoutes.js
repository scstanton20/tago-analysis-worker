// backend/src/routes/teamRoutes.js
import { Router } from 'express';
import * as teamController from '../controllers/teamController.js';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.js';

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
router.get('/', teamController.getAllTeams);

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
router.post('/', teamController.createTeam);

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
 */
router.put('/reorder', teamController.reorderTeams);

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
router.put('/:id', teamController.updateTeam);

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
router.delete('/:id', teamController.deleteTeam);

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
 */
router.get('/:id/count', teamController.getTeamAnalysisCount);

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
router.put('/analyses/:name/team', teamController.moveAnalysisToTeam);

export default router;

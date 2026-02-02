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
/**
 * @swagger
 * /analyses/upload:
 *   post:
 *     summary: Upload analysis file
 *     description: Upload a new Tago.io analysis script
 *     tags: [Analysis Management]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               analysis:
 *                 type: string
 *                 format: binary
 *                 description: Analysis JavaScript file
 *               teamId:
 *                 type: string
 *                 description: Team ID to assign the analysis
 *     responses:
 *       200:
 *         description: Analysis uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 filename:
 *                   type: string
 *       400:
 *         description: No file uploaded or invalid file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       413:
 *         description: File size exceeds maximum limit (50MB)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "File size exceeds the maximum limit of 50MB"
 *                 maxSizeMB:
 *                   type: number
 *                   example: 50
 *                 fileSizeMB:
 *                   type: string
 *                   example: "12.34"
 */
router.post(
  '/upload',
  uploadLimiter,
  validateRequest(analysisValidationSchemas.uploadAnalysis),
  requireTeamPermission('upload_analyses'),
  asyncHandler(AnalysisController.uploadAnalysis, 'upload analysis'),
);
/**
 * @swagger
 * /analyses:
 *   get:
 *     summary: Get all analyses
 *     description: |
 *       Retrieve list of all analyses with their current status and configuration.
 *       Supports filtering by search term, status, and team. Pagination is optional.
 *
 *       **Permissions:** Results are filtered based on user's team permissions.
 *       Admin users see all analyses; regular users only see analyses in their teams.
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: Case-insensitive name filter for analysis name
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by analysis ID (exact match)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [running, stopped, error]
 *         description: Filter by analysis status
 *       - in: query
 *         name: teamId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by team/department ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination (requires limit)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of results per page (requires page)
 *     responses:
 *       200:
 *         description: List of analyses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   description: Non-paginated response (when page/limit not provided)
 *                   additionalProperties:
 *                     $ref: '#/components/schemas/Analysis'
 *                 - type: object
 *                   description: Paginated response (when page and limit provided)
 *                   properties:
 *                     analyses:
 *                       type: object
 *                       additionalProperties:
 *                         $ref: '#/components/schemas/Analysis'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           description: Current page number
 *                         limit:
 *                           type: integer
 *                           description: Items per page
 *                         total:
 *                           type: integer
 *                           description: Total number of items
 *                         totalPages:
 *                           type: integer
 *                           description: Total number of pages
 *                         hasMore:
 *                           type: boolean
 *                           description: Whether more pages exist
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /analyses/{analysisId}/run:
 *   post:
 *     summary: Run analysis
 *     description: Start execution of a specific analysis
 *     tags: [Analysis Execution]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis to run
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [listener]
 *                 description: Type of analysis execution
 *     responses:
 *       200:
 *         description: Analysis started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 process:
 *                   type: object
 *                   description: Process information
 *       404:
 *         description: Analysis file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.post(
  '/run',
  analysisRunLimiter,
  validateRequest(analysisValidationSchemas.runAnalysis),
  requireTeamPermission('run_analyses'),
  asyncHandler(AnalysisController.runAnalysis, 'run analysis'),
);
/**
 * @swagger
 * /analyses/{analysisId}/stop:
 *   post:
 *     summary: Stop analysis
 *     description: Stop execution of a running analysis
 *     tags: [Analysis Execution]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis to stop
 *     responses:
 *       200:
 *         description: Analysis stopped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Analysis not found or not running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.post(
  '/stop',
  analysisRunLimiter,
  validateRequest(analysisValidationSchemas.stopAnalysis),
  requireTeamPermission('run_analyses'),
  asyncHandler(AnalysisController.stopAnalysis, 'stop analysis'),
);
/**
 * @swagger
 * /analyses/{analysisId}:
 *   delete:
 *     summary: Delete analysis
 *     description: Delete an analysis and all its associated data
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis to delete
 *     responses:
 *       200:
 *         description: Analysis deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.delete(
  '/',
  deletionLimiter,
  validateRequest(analysisValidationSchemas.deleteAnalysis),
  requireTeamPermission('delete_analyses'),
  asyncHandler(AnalysisController.deleteAnalysis, 'delete analysis'),
);
/**
 * @swagger
 * /analyses/{analysisId}/content:
 *   get:
 *     summary: Get analysis file content
 *     description: Retrieve the source code content of an analysis
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     responses:
 *       200:
 *         description: Analysis content retrieved successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               description: The analysis file source code
 *       404:
 *         description: Analysis file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.get(
  '/content',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getAnalysisContent),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalysisContent, 'get analysis content'),
);
/**
 * @swagger
 * /analyses/{analysisId}:
 *   put:
 *     summary: Update analysis content
 *     description: Update the source code content of an analysis
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: New analysis source code content
 *             required:
 *               - content
 *     responses:
 *       200:
 *         description: Analysis updated successfully
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
 *                   example: "Analysis updated successfully"
 *                 restarted:
 *                   type: boolean
 *                   description: Whether the analysis was restarted after update
 *       400:
 *         description: Invalid content provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.put(
  '/',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.updateAnalysis),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.updateAnalysis, 'update analysis'),
);
/**
 * @swagger
 * /analyses/{analysisId}/rename:
 *   put:
 *     summary: Rename analysis
 *     description: Rename an analysis to a new display name
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis to rename
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newName:
 *                 type: string
 *                 description: New display name for the analysis
 *             required:
 *               - newName
 *     responses:
 *       200:
 *         description: Analysis renamed successfully
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
 *                   example: "Analysis renamed successfully"
 *                 restarted:
 *                   type: boolean
 *                   description: Whether the analysis was restarted after rename
 *       400:
 *         description: Invalid new filename provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.put(
  '/rename',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.renameAnalysis),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.renameAnalysis, 'rename analysis'),
);
/**
 * @swagger
 * /analyses/{analysisId}/download:
 *   get:
 *     summary: Download analysis file
 *     description: Download the current analysis file or a specific version
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *       - in: query
 *         name: version
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Specific version to download. If not provided or 0, downloads current version
 *     responses:
 *       200:
 *         description: Analysis file downloaded successfully
 *         content:
 *           application/javascript:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename with version suffix if applicable
 *             schema:
 *               type: string
 *               example: analysis_v2.js
 *       400:
 *         description: Invalid version number
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Analysis or version not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.get(
  '/download',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.downloadAnalysis),
  requireTeamPermission('download_analyses'),
  asyncHandler(AnalysisController.downloadAnalysis, 'download analysis'),
);

// Environment management routes
/**
 * @swagger
 * /analyses/{analysisId}/environment:
 *   get:
 *     summary: Get analysis environment variables
 *     description: Retrieve environment variables for an analysis
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     responses:
 *       200:
 *         description: Environment variables retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalysisEnvironment'
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.get(
  '/environment',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getEnvironment),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getEnvironment, 'get environment'),
);
/**
 * @swagger
 * /analyses/{analysisId}/environment:
 *   put:
 *     summary: Update analysis environment variables
 *     description: Update environment variables for an analysis
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               env:
 *                 $ref: '#/components/schemas/AnalysisEnvironment'
 *             required:
 *               - env
 *     responses:
 *       200:
 *         description: Environment variables updated successfully
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
 *                   example: "Environment updated successfully"
 *                 restarted:
 *                   type: boolean
 *                   description: Whether the analysis was restarted after update
 *       400:
 *         description: Invalid environment variables provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.put(
  '/environment',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.updateEnvironment),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.updateEnvironment, 'update environment'),
);

// Logs management routes
/**
 * @swagger
 * /analyses/{analysisId}/logs:
 *   get:
 *     summary: Get analysis logs
 *     description: |
 *       Retrieve logs for an analysis as plain text.
 *       Each line is formatted as: [HH:MM:SS] message
 *     tags: [Analysis Logs]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 200
 *         description: Number of log entries per page
 *     responses:
 *       200:
 *         description: Logs retrieved successfully as plain text
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               description: Log entries, one per line in format [HH:MM:SS] message
 *               example: |
 *                 [12:00:00] Analysis started
 *                 [12:00:01] Processing data...
 *                 [12:00:02] Completed successfully
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.get(
  '/logs',
  validateRequest(analysisValidationSchemas.getLogs),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getLogs, 'get logs'),
);
/**
 * @swagger
 * /analyses/{analysisId}/logs/download:
 *   get:
 *     summary: Download analysis logs
 *     description: Download logs for a specific time range as a compressed zip file
 *     tags: [Analysis Logs]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *       - in: query
 *         name: timeRange
 *         required: true
 *         schema:
 *           type: string
 *           enum: ['1h', '24h', '7d', '30d', 'all']
 *         description: Time range for logs to download
 *     responses:
 *       200:
 *         description: Compressed log file downloaded successfully
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename
 *             schema:
 *               type: string
 *               example: analysis_logs.zip
 *       400:
 *         description: Invalid time range
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Analysis or log file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.get(
  '/logs/download',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.downloadLogs),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.downloadLogs, 'download logs'),
);

/**
 * @swagger
 * /analyses/{analysisId}/logs/options:
 *   get:
 *     summary: Get log download options
 *     description: Returns available time range options for log downloads
 *     tags: [Analysis Logs]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     responses:
 *       200:
 *         description: Available time range options
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timeRangeOptions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       value:
 *                         type: string
 *                         description: The value to use in the timeRange query parameter
 *                       label:
 *                         type: string
 *                         description: Human-readable label for display
 */
analysisIdRouter.get(
  '/logs/options',
  requireTeamPermission('view_analyses'),
  (_req: Request, res: Response) => {
    res.json({ timeRangeOptions: LOG_TIME_RANGE_OPTIONS });
  },
);

/**
 * @swagger
 * /analyses/{analysisId}/logs:
 *   delete:
 *     summary: Clear analysis logs
 *     description: Clear all log entries for an analysis
 *     tags: [Analysis Logs]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     responses:
 *       200:
 *         description: Logs cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.delete(
  '/logs',
  deletionLimiter,
  validateRequest(analysisValidationSchemas.clearLogs),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.clearLogs, 'clear logs'),
);

// Version management routes
/**
 * @swagger
 * /analyses/{analysisId}/versions:
 *   get:
 *     summary: Get version history
 *     description: Retrieve all saved versions of an analysis with metadata including timestamps and file sizes
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     responses:
 *       200:
 *         description: Version history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 versions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Analysis'
 *                 nextVersionNumber:
 *                   type: integer
 *                   description: Next version number that will be used
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.get(
  '/versions',
  versionOperationLimiter,
  validateRequest(analysisValidationSchemas.getVersions),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getVersions, 'get versions'),
);

/**
 * @swagger
 * /analyses/{analysisId}/rollback:
 *   post:
 *     summary: Rollback to previous version
 *     description: Rollback analysis to a specific version. Current version is automatically saved if content differs from target version.
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Version number to rollback to
 *                 minimum: 1
 *             required:
 *               - version
 *     responses:
 *       200:
 *         description: Rollback completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Whether rollback was successful
 *                 message:
 *                   type: string
 *                   description: Success message
 *                 version:
 *                   type: integer
 *                   description: Version rolled back to
 *                 restarted:
 *                   type: boolean
 *                   description: Whether analysis was restarted after rollback
 *       400:
 *         description: Invalid version number or version not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.post(
  '/rollback',
  versionOperationLimiter,
  validateRequest(analysisValidationSchemas.rollbackToVersion),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.rollbackToVersion, 'rollback to version'),
);

// Analysis info routes
/**
 * @swagger
 * /analyses/{analysisId}/info/meta:
 *   get:
 *     summary: Get analysis metadata
 *     description: |
 *       Retrieve comprehensive metadata about an analysis including:
 *       - File statistics (size, line count, creation/modification dates)
 *       - Environment variable summary (count, size)
 *       - Log file statistics
 *       - Version history summary
 *       - Team ownership information
 *       - Process status and metrics (if running)
 *       - DNS cache usage statistics
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     responses:
 *       200:
 *         description: Analysis metadata retrieved successfully
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.get(
  '/info/meta',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getAnalysisMeta),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalysisMeta, 'get analysis metadata'),
);

/**
 * @swagger
 * /analyses/{analysisId}/info:
 *   get:
 *     summary: Get analysis notes
 *     description: |
 *       Retrieve markdown notes for an analysis.
 *       If no notes exist, a default template will be created and returned.
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     responses:
 *       200:
 *         description: Analysis notes retrieved successfully
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.get(
  '/info',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getAnalysisNotes),
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalysisNotes, 'get analysis notes'),
);

/**
 * @swagger
 * /analyses/{analysisId}/info:
 *   put:
 *     summary: Update analysis notes
 *     description: Update markdown notes for an analysis
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the analysis
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Markdown content for the notes
 *                 maxLength: 100000
 *             required:
 *               - content
 *     responses:
 *       200:
 *         description: Notes updated successfully
 *       400:
 *         description: Invalid content provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Analysis not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
analysisIdRouter.put(
  '/info',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.updateAnalysisNotes),
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.updateAnalysisNotes, 'update analysis notes'),
);

router.use('/:analysisId', analysisIdRouter);

export { router as analysisRouter };

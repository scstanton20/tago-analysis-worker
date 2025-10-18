// backend/src/routes/analysisRoutes.js
import { Router } from 'express';
import AnalysisController from '../controllers/analysisController.js';
import {
  authMiddleware,
  extractAnalysisTeam,
  requireTeamPermission,
  requireAnyTeamPermission,
} from '../middleware/betterAuthMiddleware.js';
import {
  fileOperationLimiter,
  uploadLimiter,
  analysisRunLimiter,
  deletionLimiter,
  versionOperationLimiter,
} from '../middleware/rateLimiter.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { analysisValidationSchemas } from '../validation/analysisSchemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

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
 *               department:
 *                 type: string
 *                 description: Department ID to assign the analysis
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
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/upload',
  uploadLimiter,
  validateRequest(analysisValidationSchemas.uploadAnalysis),
  requireTeamPermission('upload_analyses'),
  asyncHandler(AnalysisController.uploadAnalysis),
);
/**
 * @swagger
 * /analyses:
 *   get:
 *     summary: Get all analyses
 *     description: Retrieve list of all analyses with their current status and configuration
 *     tags: [Analysis Management]
 *     responses:
 *       200:
 *         description: List of analyses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analyses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Analysis'
 *                 departments:
 *                   type: object
 *                   description: Department mapping
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
  // For listing all analyses, allow if user has view permission in ANY team
  // The controller will filter analyses based on user's team memberships
  requireAnyTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalyses),
);
/**
 * @swagger
 * /analyses/{fileName}/run:
 *   post:
 *     summary: Run analysis
 *     description: Start execution of a specific analysis
 *     tags: [Analysis Execution]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file to run
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
router.post(
  '/:fileName/run',
  analysisRunLimiter,
  validateRequest(analysisValidationSchemas.runAnalysis),
  extractAnalysisTeam,
  requireTeamPermission('run_analyses'),
  asyncHandler(AnalysisController.runAnalysis),
);
/**
 * @swagger
 * /analyses/{fileName}/stop:
 *   post:
 *     summary: Stop analysis
 *     description: Stop execution of a running analysis
 *     tags: [Analysis Execution]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file to stop
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
router.post(
  '/:fileName/stop',
  analysisRunLimiter,
  validateRequest(analysisValidationSchemas.stopAnalysis),
  extractAnalysisTeam,
  requireTeamPermission('run_analyses'),
  asyncHandler(AnalysisController.stopAnalysis),
);
/**
 * @swagger
 * /analyses/{fileName}:
 *   delete:
 *     summary: Delete analysis
 *     description: Delete an analysis file and all its associated data
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file to delete
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
router.delete(
  '/:fileName',
  deletionLimiter,
  validateRequest(analysisValidationSchemas.deleteAnalysis),
  extractAnalysisTeam,
  requireTeamPermission('delete_analyses'),
  asyncHandler(AnalysisController.deleteAnalysis),
);
/**
 * @swagger
 * /analyses/{fileName}/content:
 *   get:
 *     summary: Get analysis file content
 *     description: Retrieve the source code content of an analysis file
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
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
router.get(
  '/:fileName/content',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getAnalysisContent),
  extractAnalysisTeam,
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getAnalysisContent),
);
/**
 * @swagger
 * /analyses/{fileName}:
 *   put:
 *     summary: Update analysis content
 *     description: Update the source code content of an analysis file
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file to update
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
router.put(
  '/:fileName',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.updateAnalysis),
  extractAnalysisTeam,
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.updateAnalysis),
);
/**
 * @swagger
 * /analyses/{fileName}/rename:
 *   put:
 *     summary: Rename analysis file
 *     description: Rename an analysis file to a new name
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Current name of the analysis file
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newFileName:
 *                 type: string
 *                 description: New name for the analysis file
 *             required:
 *               - newFileName
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
router.put(
  '/:fileName/rename',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.renameAnalysis),
  extractAnalysisTeam,
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.renameAnalysis),
);
/**
 * @swagger
 * /analyses/{fileName}/download:
 *   get:
 *     summary: Download analysis file
 *     description: Download the current analysis file or a specific version
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
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
router.get(
  '/:fileName/download',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.downloadAnalysis),
  extractAnalysisTeam,
  requireTeamPermission('download_analyses'),
  asyncHandler(AnalysisController.downloadAnalysis),
);

// Environment management routes
/**
 * @swagger
 * /analyses/{fileName}/environment:
 *   get:
 *     summary: Get analysis environment variables
 *     description: Retrieve environment variables for an analysis
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
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
router.get(
  '/:fileName/environment',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.getEnvironment),
  extractAnalysisTeam,
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getEnvironment),
);
/**
 * @swagger
 * /analyses/{fileName}/environment:
 *   put:
 *     summary: Update analysis environment variables
 *     description: Update environment variables for an analysis
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
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
router.put(
  '/:fileName/environment',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.updateEnvironment),
  extractAnalysisTeam,
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.updateEnvironment),
);

// Logs management routes
/**
 * @swagger
 * /analyses/{fileName}/logs:
 *   get:
 *     summary: Get analysis logs
 *     description: Retrieve paginated logs for an analysis
 *     tags: [Analysis Logs]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
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
 *           maximum: 1000
 *           default: 100
 *         description: Number of log entries per page
 *     responses:
 *       200:
 *         description: Logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalysisLogs'
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
router.get(
  '/:fileName/logs',
  validateRequest(analysisValidationSchemas.getLogs),
  extractAnalysisTeam,
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getLogs),
);
/**
 * @swagger
 * /analyses/{fileName}/logs/download:
 *   get:
 *     summary: Download analysis logs
 *     description: Download logs for a specific time range as a file
 *     tags: [Analysis Logs]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
 *       - in: query
 *         name: timeRange
 *         required: true
 *         schema:
 *           type: string
 *           enum: ['1h', '24h', '7d', '30d', 'all']
 *         description: Time range for logs to download
 *     responses:
 *       200:
 *         description: Log file downloaded successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename
 *             schema:
 *               type: string
 *               example: analysis.log
 *       400:
 *         description: Invalid time range or missing fileName
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
router.get(
  '/:fileName/logs/download',
  fileOperationLimiter,
  validateRequest(analysisValidationSchemas.downloadLogs),
  extractAnalysisTeam,
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.downloadLogs),
);
/**
 * @swagger
 * /analyses/{fileName}/logs:
 *   delete:
 *     summary: Clear analysis logs
 *     description: Clear all log entries for an analysis
 *     tags: [Analysis Logs]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
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
router.delete(
  '/:fileName/logs',
  deletionLimiter,
  validateRequest(analysisValidationSchemas.clearLogs),
  extractAnalysisTeam,
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.clearLogs),
);

// Version management routes
/**
 * @swagger
 * /analyses/{fileName}/versions:
 *   get:
 *     summary: Get version history
 *     description: Retrieve all saved versions of an analysis with metadata including timestamps and file sizes
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
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
 *                     type: object
 *                     properties:
 *                       version:
 *                         type: integer
 *                         description: Version number
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         description: When this version was created
 *                       size:
 *                         type: integer
 *                         description: File size in bytes
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
router.get(
  '/:fileName/versions',
  versionOperationLimiter,
  validateRequest(analysisValidationSchemas.getVersions),
  extractAnalysisTeam,
  requireTeamPermission('view_analyses'),
  asyncHandler(AnalysisController.getVersions),
);

/**
 * @swagger
 * /analyses/{fileName}/rollback:
 *   post:
 *     summary: Rollback to previous version
 *     description: Rollback analysis to a specific version. Current version is automatically saved if content differs from target version.
 *     tags: [Analysis Management]
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the analysis file
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
router.post(
  '/:fileName/rollback',
  versionOperationLimiter,
  validateRequest(analysisValidationSchemas.rollbackToVersion),
  extractAnalysisTeam,
  requireTeamPermission('edit_analyses'),
  asyncHandler(AnalysisController.rollbackToVersion),
);

export default router;

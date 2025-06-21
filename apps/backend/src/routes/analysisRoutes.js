// backend/src/routes/analysisRoutes.js
import express from 'express';
import * as analysisController from '../controllers/analysisController.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import {
  fileOperationLimiter,
  uploadLimiter,
  analysisRunLimiter,
  deletionLimiter,
} from '../middleware/rateLimiter.js';

const router = express.Router();

// Apply authentication to all analysis routes
router.use(authMiddleware);

// Add error handling middleware specifically for this router
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

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
  requirePermission('upload_analyses'),
  asyncHandler(analysisController.uploadAnalysis),
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
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getAnalyses),
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
 *                 enum: [listener, scheduled]
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
  requirePermission('run_analyses'),
  asyncHandler(analysisController.runAnalysis),
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
  requirePermission('run_analyses'),
  asyncHandler(analysisController.stopAnalysis),
);
router.delete(
  '/:fileName',
  deletionLimiter,
  requirePermission('delete_analyses'),
  asyncHandler(analysisController.deleteAnalysis),
);
router.get(
  '/:fileName/content',
  fileOperationLimiter,
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getAnalysisContent),
);
router.put(
  '/:fileName',
  fileOperationLimiter,
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.updateAnalysis),
);
router.put(
  '/:fileName/rename',
  fileOperationLimiter,
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.renameAnalysis),
);
router.get(
  '/:fileName/download',
  fileOperationLimiter,
  requirePermission('download_analyses'),
  asyncHandler(analysisController.downloadAnalysis),
);

// Environment management routes
router.get(
  '/:fileName/environment',
  fileOperationLimiter,
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getEnvironment),
);
router.put(
  '/:fileName/environment',
  fileOperationLimiter,
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.updateEnvironment),
);

// Logs management routes
router.get(
  '/:fileName/logs',
  fileOperationLimiter,
  requirePermission('view_analyses'),
  asyncHandler(analysisController.getLogs),
);
router.get(
  '/:fileName/logs/download',
  fileOperationLimiter,
  requirePermission('download_analyses'),
  asyncHandler(analysisController.downloadLogs),
);
router.delete(
  '/:fileName/logs',
  deletionLimiter,
  requirePermission('edit_analyses'),
  asyncHandler(analysisController.clearLogs),
);

export default router;

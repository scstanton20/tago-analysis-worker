import express from 'express';
import { UtilsDocsController } from '../controllers/utilsDocsController.ts';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.ts';

const router = express.Router();

// Apply authentication to all utils docs routes
router.use(authMiddleware);
router.use(requireAdmin);

/**
 * @swagger
 * /utils-docs:
 *   get:
 *     summary: Get available packages and utilities overview
 *     description: Retrieve simple lists of available packages and utilities
 *     tags: [Utilities Documentation]
 *     responses:
 *       200:
 *         description: Overview retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 packages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       import:
 *                         type: string
 *                       description:
 *                         type: string
 *                       docsUrl:
 *                         type: string
 *                 utilities:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       import:
 *                         type: string
 *                       description:
 *                         type: string
 *       500:
 *         description: Failed to retrieve overview
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', UtilsDocsController.getOverview);

/**
 * @swagger
 * /utils-docs/packages:
 *   get:
 *     summary: Get available packages
 *     description: Retrieve list of npm packages available for import in analysis scripts
 *     tags: [Utilities Documentation]
 *     responses:
 *       200:
 *         description: Available packages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "@tago-io/sdk"
 *                   import:
 *                     type: string
 *                     example: "import { Analysis } from '@tago-io/sdk';"
 *                   description:
 *                     type: string
 *                   docsUrl:
 *                     type: string
 *                     format: uri
 *       500:
 *         description: Failed to retrieve packages
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/packages', UtilsDocsController.getPackages);

/**
 * @swagger
 * /utils-docs/utilities:
 *   get:
 *     summary: Get utility OpenAPI documentation
 *     description: Retrieve OpenAPI specification for all in-process utility modules
 *     tags: [Utilities Documentation]
 *     responses:
 *       200:
 *         description: Utility documentation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 openapi:
 *                   type: string
 *                   example: "3.0.0"
 *                 info:
 *                   type: object
 *                 paths:
 *                   type: object
 *                 components:
 *                   type: object
 *       500:
 *         description: Failed to retrieve utilities
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/utilities', UtilsDocsController.getUtilities);

export default router;

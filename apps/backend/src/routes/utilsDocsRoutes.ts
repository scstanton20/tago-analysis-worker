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
 *     summary: Get utility documentation
 *     description: Retrieve OpenAPI specification for all in-process utility modules available to analysis scripts
 *     tags: [Utils Documentation]
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
 *         description: Failed to generate utility documentation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Note: Not using asyncHandler - controller has its own try/catch and is synchronous
router.get('/', UtilsDocsController.getUtilsDocs);

export default router;

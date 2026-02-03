import express from 'express';
import { UtilsDocsController } from '../controllers/utilsDocsController.ts';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

const router = express.Router();

// Apply authentication to all utils docs routes
router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', asyncHandler(UtilsDocsController.getOverview, 'get overview'));

router.get(
  '/packages',
  asyncHandler(UtilsDocsController.getPackages, 'get packages'),
);

router.get(
  '/utilities',
  asyncHandler(UtilsDocsController.getUtilities, 'get utilities'),
);

export { router as utilsDocsRouter };

// routes/settingsRoutes.ts
import express from 'express';
import { SettingsController } from '../controllers/settingsController.ts';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.ts';
import { validateRequest } from '../middleware/validateRequest.ts';
import { settingsValidationSchemas } from '../validation/settingsSchemas.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { settingsOperationLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

// Apply authentication and admin authorization to all settings routes
router.use(authMiddleware);
router.use(requireAdmin);

const dnsRouter = express.Router({ mergeParams: true });

// DNS Cache Settings Routes
dnsRouter.get(
  '/config',
  validateRequest(settingsValidationSchemas.getDNSConfig),
  asyncHandler(SettingsController.getDNSConfig, 'get DNS config'),
);

dnsRouter.put(
  '/config',
  settingsOperationLimiter,
  validateRequest(settingsValidationSchemas.updateDNSConfig),
  asyncHandler(SettingsController.updateDNSConfig, 'update DNS config'),
);

dnsRouter.get(
  '/entries',
  validateRequest(settingsValidationSchemas.getDNSCacheEntries),
  asyncHandler(SettingsController.getDNSCacheEntries, 'get DNS cache entries'),
);

dnsRouter.delete(
  '/cache',
  settingsOperationLimiter,
  validateRequest(settingsValidationSchemas.clearDNSCache),
  asyncHandler(SettingsController.clearDNSCache, 'clear DNS cache'),
);

dnsRouter.delete(
  '/cache/:key',
  settingsOperationLimiter,
  validateRequest(settingsValidationSchemas.deleteDNSCacheEntry),
  asyncHandler(
    SettingsController.deleteDNSCacheEntry,
    'delete DNS cache entry',
  ),
);

dnsRouter.post(
  '/stats/reset',
  settingsOperationLimiter,
  validateRequest(settingsValidationSchemas.resetDNSStats),
  asyncHandler(SettingsController.resetDNSStats, 'reset DNS stats'),
);

dnsRouter.get(
  '/analysis',
  asyncHandler(
    SettingsController.getAllAnalysisDNSStats,
    'get all analysis DNS stats',
  ),
);

dnsRouter.get(
  '/analysis/:analysisId',
  asyncHandler(
    SettingsController.getAnalysisDNSStats,
    'get analysis DNS stats',
  ),
);

dnsRouter.get(
  '/analysis/:analysisId/entries',
  asyncHandler(
    SettingsController.getAnalysisDNSCacheEntries,
    'get analysis DNS cache entries',
  ),
);

router.use('/dns', dnsRouter);

export { router as settingsRouter };

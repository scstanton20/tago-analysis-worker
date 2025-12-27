// routes/settingsRoutes.js
import { Router } from 'express';
import { SettingsController } from '../controllers/settingsController.js';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { settingsValidationSchemas } from '../validation/settingsSchemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { settingsOperationLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Apply authentication and admin authorization to all settings routes
router.use(authMiddleware);
router.use(requireAdmin);

const dnsRouter = Router({ mergeParams: true });

// DNS Cache Settings Routes
/**
 * @swagger
 * /settings/dns/config:
 *   get:
 *     summary: Get DNS cache configuration and statistics
 *     description: Retrieve the current DNS cache configuration settings and performance statistics
 *     tags: [DNS Cache Settings]
 *     responses:
 *       200:
 *         description: DNS configuration and stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DNSConfigResponse'
 *       500:
 *         description: Failed to get DNS configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
dnsRouter.get(
  '/config',
  validateRequest(settingsValidationSchemas.getDNSConfig),
  asyncHandler(SettingsController.getDNSConfig, 'get DNS config'),
);

/**
 * @swagger
 * /settings/dns/config:
 *   put:
 *     summary: Update DNS cache configuration
 *     description: Update DNS cache settings including enabled status, TTL, and max entries. Broadcasts configuration updates via SSE.
 *     tags: [DNS Cache Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DNSConfigUpdateRequest'
 *     responses:
 *       200:
 *         description: DNS configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'DNS configuration updated successfully'
 *                 config:
 *                   $ref: '#/components/schemas/DNSConfig'
 *                 stats:
 *                   $ref: '#/components/schemas/DNSStats'
 *       400:
 *         description: Invalid configuration parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to update DNS configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
dnsRouter.put(
  '/config',
  settingsOperationLimiter,
  validateRequest(settingsValidationSchemas.updateDNSConfig),
  asyncHandler(SettingsController.updateDNSConfig, 'update DNS config'),
);

/**
 * @swagger
 * /settings/dns/entries:
 *   get:
 *     summary: Get all DNS cache entries
 *     description: Retrieve all current DNS cache entries with metadata including age, remaining TTL, and expiration status
 *     tags: [DNS Cache Settings]
 *     responses:
 *       200:
 *         description: DNS cache entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DNSCacheEntriesResponse'
 *       500:
 *         description: Failed to get DNS cache entries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
dnsRouter.get(
  '/entries',
  validateRequest(settingsValidationSchemas.getDNSCacheEntries),
  asyncHandler(SettingsController.getDNSCacheEntries, 'get DNS cache entries'),
);

/**
 * @swagger
 * /settings/dns/cache:
 *   delete:
 *     summary: Clear entire DNS cache
 *     description: Clear all DNS cache entries and broadcast the cache cleared event via SSE
 *     tags: [DNS Cache Settings]
 *     responses:
 *       200:
 *         description: DNS cache cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'DNS cache cleared successfully'
 *                 entriesCleared:
 *                   type: number
 *                   description: Number of entries that were cleared
 *                   example: 123
 *                 stats:
 *                   $ref: '#/components/schemas/DNSStats'
 *       500:
 *         description: Failed to clear DNS cache
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
dnsRouter.delete(
  '/cache',
  settingsOperationLimiter,
  validateRequest(settingsValidationSchemas.clearDNSCache),
  asyncHandler(SettingsController.clearDNSCache, 'clear DNS cache'),
);

/**
 * @swagger
 * /settings/dns/cache/{key}:
 *   delete:
 *     summary: Delete specific DNS cache entry
 *     description: Delete a specific DNS cache entry by its cache key
 *     tags: [DNS Cache Settings]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The cache key to delete (e.g., 'google.com:4' or 'resolve4:example.com')
 *         example: 'google.com:4'
 *     responses:
 *       200:
 *         description: DNS cache entry deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'DNS cache entry deleted successfully'
 *                 key:
 *                   type: string
 *                   description: The cache key that was deleted
 *                   example: 'google.com:4'
 *       400:
 *         description: Cache key is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Cache entry not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to delete DNS cache entry
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
dnsRouter.delete(
  '/cache/:key',
  settingsOperationLimiter,
  validateRequest(settingsValidationSchemas.deleteDNSCacheEntry),
  asyncHandler(
    SettingsController.deleteDNSCacheEntry,
    'delete DNS cache entry',
  ),
);

/**
 * @swagger
 * /settings/dns/stats/reset:
 *   post:
 *     summary: Reset DNS cache statistics
 *     description: Reset all DNS cache performance statistics (hits, misses, errors, evictions) and broadcast the stats reset event via SSE
 *     tags: [DNS Cache Settings]
 *     responses:
 *       200:
 *         description: DNS cache statistics reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'DNS cache statistics reset successfully'
 *                 stats:
 *                   $ref: '#/components/schemas/DNSStats'
 *       500:
 *         description: Failed to reset DNS statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
dnsRouter.post(
  '/stats/reset',
  settingsOperationLimiter,
  validateRequest(settingsValidationSchemas.resetDNSStats),
  asyncHandler(SettingsController.resetDNSStats, 'reset DNS stats'),
);

/**
 * @swagger
 * /settings/dns/analysis:
 *   get:
 *     summary: Get DNS stats for all analyses
 *     description: Retrieve DNS cache statistics broken down by analysis
 *     tags: [DNS Cache Settings]
 *     responses:
 *       200:
 *         description: Per-analysis DNS stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analysisStats:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       hits:
 *                         type: number
 *                       misses:
 *                         type: number
 *                       errors:
 *                         type: number
 *                       hitRate:
 *                         type: string
 *                       hostnameCount:
 *                         type: number
 *                       hostnames:
 *                         type: array
 *                         items:
 *                           type: string
 */
dnsRouter.get(
  '/analysis',
  asyncHandler(
    SettingsController.getAllAnalysisDNSStats,
    'get all analysis DNS stats',
  ),
);

/**
 * @swagger
 * /settings/dns/analysis/{analysisId}:
 *   get:
 *     summary: Get DNS stats for a specific analysis
 *     description: Retrieve DNS cache statistics for a specific analysis
 *     tags: [DNS Cache Settings]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *         description: The analysis ID
 *     responses:
 *       200:
 *         description: Analysis DNS stats retrieved successfully
 */
dnsRouter.get(
  '/analysis/:analysisId',
  asyncHandler(
    SettingsController.getAnalysisDNSStats,
    'get analysis DNS stats',
  ),
);

/**
 * @swagger
 * /settings/dns/analysis/{analysisId}/entries:
 *   get:
 *     summary: Get DNS cache entries for a specific analysis
 *     description: Retrieve DNS cache entries used by a specific analysis
 *     tags: [DNS Cache Settings]
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *         description: The analysis ID
 *     responses:
 *       200:
 *         description: Analysis DNS cache entries retrieved successfully
 */
dnsRouter.get(
  '/analysis/:analysisId/entries',
  asyncHandler(
    SettingsController.getAnalysisDNSCacheEntries,
    'get analysis DNS cache entries',
  ),
);

router.use('/dns', dnsRouter);

export { router as settingsRouter };

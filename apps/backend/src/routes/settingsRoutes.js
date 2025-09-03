// routes/settingsRoutes.js
import { Router } from 'express';
import {
  getDNSConfig,
  updateDNSConfig,
  getDNSCacheEntries,
  clearDNSCache,
  deleteDNSCacheEntry,
  resetDNSStats,
} from '../controllers/settingsController.js';
import { authMiddleware } from '../middleware/betterAuthMiddleware.js';

const router = Router();

// Apply authentication to all settings routes
router.use(authMiddleware);

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
router.get('/dns/config', getDNSConfig);

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
router.put('/dns/config', updateDNSConfig);

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
router.get('/dns/entries', getDNSCacheEntries);

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
router.delete('/dns/cache', clearDNSCache);

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
router.delete('/dns/cache/:key', deleteDNSCacheEntry);

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
router.post('/dns/stats/reset', resetDNSStats);

export default router;

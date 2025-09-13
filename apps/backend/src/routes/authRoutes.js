/**
 * @fileoverview Documentation-only route file for Better-Auth endpoints
 * These endpoints are handled by Better-Auth middleware, not custom implementations.
 * This file exists purely for Swagger documentation purposes.
 */

import { Router } from 'express';

const router = Router();

/**
 * @swagger
 * /auth/get-session:
 *   get:
 *     summary: Get current user session
 *     description: |
 *       Retrieve the current authenticated user's session information including user details and session metadata.
 *       This endpoint is provided by Better-Auth and uses cookie-based authentication.
 *
 *       **Note**: This endpoint is handled by Better-Auth middleware, not a custom implementation.
 *     tags: [Better-Auth]
 *     responses:
 *       200:
 *         description: Session retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Session'
 *             example:
 *               user:
 *                 id: "user_123"
 *                 username: "johndoe"
 *                 email: "john@example.com"
 *                 role: "user"
 *                 permissions: {}
 *                 mustChangePassword: false
 *               session:
 *                 id: "session_456"
 *                 token: "sess_abcdef123456"
 *                 userId: "user_123"
 *                 expiresAt: "2024-01-15T10:30:00.000Z"
 *                 ipAddress: "192.168.1.100"
 *                 userAgent: "Mozilla/5.0..."
 *       401:
 *         description: No valid session found - user not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "No session found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// This router is used only for documentation purposes
// The actual endpoints are handled by Better-Auth middleware
export default router;

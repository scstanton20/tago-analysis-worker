import express from 'express';
import {
  login,
  logout,
  logoutAllSessions,
  changeProfilePassword,
  passwordOnboarding,
  refresh,
  getProfile,
  updateProfile,
  createUser,
  updateUser,
  deleteUser,
  getAllUsers,
  resetUserPassword,
  getUserPermissions,
  updateUserPermissions,
  getAvailableDepartments,
  getAvailableActions,
} from '../controllers/authController.js';
import {
  authMiddleware,
  requireRole,
  loginRateLimit,
} from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     AuthenticationInfo:
 *       type: object
 *       description: |
 *         **Authentication System Overview:**
 *
 *         This API uses a secure JWT-based authentication system with the following features:
 *
 *         **Security Features:**
 *         - HTTPOnly cookies for token storage (prevents XSS attacks)
 *         - Automatic token rotation on refresh (prevents replay attacks)
 *         - Session-based token management with activity tracking
 *         - Periodic cleanup of expired tokens and sessions
 *         - Rate limiting on login attempts
 *         - **Argon2id password hashing** with 64MB memory cost and 3 iterations
 *         - Session fingerprinting and anomaly detection
 *
 *         **Token Lifecycle:**
 *         - Access tokens: 15 minutes lifespan
 *         - Refresh tokens: 90 days maximum, 14 days inactivity limit
 *         - Automatic cleanup runs every hour to remove expired data
 *         - Token rotation invalidates old refresh tokens immediately
 *
 *         **Session Management:**
 *         - Multi-device session support with individual session tracking
 *         - Bulk session invalidation (logout from all devices)
 *         - Activity-based session expiration (14 days inactivity)
 *         - Automatic session cleanup and memory management
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with username/email and password. Returns JWT tokens in httpOnly cookies.
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: access_token=jwt_token; HttpOnly; Secure; SameSite=Strict
 *       400:
 *         description: Missing username or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       428:
 *         description: Password change required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 mustChangePassword:
 *                   type: boolean
 *                 user:
 *                   type: object
 *                   properties:
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', loginRateLimit, login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token with token rotation
 *     description: |
 *       Use refresh token to get new access and refresh tokens with automatic token rotation for enhanced security.
 *
 *       **Token Rotation Security:**
 *       - Old refresh token is immediately invalidated upon use
 *       - New refresh token is issued with each request
 *       - Prevents refresh token replay attacks
 *       - Session activity is automatically tracked
 *
 *       **Session Management:**
 *       - Updates last activity timestamp for inactivity tracking
 *       - Maintains session continuity across token refreshes
 *       - Automatic cleanup of expired session data
 *     tags: [Authentication]
 *     security: []
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully with rotation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *                   example: "Tokens refreshed successfully"
 *         headers:
 *           Set-Cookie:
 *             description: New JWT tokens set as httpOnly cookies (both access and refresh tokens rotated)
 *             schema:
 *               type: string
 *               example: "access_token=new_jwt_token; HttpOnly; Secure; SameSite=Strict, refresh_token=new_refresh_token; HttpOnly; Secure; SameSite=Strict"
 *       401:
 *         description: Invalid, expired, or already used refresh token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Refresh token required"
 *                     - "Refresh token expired"
 *                     - "Refresh token already used"
 *                     - "Refresh token expired due to inactivity"
 *                     - "Session invalidated"
 *                 requiresLogin:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/refresh', refresh);

/**
 * @swagger
 * /auth/password-onboarding:
 *   post:
 *     summary: Password onboarding for authenticated users
 *     description: |
 *       Complete password onboarding for users required to change their temporary password.
 *       New password will be securely hashed using Argon2id algorithm with 64MB memory cost.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 description: New password (minimum 6 characters)
 *             required: [newPassword]
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Password change not required for this user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/password-onboarding', authMiddleware, passwordOnboarding);

// Protected routes (auth required)
/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Get user profile
 *     description: Get current authenticated user's profile information
 *     tags: [User Management]
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/profile', authMiddleware, getProfile);
/**
 * @swagger
 * /auth/profile:
 *   put:
 *     summary: Update user profile
 *     description: Update current authenticated user's profile information
 *     tags: [User Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: New username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *             required: [username, email]
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Username already taken
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/profile', authMiddleware, updateProfile);

/**
 * @swagger
 * /auth/profile/change-password:
 *   post:
 *     summary: Change password for authenticated users
 *     description: |
 *       Change password for authenticated users from profile settings.
 *       New password will be securely hashed using Argon2id algorithm with 64MB memory cost.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 description: New password (minimum 6 characters)
 *             required: [currentPassword, newPassword]
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid current password or unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/profile/change-password', authMiddleware, changeProfilePassword);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: User logout
 *     description: Logout current user and invalidate tokens
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/logout', authMiddleware, logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     summary: Logout from all sessions
 *     description: Logout current user from all active sessions and invalidate all tokens
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: All sessions logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: All sessions logged out successfully
 *                 invalidatedSessions:
 *                   type: number
 *                   description: Number of sessions that were invalidated
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/logout-all', authMiddleware, logoutAllSessions);

/**
 * @swagger
 * /auth/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieve a list of all users in the system (admin only)
 *     tags: [User Management]
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/users', authMiddleware, requireRole('admin'), getAllUsers);

/**
 * @swagger
 * /auth/users:
 *   post:
 *     summary: Create new user
 *     description: |
 *       Create a new user account (admin only).
 *       User password will be securely hashed using Argon2id algorithm with 64MB memory cost.
 *     tags: [User Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username for the new user
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address for the new user
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *                 description: Role for the new user
 *               departments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of department IDs the user has access to
 *               actions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of actions the user can perform
 *             required: [username, email]
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 defaultPassword:
 *                   type: string
 *                   description: Temporary password for the new user
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/users', authMiddleware, requireRole('admin'), createUser);

/**
 * @swagger
 * /auth/users/{username}:
 *   put:
 *     summary: Update user
 *     description: |
 *       Update an existing user's information (admin only).
 *       If password is updated, it will be securely hashed using Argon2id algorithm with 64MB memory cost.
 *     tags: [User Management]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: New username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *                 description: New role
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: New password (optional)
 *               departments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of department IDs
 *               actions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of actions
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input data or cannot change admin role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/users/:username',
  authMiddleware,
  requireRole('admin'),
  updateUser,
);

/**
 * @swagger
 * /auth/users/{username}/reset-password:
 *   post:
 *     summary: Reset user password
 *     description: |
 *       Reset a user's password to a new temporary password (admin only).
 *       New password will be securely hashed using Argon2id algorithm with 64MB memory cost.
 *     tags: [User Management]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user whose password to reset
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 newPassword:
 *                   type: string
 *                   description: New temporary password
 *                 invalidatedSessions:
 *                   type: number
 *                   description: Number of sessions invalidated
 *       400:
 *         description: Invalid username
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/users/:username/reset-password',
  authMiddleware,
  requireRole('admin'),
  resetUserPassword,
);
/**
 * @swagger
 * /auth/users/{username}/permissions:
 *   get:
 *     summary: Get user permissions
 *     description: Get permissions for a specific user (admin can view any user, users can view their own)
 *     tags: [User Permissions]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username to get permissions for
 *     responses:
 *       200:
 *         description: User permissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permissions:
 *                   type: object
 *                   properties:
 *                     departments:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of department IDs the user has access to
 *                     actions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of actions the user can perform
 *       400:
 *         description: Invalid username
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - can only view your own permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/users/:username/permissions', authMiddleware, getUserPermissions);

/**
 * @swagger
 * /auth/users/{username}/permissions:
 *   put:
 *     summary: Update user permissions
 *     description: Update permissions for a specific user (admin only)
 *     tags: [User Permissions]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username to update permissions for
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               departments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of department IDs the user should have access to
 *               actions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of actions the user should be able to perform
 *     responses:
 *       200:
 *         description: User permissions updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input or cannot modify admin permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/users/:username/permissions',
  authMiddleware,
  requireRole('admin'),
  updateUserPermissions,
);

/**
 * @swagger
 * /auth/users/{username}:
 *   delete:
 *     summary: Delete user
 *     description: Delete a user account (admin only)
 *     tags: [User Management]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User deleted successfully
 *       400:
 *         description: Cannot delete your own account or last admin user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  '/users/:username',
  authMiddleware,
  requireRole('admin'),
  deleteUser,
);

// RBAC endpoints
/**
 * @swagger
 * /auth/departments:
 *   get:
 *     summary: Get available departments
 *     description: Retrieve a list of all available departments for user assignment (admin only)
 *     tags: [RBAC]
 *     responses:
 *       200:
 *         description: Departments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 departments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Department ID
 *                       name:
 *                         type: string
 *                         description: Department name
 *                       description:
 *                         type: string
 *                         description: Department description
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/departments',
  authMiddleware,
  requireRole('admin'),
  getAvailableDepartments,
);

/**
 * @swagger
 * /auth/actions:
 *   get:
 *     summary: Get available actions
 *     description: Retrieve a list of all available actions for user permission assignment (admin only)
 *     tags: [RBAC]
 *     responses:
 *       200:
 *         description: Actions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 actions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Action ID
 *                       name:
 *                         type: string
 *                         description: Action name
 *                       description:
 *                         type: string
 *                         description: Action description
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/actions',
  authMiddleware,
  requireRole('admin'),
  getAvailableActions,
);

export default router;

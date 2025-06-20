import express from 'express';
import {
  login,
  logout,
  logoutAllSessions,
  changePassword,
  forceChangePassword,
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

// Public routes (no auth required)
router.post('/login', loginRateLimit, login);
router.post('/force-change-password', loginRateLimit, forceChangePassword);

// Protected routes (auth required)
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/logout', authMiddleware, logout);
router.post('/logout-all', authMiddleware, logoutAllSessions);
router.post('/change-password', authMiddleware, changePassword);

router.get('/users', authMiddleware, requireRole('admin'), getAllUsers);
router.post('/users', authMiddleware, requireRole('admin'), createUser);
router.put(
  '/users/:username',
  authMiddleware,
  requireRole('admin'),
  updateUser,
);
router.post(
  '/users/:username/reset-password',
  authMiddleware,
  requireRole('admin'),
  resetUserPassword,
);
router.get('/users/:username/permissions', authMiddleware, getUserPermissions);
router.put(
  '/users/:username/permissions',
  authMiddleware,
  requireRole('admin'),
  updateUserPermissions,
);
router.delete(
  '/users/:username',
  authMiddleware,
  requireRole('admin'),
  deleteUser,
);

// RBAC endpoints
router.get(
  '/departments',
  authMiddleware,
  requireRole('admin'),
  getAvailableDepartments,
);
router.get(
  '/actions',
  authMiddleware,
  requireRole('admin'),
  getAvailableActions,
);

export default router;

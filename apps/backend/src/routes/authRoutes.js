import express from 'express';
import {
  login,
  logout,
  logoutAllSessions,
  changePassword,
  forceChangePassword,
  getProfile,
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

router.post('/login', loginRateLimit, login);
router.post('/force-change-password', loginRateLimit, forceChangePassword);

router.use(authMiddleware);

router.get('/profile', getProfile);
router.post('/logout', logout);
router.post('/logout-all', logoutAllSessions);
router.post('/change-password', changePassword);

router.get('/users', requireRole('admin'), getAllUsers);
router.post('/users', requireRole('admin'), createUser);
router.put('/users/:username', requireRole('admin'), updateUser);
router.post(
  '/users/:username/reset-password',
  requireRole('admin'),
  resetUserPassword,
);
router.get('/users/:username/permissions', getUserPermissions);
router.put(
  '/users/:username/permissions',
  requireRole('admin'),
  updateUserPermissions,
);
router.delete('/users/:username', requireRole('admin'), deleteUser);

// RBAC endpoints
router.get('/departments', requireRole('admin'), getAvailableDepartments);
router.get('/actions', requireRole('admin'), getAvailableActions);

export default router;

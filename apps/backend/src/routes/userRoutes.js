import { Router } from 'express';
import {
  authMiddleware,
  requireAdmin,
} from '../middleware/betterAuthMiddleware.js';
import UserController from '../controllers/userController.js';

const router = Router();

// Apply authentication to all team routes
router.use(authMiddleware);
router.use(requireAdmin);

// Add user to organization endpoint
router.post('/add-to-organization', UserController.addToOrganization);

// Delete user with proper cleanup
router.delete('/:userId', UserController.deleteUser);

export default router;

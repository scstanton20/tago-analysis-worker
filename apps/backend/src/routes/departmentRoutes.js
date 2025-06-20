// backend/src/routes/departmentRoutes.js
import express from 'express';
import * as departmentController from '../controllers/departmentController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all department routes
router.use(authMiddleware);

// Department routes
router.get('/', departmentController.getAllDepartments);
router.post('/', departmentController.createDepartment);
router.put('/reorder', departmentController.reorderDepartments);
router.get('/:id', departmentController.getDepartment);
router.put('/:id', departmentController.updateDepartment);
router.delete('/:id', departmentController.deleteDepartment);

router.get('/:id/analyses', departmentController.getAnalysesByDepartment);

// Analysis-department routes
router.put(
  '/analyses/:name/department',
  departmentController.moveAnalysisToDepartment,
);
router.post('/analyses/bulk-move', departmentController.bulkMoveAnalyses);

export default router;

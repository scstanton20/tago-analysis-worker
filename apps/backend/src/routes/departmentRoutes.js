// backend/src/routes/departmentRoutes.js
import express from 'express';
import * as departmentController from '../controllers/departmentController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all department routes
router.use(authMiddleware);

// Department routes
/**
 * @swagger
 * /departments:
 *   get:
 *     summary: Get all departments
 *     description: Retrieve list of all departments with their configuration
 *     tags: [Department Management]
 *     responses:
 *       200:
 *         description: List of departments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Department'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', departmentController.getAllDepartments);
/**
 * @swagger
 * /departments:
 *   post:
 *     summary: Create new department
 *     description: Create a new department for organizing analyses
 *     tags: [Department Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Department name
 *               color:
 *                 type: string
 *                 description: Department color (hex format)
 *               order:
 *                 type: number
 *                 description: Display order
 *             required: [name]
 *     responses:
 *       201:
 *         description: Department created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 department:
 *                   $ref: '#/components/schemas/Department'
 *       400:
 *         description: Department name is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', departmentController.createDepartment);
/**
 * @swagger
 * /departments/reorder:
 *   put:
 *     summary: Reorder departments
 *     description: Update the display order of departments
 *     tags: [Department Management]
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
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order:
 *                       type: number
 *     responses:
 *       200:
 *         description: Departments reordered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.put('/reorder', departmentController.reorderDepartments);
/**
 * @swagger
 * /departments/{id}:
 *   get:
 *     summary: Get specific department
 *     description: Retrieve a specific department by ID
 *     tags: [Department Management]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Department ID
 *     responses:
 *       200:
 *         description: Department retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Department'
 *       404:
 *         description: Department not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

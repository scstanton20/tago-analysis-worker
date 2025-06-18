// backend/src/controllers/departmentController.js
import departmentService from '../services/departmentService.js';
import { broadcast } from '../utils/websocket.js';

const DepartmentController = {
  // Get all departments
  async getAllDepartments(_req, res) {
    try {
      const departments = await departmentService.getAllDepartments();
      res.json(departments);
    } catch (error) {
      console.error('Error getting departments:', error);
      res.status(500).json({ error: 'Failed to retrieve departments' });
    }
  },

  // Get specific department
  async getDepartment(req, res) {
    try {
      const department = await departmentService.getDepartment(req.params.id);
      if (!department) {
        return res.status(404).json({ error: 'Department not found' });
      }
      res.json(department);
    } catch (error) {
      console.error('Error getting department:', error);
      res.status(500).json({ error: 'Failed to retrieve department' });
    }
  },

  // Create new department
  async createDepartment(req, res) {
    try {
      const { name, color, order } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Department name is required' });
      }

      const department = await departmentService.createDepartment({
        name,
        color,
        order,
      });

      // Broadcast to all WebSocket clients - use correct format
      broadcast({
        type: 'departmentCreated',
        department,
      });

      res.status(201).json(department);
    } catch (error) {
      console.error('Error creating department:', error);
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create department' });
      }
    }
  },

  // Update department
  async updateDepartment(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const department = await departmentService.updateDepartment(id, updates);

      // Broadcast update - use correct format
      broadcast({
        type: 'departmentUpdated',
        department,
      });

      res.json(department);
    } catch (error) {
      console.error('Error updating department:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('system department')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update department' });
      }
    }
  },

  // Delete department
  async deleteDepartment(req, res) {
    try {
      const { id } = req.params;
      const { moveAnalysesTo } = req.body;

      const result = await departmentService.deleteDepartment(
        id,
        moveAnalysesTo,
      );

      // Broadcast deletion - use correct format
      broadcast({
        type: 'departmentDeleted',
        deleted: result.deleted,
        analysesMovedTo: result.analysesMovedTo,
        analysesMovedCount: result.analysesMovedCount,
      });

      res.json(result);
    } catch (error) {
      console.error('Error deleting department:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else if (error.message.includes('system department')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete department' });
      }
    }
  },

  // Reorder departments
  async reorderDepartments(req, res) {
    try {
      const { orderedIds } = req.body;

      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: 'orderedIds must be an array' });
      }

      const departments =
        await departmentService.reorderDepartments(orderedIds);

      // Broadcast reorder - use correct format
      broadcast({
        type: 'departmentsReordered',
        departments,
      });

      res.json(departments);
    } catch (error) {
      console.error('Error reordering departments:', error);
      res.status(500).json({ error: 'Failed to reorder departments' });
    }
  },

  // Get analyses by department
  async getAnalysesByDepartment(req, res) {
    try {
      const { id } = req.params;
      const analyses = await departmentService.getAnalysesByDepartment(id);
      res.json(analyses);
    } catch (error) {
      console.error('Error getting analyses by department:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to retrieve analyses' });
      }
    }
  },

  // Move analysis to department
  async moveAnalysisToDepartment(req, res) {
    try {
      const { name } = req.params;
      const { departmentId } = req.body;

      if (!departmentId) {
        return res.status(400).json({ error: 'departmentId is required' });
      }

      const result = await departmentService.moveAnalysisToDepartment(
        name,
        departmentId,
      );

      // Broadcast move - use correct format
      broadcast({
        type: 'analysisMovedToDepartment',
        analysis: result.analysis,
        from: result.from,
        to: result.to,
      });

      res.json(result);
    } catch (error) {
      console.error('Error moving analysis:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to move analysis' });
      }
    }
  },

  // Bulk move analyses
  async bulkMoveAnalyses(req, res) {
    try {
      const { analysisNames, targetDepartmentId } = req.body;

      if (!Array.isArray(analysisNames) || !targetDepartmentId) {
        return res.status(400).json({
          error: 'analysisNames array and targetDepartmentId are required',
        });
      }

      const results = await departmentService.bulkMoveAnalyses(
        analysisNames,
        targetDepartmentId,
      );

      // Broadcast bulk move - use correct format
      broadcast({
        type: 'analysesBulkMoved',
        results,
        targetDepartmentId,
      });

      res.json(results);
    } catch (error) {
      console.error('Error bulk moving analyses:', error);
      res.status(500).json({ error: 'Failed to move analyses' });
    }
  },
};

export const {
  getAllDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  reorderDepartments,
  getAnalysesByDepartment,
  moveAnalysisToDepartment,
  bulkMoveAnalyses,
} = DepartmentController;

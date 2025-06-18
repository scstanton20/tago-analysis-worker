// frontend/src/services/departmentService.js
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils';

export const departmentService = {
  /**
   * Create a new department
   * @param {string} name - Department name
   * @param {string} color - Department color
   * @returns {Promise<Object>} Created department data
   */
  async createDepartment(name, color) {
    try {
      console.log('Creating department:', { name, color });
      const response = await fetchWithHeaders('/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to create department:', error);
      throw new Error(`Failed to create department: ${error.message}`);
    }
  },

  /**
   * Update department details (name and/or color)
   * @param {string} id - Department ID
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.name] - New department name
   * @param {string} [updates.color] - New department color
   * @returns {Promise<Object>} Updated department data
   */
  async updateDepartment(id, updates) {
    try {
      console.log('Updating department:', { id, updates });

      if (!updates.name && !updates.color) {
        throw new Error(
          'At least one field (name or color) must be provided for update',
        );
      }

      const response = await fetchWithHeaders(`/departments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to update department:', error);
      throw new Error(`Failed to update department: ${error.message}`);
    }
  },

  /**
   * Delete a department
   * @param {string} id - Department ID
   * @param {string} moveAnalysesTo - Where to move analyses ('uncategorized' or another dept ID)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteDepartment(id, moveAnalysesTo = 'uncategorized') {
    try {
      console.log('Deleting department:', { id, moveAnalysesTo });
      const response = await fetchWithHeaders(`/departments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveAnalysesTo }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to delete department:', error);
      throw new Error(`Failed to delete department: ${error.message}`);
    }
  },

  /**
   * Reorder departments
   * @param {string[]} orderedIds - Array of department IDs in new order
   * @returns {Promise<Object>} Reorder result
   */
  async reorderDepartments(orderedIds) {
    try {
      console.log('Reordering departments:', orderedIds);
      const response = await fetchWithHeaders('/departments/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to reorder departments:', error);
      throw new Error(`Failed to reorder departments: ${error.message}`);
    }
  },

  /**
   * Move an analysis to a different department
   * @param {string} analysisId - Analysis ID
   * @param {string} departmentId - Target department ID
   * @returns {Promise<Object>} Move result
   */
  async moveAnalysisToDepartment(analysisId, departmentId) {
    try {
      console.log('Moving analysis to department:', {
        analysisId,
        departmentId,
      });
      const response = await fetchWithHeaders(
        `/departments/analyses/${analysisId}/department`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departmentId }),
        },
      );

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to move analysis:', error);
      throw new Error(`Failed to move analysis: ${error.message}`);
    }
  },

  /**
   * Get all departments
   * @returns {Promise<Object>} Departments data
   */
  async getDepartments() {
    try {
      const response = await fetchWithHeaders('/departments', {
        method: 'GET',
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to fetch departments:', error);
      throw new Error(`Failed to fetch departments: ${error.message}`);
    }
  },

  /**
   * Get analysis count for a specific department
   * @param {string} departmentId - Department ID
   * @returns {Promise<number>} Analysis count
   */
  async getDepartmentAnalysisCount(departmentId) {
    try {
      const response = await fetchWithHeaders(
        `/departments/${departmentId}/count`,
        {
          method: 'GET',
        },
      );

      const result = await handleResponse(response);
      return result.count || 0;
    } catch (error) {
      console.error('Failed to fetch department analysis count:', error);
      return 0; // Return 0 on error rather than throwing
    }
  },
};

export default departmentService;

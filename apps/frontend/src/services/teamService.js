// frontend/src/services/teamService.js
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils';

export const teamService = {
  /**
   * Create a new team
   * @param {string} name - Team name
   * @param {string} color - Team color
   * @returns {Promise<Object>} Created team data
   */
  async createTeam(name, color) {
    const response = await fetchWithHeaders('/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });

    return handleResponse(response);
  },

  /**
   * Update team details (name and/or color)
   * @param {string} id - Team ID
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.name] - New team name
   * @param {string} [updates.color] - New team color
   * @returns {Promise<Object>} Updated team data
   */
  async updateTeam(id, updates) {
    if (!updates.name && !updates.color) {
      throw new Error(
        'At least one field (name or color) must be provided for update',
      );
    }

    const response = await fetchWithHeaders(`/teams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    return handleResponse(response);
  },

  /**
   * Delete a team
   * @param {string} id - Team ID
   * @param {string} moveAnalysesTo - Where to move analyses ('uncategorized' or another team ID)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteTeam(id, moveAnalysesTo = 'uncategorized') {
    const response = await fetchWithHeaders(`/teams/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moveAnalysesTo }),
    });

    return handleResponse(response);
  },

  /**
   * Reorder teams
   * @param {string[]} orderedIds - Array of team IDs in new order
   * @returns {Promise<Object>} Reorder result
   */
  async reorderTeams(orderedIds) {
    const response = await fetchWithHeaders('/teams/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });

    return handleResponse(response);
  },

  /**
   * Move an analysis to a different team
   * @param {string} analysisId - Analysis ID
   * @param {string} teamId - Target team ID
   * @returns {Promise<Object>} Move result
   */
  async moveAnalysisToTeam(analysisId, teamId) {
    const response = await fetchWithHeaders(
      `/teams/analyses/${analysisId}/team`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      },
    );

    return handleResponse(response);
  },

  /**
   * Get all teams
   * @returns {Promise<Object>} Teams data
   */
  async getTeams() {
    const response = await fetchWithHeaders('/teams', {
      method: 'GET',
    });

    return handleResponse(response);
  },

  /**
   * Get analysis count for a specific team
   * @param {string} teamId - Team ID
   * @returns {Promise<number>} Analysis count
   */
  async getTeamAnalysisCount(teamId) {
    try {
      const response = await fetchWithHeaders(`/teams/${teamId}/count`, {
        method: 'GET',
      });

      const result = await handleResponse(response);
      return result.count || 0;
    } catch {
      return 0; // Return 0 on error rather than throwing
    }
  },

  /**
   * Create a folder in a team
   * @param {string} teamId - Team ID
   * @param {Object} data - Folder data
   * @param {string} data.name - Folder name
   * @param {string} [data.parentFolderId] - Parent folder ID (null for root)
   * @returns {Promise<Object>} Created folder
   */
  async createFolder(teamId, { name, parentFolderId }) {
    const response = await fetchWithHeaders(`/teams/${teamId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentFolderId }),
    });

    return handleResponse(response);
  },

  /**
   * Update a folder
   * @param {string} teamId - Team ID
   * @param {string} folderId - Folder ID
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.name] - New folder name
   * @param {boolean} [updates.expanded] - Expanded state
   * @returns {Promise<Object>} Updated folder
   */
  async updateFolder(teamId, folderId, updates) {
    const response = await fetchWithHeaders(
      `/teams/${teamId}/folders/${folderId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
    );

    return handleResponse(response);
  },

  /**
   * Delete a folder
   * @param {string} teamId - Team ID
   * @param {string} folderId - Folder ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFolder(teamId, folderId) {
    const response = await fetchWithHeaders(
      `/teams/${teamId}/folders/${folderId}`,
      {
        method: 'DELETE',
      },
    );

    return handleResponse(response);
  },

  /**
   * Move an item within team structure
   * @param {string} teamId - Team ID
   * @param {string} itemId - Item ID to move
   * @param {string|null} targetParentId - Target parent folder ID (null for root)
   * @param {number} targetIndex - Target index
   * @returns {Promise<Object>} Move result
   */
  async moveItem(teamId, itemId, targetParentId, targetIndex) {
    const response = await fetchWithHeaders(`/teams/${teamId}/items/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, targetParentId, targetIndex }),
    });

    return handleResponse(response);
  },
};

export default teamService;

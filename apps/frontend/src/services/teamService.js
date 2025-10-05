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
    try {
      console.log('Creating team:', { name, color });
      const response = await fetchWithHeaders('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to create team:', error);
      throw new Error(`Failed to create team: ${error.message}`);
    }
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
    try {
      console.log('Updating team:', { id, updates });

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

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to update team:', error);
      throw new Error(`Failed to update team: ${error.message}`);
    }
  },

  /**
   * Delete a team
   * @param {string} id - Team ID
   * @param {string} moveAnalysesTo - Where to move analyses ('uncategorized' or another team ID)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteTeam(id, moveAnalysesTo = 'uncategorized') {
    try {
      console.log('Deleting team:', { id, moveAnalysesTo });
      const response = await fetchWithHeaders(`/teams/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveAnalysesTo }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to delete team:', error);
      throw new Error(`Failed to delete team: ${error.message}`);
    }
  },

  /**
   * Reorder teams
   * @param {string[]} orderedIds - Array of team IDs in new order
   * @returns {Promise<Object>} Reorder result
   */
  async reorderTeams(orderedIds) {
    try {
      const response = await fetchWithHeaders('/teams/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to reorder teams:', error);
      throw new Error(`Failed to reorder teams: ${error.message}`);
    }
  },

  /**
   * Move an analysis to a different team
   * @param {string} analysisId - Analysis ID
   * @param {string} teamId - Target team ID
   * @returns {Promise<Object>} Move result
   */
  async moveAnalysisToTeam(analysisId, teamId) {
    try {
      console.log('Moving analysis to team:', {
        analysisId,
        teamId,
      });
      const response = await fetchWithHeaders(
        `/teams/analyses/${analysisId}/team`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId }),
        },
      );

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to move analysis:', error);
      throw new Error(`Failed to move analysis: ${error.message}`);
    }
  },

  /**
   * Get all teams
   * @returns {Promise<Object>} Teams data
   */
  async getTeams() {
    try {
      const response = await fetchWithHeaders('/teams', {
        method: 'GET',
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
      throw new Error(`Failed to fetch teams: ${error.message}`);
    }
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
    } catch (error) {
      console.error('Failed to fetch team analysis count:', error);
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
    try {
      console.log('Creating folder:', { teamId, name, parentFolderId });
      const response = await fetchWithHeaders(`/teams/${teamId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentFolderId }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw new Error(`Failed to create folder: ${error.message}`);
    }
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
    try {
      console.log('Updating folder:', { teamId, folderId, updates });
      const response = await fetchWithHeaders(
        `/teams/${teamId}/folders/${folderId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        },
      );

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to update folder:', error);
      throw new Error(`Failed to update folder: ${error.message}`);
    }
  },

  /**
   * Delete a folder
   * @param {string} teamId - Team ID
   * @param {string} folderId - Folder ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFolder(teamId, folderId) {
    try {
      console.log('Deleting folder:', { teamId, folderId });
      const response = await fetchWithHeaders(
        `/teams/${teamId}/folders/${folderId}`,
        {
          method: 'DELETE',
        },
      );

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw new Error(`Failed to delete folder: ${error.message}`);
    }
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
    try {
      console.log('Moving item:', {
        teamId,
        itemId,
        targetParentId,
        targetIndex,
      });
      const response = await fetchWithHeaders(`/teams/${teamId}/items/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, targetParentId, targetIndex }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to move item:', error);
      throw new Error(`Failed to move item: ${error.message}`);
    }
  },
};

export default teamService;

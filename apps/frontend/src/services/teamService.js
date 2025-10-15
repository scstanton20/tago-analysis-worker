// frontend/src/services/teamService.js
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('teamService');

export const teamService = {
  /**
   * Create a new team
   * @param {string} name - Team name
   * @param {string} color - Team color
   * @returns {Promise<Object>} Created team data
   */
  async createTeam(name, color) {
    logger.debug('Creating new team', { name, color });
    try {
      const response = await fetchWithHeaders('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const result = await handleResponse(response);
      logger.info('Team created successfully', { name, teamId: result?.id });
      return result;
    } catch (error) {
      logger.error('Failed to create team', { error, name });
      throw error;
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
    logger.debug('Updating team', { id, updates });

    if (!updates.name && !updates.color) {
      logger.error('No fields provided for team update', { id });
      throw new Error(
        'At least one field (name or color) must be provided for update',
      );
    }

    try {
      const response = await fetchWithHeaders(`/teams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const result = await handleResponse(response);
      logger.info('Team updated successfully', { id, updates });
      return result;
    } catch (error) {
      logger.error('Failed to update team', { error, id, updates });
      throw error;
    }
  },

  /**
   * Delete a team
   * @param {string} id - Team ID
   * @param {string} moveAnalysesTo - Where to move analyses ('uncategorized' or another team ID)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteTeam(id, moveAnalysesTo = 'uncategorized') {
    logger.debug('Deleting team', { id, moveAnalysesTo });
    try {
      const response = await fetchWithHeaders(`/teams/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveAnalysesTo }),
      });
      const result = await handleResponse(response);
      logger.info('Team deleted successfully', { id, moveAnalysesTo });
      return result;
    } catch (error) {
      logger.error('Failed to delete team', { error, id, moveAnalysesTo });
      throw error;
    }
  },

  /**
   * Reorder teams
   * @param {string[]} orderedIds - Array of team IDs in new order
   * @returns {Promise<Object>} Reorder result
   */
  async reorderTeams(orderedIds) {
    logger.debug('Reordering teams', { count: orderedIds?.length });
    try {
      const response = await fetchWithHeaders('/teams/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
      const result = await handleResponse(response);
      logger.info('Teams reordered successfully', {
        count: orderedIds?.length,
      });
      return result;
    } catch (error) {
      logger.error('Failed to reorder teams', { error });
      throw error;
    }
  },

  /**
   * Move an analysis to a different team
   * @param {string} analysisId - Analysis ID
   * @param {string} teamId - Target team ID
   * @returns {Promise<Object>} Move result
   */
  async moveAnalysisToTeam(analysisId, teamId) {
    logger.debug('Moving analysis to team', { analysisId, teamId });
    try {
      const response = await fetchWithHeaders(
        `/teams/analyses/${analysisId}/team`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId }),
        },
      );
      const result = await handleResponse(response);
      logger.info('Analysis moved to team successfully', {
        analysisId,
        teamId,
      });
      return result;
    } catch (error) {
      logger.error('Failed to move analysis to team', {
        error,
        analysisId,
        teamId,
      });
      throw error;
    }
  },

  /**
   * Get all teams
   * @returns {Promise<Object>} Teams data
   */
  async getTeams() {
    logger.debug('Fetching teams list');
    try {
      const response = await fetchWithHeaders('/teams', {
        method: 'GET',
      });
      const result = await handleResponse(response);
      logger.info('Teams list fetched successfully', {
        count: result?.teams?.length,
      });
      return result;
    } catch (error) {
      logger.error('Failed to fetch teams list', { error });
      throw error;
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
    logger.debug('Creating folder', { teamId, name, parentFolderId });
    try {
      const response = await fetchWithHeaders(`/teams/${teamId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentFolderId }),
      });
      const result = await handleResponse(response);
      logger.info('Folder created successfully', {
        teamId,
        name,
        folderId: result?.id,
      });
      return result;
    } catch (error) {
      logger.error('Failed to create folder', { error, teamId, name });
      throw error;
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
    logger.debug('Updating folder', { teamId, folderId, updates });
    try {
      const response = await fetchWithHeaders(
        `/teams/${teamId}/folders/${folderId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        },
      );
      const result = await handleResponse(response);
      logger.info('Folder updated successfully', { teamId, folderId });
      return result;
    } catch (error) {
      logger.error('Failed to update folder', { error, teamId, folderId });
      throw error;
    }
  },

  /**
   * Delete a folder
   * @param {string} teamId - Team ID
   * @param {string} folderId - Folder ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFolder(teamId, folderId) {
    logger.debug('Deleting folder', { teamId, folderId });
    try {
      const response = await fetchWithHeaders(
        `/teams/${teamId}/folders/${folderId}`,
        {
          method: 'DELETE',
        },
      );
      const result = await handleResponse(response);
      logger.info('Folder deleted successfully', { teamId, folderId });
      return result;
    } catch (error) {
      logger.error('Failed to delete folder', { error, teamId, folderId });
      throw error;
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
    logger.debug('Moving item', {
      teamId,
      itemId,
      targetParentId,
      targetIndex,
    });
    try {
      const response = await fetchWithHeaders(`/teams/${teamId}/items/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          newParentId: targetParentId,
          newIndex: targetIndex,
        }),
      });
      const result = await handleResponse(response);
      logger.info('Item moved successfully', {
        teamId,
        itemId,
        targetParentId,
      });
      return result;
    } catch (error) {
      logger.error('Failed to move item', {
        error,
        teamId,
        itemId,
        targetParentId,
      });
      throw error;
    }
  },
};

export default teamService;

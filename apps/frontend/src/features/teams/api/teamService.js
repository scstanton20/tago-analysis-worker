import {
  fetchWithHeaders,
  handleResponse,
  withErrorHandling,
} from '@/utils/apiUtils';
import {
  createServiceLogger,
  createPostMethod,
  createPutMethod,
  createDeleteMethod,
  createGetMethod,
} from '@/utils/serviceFactory';

const logger = createServiceLogger('teamService');

export const teamService = {
  /**
   * Create a new team
   * @param {string} name - Team name
   * @param {string} color - Team color
   * @returns {Promise<Object>} Created team data
   */
  createTeam: createPostMethod(
    logger,
    'create team',
    '/teams',
    (name, color) => ({ name, color }),
    {
      debugMessage: 'Creating new team',
      successMessage: 'Team created successfully',
      getDebugParams: (name, color) => ({ name, color }),
      getSuccessParams: (result, name) => ({ name, teamId: result?.id }),
    },
  ),

  /**
   * Update team details (name and/or color)
   * @param {string} id - Team ID
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.name] - New team name
   * @param {string} [updates.color] - New team color
   * @returns {Promise<Object>} Updated team data
   */
  updateTeam: withErrorHandling(async (id, updates) => {
    logger.debug('Updating team', { id, updates });

    if (!updates.name && !updates.color) {
      logger.error('No fields provided for team update', { id });
      throw new Error(
        'At least one field (name or color) must be provided for update',
      );
    }

    const response = await fetchWithHeaders(`/teams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const result = await handleResponse(response);
    logger.info('Team updated successfully', { id, updates });
    return result;
  }, 'update team'),

  /**
   * Delete a team
   * @param {string} id - Team ID
   * @param {string} moveAnalysesTo - Where to move analyses ('uncategorized' or another team ID)
   * @returns {Promise<Object>} Deletion result
   */
  deleteTeam: createDeleteMethod(
    logger,
    'delete team',
    (id) => `/teams/${id}`,
    (id, moveAnalysesTo = 'uncategorized') => ({ moveAnalysesTo }),
    {
      debugMessage: 'Deleting team',
      successMessage: 'Team deleted successfully',
      getDebugParams: (id, moveAnalysesTo) => ({ id, moveAnalysesTo }),
      getSuccessParams: (_result, id, moveAnalysesTo) => ({
        id,
        moveAnalysesTo,
      }),
    },
  ),

  /**
   * Reorder teams
   * @param {string[]} orderedIds - Array of team IDs in new order
   * @returns {Promise<Object>} Reorder result
   */
  reorderTeams: createPutMethod(
    logger,
    'reorder teams',
    '/teams/reorder',
    (orderedIds) => ({ orderedIds }),
    {
      debugMessage: 'Reordering teams',
      successMessage: 'Teams reordered successfully',
      getDebugParams: (orderedIds) => ({ count: orderedIds?.length }),
      getSuccessParams: (_result, orderedIds) => ({
        count: orderedIds?.length,
      }),
    },
  ),

  /**
   * Move an analysis to a different team
   * @param {string} analysisId - Analysis ID
   * @param {string} teamId - Target team ID
   * @returns {Promise<Object>} Move result
   */
  moveAnalysisToTeam: createPutMethod(
    logger,
    'move analysis to team',
    (analysisId) => `/teams/analyses/${analysisId}/team`,
    (analysisId, teamId) => ({ teamId }),
    {
      debugMessage: 'Moving analysis to team',
      successMessage: 'Analysis moved to team successfully',
      getDebugParams: (analysisId, teamId) => ({ analysisId, teamId }),
      getSuccessParams: (_result, analysisId, teamId) => ({
        analysisId,
        teamId,
      }),
    },
  ),

  /**
   * Get all teams
   * @returns {Promise<Object>} Teams data
   */
  getTeams: createGetMethod(logger, 'fetch teams list', '/teams', {
    debugMessage: 'Fetching teams list',
    successMessage: 'Teams list fetched successfully',
    getSuccessParams: (result) => ({ count: result?.teams?.length }),
  }),

  /**
   * Create a folder in a team
   * @param {string} teamId - Team ID
   * @param {Object} data - Folder data
   * @param {string} data.name - Folder name
   * @param {string} [data.parentFolderId] - Parent folder ID (null for root)
   * @returns {Promise<Object>} Created folder
   */
  createFolder: createPostMethod(
    logger,
    'create folder',
    (teamId) => `/teams/${teamId}/folders`,
    (teamId, { name, parentFolderId }) => ({ name, parentFolderId }),
    {
      debugMessage: 'Creating folder',
      successMessage: 'Folder created successfully',
      getDebugParams: (teamId, { name, parentFolderId }) => ({
        teamId,
        name,
        parentFolderId,
      }),
      getSuccessParams: (result, teamId, { name }) => ({
        teamId,
        name,
        folderId: result?.id,
      }),
    },
  ),

  /**
   * Update a folder
   * @param {string} teamId - Team ID
   * @param {string} folderId - Folder ID
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.name] - New folder name
   * @param {boolean} [updates.expanded] - Expanded state
   * @returns {Promise<Object>} Updated folder
   */
  updateFolder: createPutMethod(
    logger,
    'update folder',
    (teamId, folderId) => `/teams/${teamId}/folders/${folderId}`,
    (teamId, folderId, updates) => updates,
    {
      debugMessage: 'Updating folder',
      successMessage: 'Folder updated successfully',
      getDebugParams: (teamId, folderId, updates) => ({
        teamId,
        folderId,
        updates,
      }),
      getSuccessParams: (_result, teamId, folderId) => ({ teamId, folderId }),
    },
  ),

  /**
   * Delete a folder
   * @param {string} teamId - Team ID
   * @param {string} folderId - Folder ID
   * @returns {Promise<Object>} Deletion result
   */
  deleteFolder: createDeleteMethod(
    logger,
    'delete folder',
    (teamId, folderId) => `/teams/${teamId}/folders/${folderId}`,
    null,
    {
      debugMessage: 'Deleting folder',
      successMessage: 'Folder deleted successfully',
      getDebugParams: (teamId, folderId) => ({ teamId, folderId }),
      getSuccessParams: (_result, teamId, folderId) => ({ teamId, folderId }),
    },
  ),

  /**
   * Move an item within team structure
   * @param {string} teamId - Team ID
   * @param {string} itemId - Item ID to move
   * @param {string|null} targetParentId - Target parent folder ID (null for root)
   * @param {number} targetIndex - Target index
   * @returns {Promise<Object>} Move result
   */
  moveItem: createPostMethod(
    logger,
    'move item',
    (teamId) => `/teams/${teamId}/items/move`,
    (teamId, itemId, targetParentId, targetIndex) => ({
      itemId,
      newParentId: targetParentId,
      newIndex: targetIndex,
    }),
    {
      debugMessage: 'Moving item',
      successMessage: 'Item moved successfully',
      getDebugParams: (teamId, itemId, targetParentId, targetIndex) => ({
        teamId,
        itemId,
        targetParentId,
        targetIndex,
      }),
      getSuccessParams: (_result, teamId, itemId, targetParentId) => ({
        teamId,
        itemId,
        targetParentId,
      }),
    },
  ),
};

export default teamService;

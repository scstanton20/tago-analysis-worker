// backend/src/utils/responseHelpers.js

/**
 * Standardized error response handler for all controllers.
 *
 * This function provides consistent error handling across the application by:
 * - Automatically logging errors to console
 * - Determining appropriate HTTP status codes based on error type
 * - Returning standardized JSON error responses
 *
 * @param {Response} res - Express response object
 * @param {Error} error - Error object thrown by service or controller
 * @param {string} operation - Operation being performed in gerund form (e.g., 'creating team', 'updating analysis')
 * @param {Object} options - Optional configuration
 * @param {boolean} options.logError - Whether to log the error to console (default: true)
 *
 * @returns {Response} JSON response with appropriate status code
 *
 * @example
 * // In a controller:
 * try {
 *   const team = await teamService.createTeam(data);
 *   res.status(201).json(team);
 * } catch (error) {
 *   handleError(res, error, 'creating team');
 * }
 *
 * @example
 * // Suppress logging:
 * catch (error) {
 *   handleError(res, error, 'fetching cached data', { logError: false });
 * }
 *
 * Status Code Mapping:
 * - 400: Path traversal, invalid filename, cannot move
 * - 404: Resource not found
 * - 409: Resource already exists
 * - 500: All other errors (default)
 */
export function handleError(res, error, operation, options = {}) {
  const { logError = true } = options;

  if (logError) {
    console.error(`Error ${operation}:`, error);
  }

  // Handle specific error types with appropriate status codes
  if (
    error.message.includes('Path traversal') ||
    error.message.includes('Invalid filename')
  ) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  if (error.message.includes('not found')) {
    return res.status(404).json({ error: error.message });
  }

  if (error.message.includes('already exists')) {
    return res.status(409).json({ error: error.message });
  }

  if (error.message.includes('Cannot move')) {
    return res.status(400).json({ error: error.message });
  }

  // Default 500 error
  const errorMessage = operation
    ? `Failed to ${operation}`
    : error.message || 'An error occurred';
  return res.status(500).json({ error: errorMessage });
}

/**
 * Async controller wrapper with consistent error handling.
 *
 * This higher-order function wraps controller methods to automatically
 * catch errors and handle them using the standardized handleError function.
 * Useful for route definitions to avoid repetitive try-catch blocks.
 *
 * @param {Function} controllerFn - Controller function to wrap (async)
 * @param {string} operation - Operation name in gerund form for error messages
 * @returns {Function} Wrapped controller function with error handling
 *
 * @example
 * // In routes file:
 * router.get(
 *   '/teams',
 *   asyncHandler(TeamController.getAllTeams, 'retrieving teams')
 * );
 *
 * @example
 * // Equivalent to writing:
 * router.get('/teams', async (req, res) => {
 *   try {
 *     await TeamController.getAllTeams(req, res);
 *   } catch (error) {
 *     handleError(res, error, 'retrieving teams');
 *   }
 * });
 */
export function asyncHandler(controllerFn, operation) {
  return async (req, res, next) => {
    try {
      await controllerFn(req, res, next);
    } catch (error) {
      handleError(res, error, operation);
    }
  };
}

/**
 * Broadcast team structure update via Server-Sent Events (SSE).
 *
 * This helper function notifies all users with access to a specific team
 * when the team's folder/analysis structure has changed. Used after
 * operations like creating folders, moving analyses, or reordering items.
 *
 * @param {Object} sseManager - SSE manager instance from utils/sse.js
 * @param {string} teamId - Team ID to broadcast updates for
 *
 * @example
 * // After creating a folder:
 * const folder = await teamService.createFolder(teamId, parentId, name);
 * await broadcastTeamStructureUpdate(sseManager, teamId);
 *
 * @example
 * // After moving an item:
 * await teamService.moveItem(teamId, itemId, targetParentId, targetIndex);
 * await broadcastTeamStructureUpdate(sseManager, teamId);
 */
export async function broadcastTeamStructureUpdate(sseManager, teamId) {
  const { analysisService } = await import('../services/analysisService.js');
  const config = await analysisService.getConfig();
  sseManager.broadcastToTeamUsers(teamId, {
    type: 'teamStructureUpdated',
    teamId,
    items: config.teamStructure[teamId]?.items || [],
  });
}

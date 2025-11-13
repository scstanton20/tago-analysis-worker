import { createChildLogger } from './logging/logger.js';

const defaultLogger = createChildLogger('response-helpers');

/** Standardized error response handler with logging and HTTP status code detection */
export function handleError(res, error, operation, options = {}) {
  const { logError = true, logger = defaultLogger } = options;

  if (logError) {
    logger.error({ err: error, operation }, `Error ${operation}`);
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

/** Async controller wrapper with consistent error handling */
export function asyncHandler(controllerFn, operation) {
  return async (req, res, next) => {
    try {
      await controllerFn(req, res, next);
    } catch (error) {
      const logger = req.logger || defaultLogger;
      handleError(res, error, operation, { logger });
    }
  };
}

/** Broadcast team structure update via SSE to users with team access */
export async function broadcastTeamStructureUpdate(sseManager, teamId) {
  const logger = createChildLogger('broadcast');
  logger.debug({ teamId }, 'Broadcasting team structure update');

  try {
    const { analysisService } = await import('../services/analysisService.js');
    const config = await analysisService.getConfig();
    sseManager.broadcastToTeamUsers(teamId, {
      type: 'teamStructureUpdated',
      teamId,
      items: config.teamStructure[teamId]?.items || [],
    });
    logger.debug({ teamId }, 'Team structure update broadcast complete');
  } catch (error) {
    logger.error(
      { err: error, teamId },
      'Failed to broadcast team structure update',
    );
    throw error;
  }
}

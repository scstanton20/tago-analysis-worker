import { createChildLogger } from './logging/logger.js';

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

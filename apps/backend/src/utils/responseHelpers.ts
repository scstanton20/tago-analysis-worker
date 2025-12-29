import { createChildLogger } from './logging/logger.ts';

// SSE Manager type - will be properly typed when SSE module is migrated
interface SSEManager {
  broadcastToTeamUsers(
    teamId: string,
    message: { type: string; teamId: string; items: unknown[] },
  ): void;
}

/** Broadcast team structure update via SSE to users with team access */
export async function broadcastTeamStructureUpdate(
  sseManager: SSEManager,
  teamId: string,
): Promise<void> {
  const logger = createChildLogger('broadcast');
  logger.debug({ teamId }, 'Broadcasting team structure update');

  try {
    const { analysisService } = await import('../services/analysisService.ts');
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

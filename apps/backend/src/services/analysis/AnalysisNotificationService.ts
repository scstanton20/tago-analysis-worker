/**
 * Analysis Notification Service
 *
 * Handles SSE broadcasting for analysis-related events.
 * Uses lazy loading to avoid circular dependencies.
 *
 * @module analysis/AnalysisNotificationService
 */
import { createChildLogger } from '../../utils/logging/logger.ts';
import { getSseManager, getAnalysisService } from '../../utils/lazyLoader.ts';

const logger = createChildLogger('analysis-notifications');

/** Generic analysis data for broadcasts */
type AnalysisData = Record<string, unknown>;

/**
 * Broadcast that an analysis was created
 */
export async function broadcastAnalysisCreated(
  analysisId: string,
  analysisName: string,
  teamId: string,
  analysisData?: AnalysisData,
): Promise<void> {
  try {
    const sseManager = await getSseManager();
    sseManager.broadcastAnalysisUpdate(
      analysisId,
      {
        type: 'analysisCreated',
        data: {
          analysisId,
          analysisName,
          teamId,
          analysisData,
        },
      },
      teamId,
    );
    logger.debug({ analysisId, teamId }, 'Broadcast analysis created');
  } catch (error) {
    logger.error(
      { err: error, analysisId },
      'Failed to broadcast analysis created',
    );
  }
}

/**
 * Broadcast that an analysis was deleted
 */
export async function broadcastAnalysisDeleted(
  analysisId: string,
  analysisName: string,
  teamId: string,
): Promise<void> {
  try {
    const sseManager = await getSseManager();
    sseManager.broadcastAnalysisUpdate(
      analysisId,
      {
        type: 'analysisDeleted',
        data: {
          analysisId,
          analysisName,
          teamId,
        },
      },
      teamId,
    );
    logger.debug({ analysisId, teamId }, 'Broadcast analysis deleted');
  } catch (error) {
    logger.error(
      { err: error, analysisId },
      'Failed to broadcast analysis deleted',
    );
  }
}

/**
 * Broadcast that an analysis was renamed
 */
export async function broadcastAnalysisRenamed(
  analysisId: string,
  data: {
    oldName: string;
    newName: string;
    status?: string;
    restarted?: boolean;
    [key: string]: unknown;
  },
): Promise<void> {
  try {
    const sseManager = await getSseManager();
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisRenamed',
      data: {
        analysisId,
        ...data,
      },
    });
    logger.debug(
      { analysisId, oldName: data.oldName, newName: data.newName },
      'Broadcast analysis renamed',
    );
  } catch (error) {
    logger.error(
      { err: error, analysisId },
      'Failed to broadcast analysis renamed',
    );
  }
}

/**
 * Broadcast that an analysis was updated (content change)
 */
export async function broadcastAnalysisUpdated(
  analysisId: string,
  data: {
    analysisName?: string;
    status?: string;
    restarted?: boolean;
    [key: string]: unknown;
  },
): Promise<void> {
  try {
    const sseManager = await getSseManager();
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisUpdated',
      data: {
        analysisId,
        ...data,
      },
    });
    logger.debug({ analysisId }, 'Broadcast analysis updated');
  } catch (error) {
    logger.error(
      { err: error, analysisId },
      'Failed to broadcast analysis updated',
    );
  }
}

/**
 * Broadcast that an analysis was rolled back to a previous version
 */
export async function broadcastAnalysisRolledBack(
  analysisId: string,
  data: {
    version: number;
    analysisName?: string;
    status?: string;
    restarted?: boolean;
    [key: string]: unknown;
  },
): Promise<void> {
  try {
    const sseManager = await getSseManager();
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisRolledBack',
      data: {
        analysisId,
        ...data,
      },
    });
    logger.debug(
      { analysisId, version: data.version },
      'Broadcast analysis rolled back',
    );
  } catch (error) {
    logger.error(
      { err: error, analysisId },
      'Failed to broadcast analysis rolled back',
    );
  }
}

/**
 * Broadcast that an analysis environment was updated
 */
export async function broadcastAnalysisEnvironmentUpdated(
  analysisId: string,
  data?: {
    analysisName?: string;
    status?: string;
    restarted?: boolean;
    [key: string]: unknown;
  },
): Promise<void> {
  try {
    const sseManager = await getSseManager();
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisEnvironmentUpdated',
      data: {
        analysisId,
        ...data,
      },
    });
    logger.debug({ analysisId }, 'Broadcast analysis environment updated');
  } catch (error) {
    logger.error(
      { err: error, analysisId },
      'Failed to broadcast environment updated',
    );
  }
}

/**
 * Broadcast that analysis notes were updated
 */
export async function broadcastAnalysisNotesUpdated(
  analysisId: string,
  data?: {
    analysisName?: string;
    lineCount?: number;
    lastModified?: string;
    [key: string]: unknown;
  },
): Promise<void> {
  try {
    const sseManager = await getSseManager();
    sseManager.broadcastAnalysisUpdate(analysisId, {
      type: 'analysisNotesUpdated',
      data: {
        analysisId,
        ...data,
      },
    });
    logger.debug({ analysisId }, 'Broadcast analysis notes updated');
  } catch (error) {
    logger.error(
      { err: error, analysisId },
      'Failed to broadcast notes updated',
    );
  }
}

/**
 * Broadcast team structure update via SSE to users with team access
 */
export async function broadcastTeamStructureUpdate(
  teamId: string,
): Promise<void> {
  try {
    const sseManager = await getSseManager();
    const analysisService = await getAnalysisService();
    const config = await analysisService.getConfig();
    sseManager.broadcastToTeamUsers(teamId, {
      type: 'teamStructureUpdated',
      teamId,
      items: config.teamStructure[teamId]?.items || [],
    });
    logger.debug({ teamId }, 'Broadcast team structure update');
  } catch (error) {
    logger.error(
      { err: error, teamId },
      'Failed to broadcast team structure update',
    );
  }
}

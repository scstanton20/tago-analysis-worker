/**
 * Initialization and status update service
 * Handles sending initial data and status updates to clients
 */

import { createChildLogger } from '../logging/logger.ts';
import { SSE_API_VERSION, type Session } from './utils.ts';
import { getPackageVersion } from '../packageVersion.ts';
import { getServerTime } from '../serverTime.ts';
import {
  getAnalysisService,
  getTeamService,
  getTeamPermissionHelpers,
  getAuthDatabase,
  getMs,
} from '../lazyLoader.ts';
import type { SSEManager } from './SSEManager.ts';
import type {
  Analysis,
  Team,
  TeamStructure,
} from '@tago-analysis-worker/types';

const logger = createChildLogger('sse:init');

/** User query result (database row) */
interface UserRow {
  id: string;
  role: string;
  email: string;
  name: string;
}

/** Config data (internal format) */
interface ConfigData {
  teamStructure?: Record<string, TeamStructure>;
}

export class InitDataService {
  private manager: SSEManager;

  constructor(sseManager: SSEManager) {
    this.manager = sseManager;
  }

  /**
   * Send initial data to new client
   * Extracted from sse.ts lines 682-780
   */
  async sendInitialData(client: Session): Promise<void> {
    try {
      const analysisService = await getAnalysisService();
      const teamService = await getTeamService();
      const { getUserTeamIds } = await getTeamPermissionHelpers();

      // IMPORTANT: Always fetch fresh user data from database
      // Don't rely on cached session.state.user which may be stale after permission changes
      const { executeQuery } = await getAuthDatabase();
      const freshUser = executeQuery<UserRow>(
        'SELECT id, role, email, name FROM user WHERE id = ?',
        [client.state.user.id],
        'fetching fresh user data for SSE init',
      );

      if (!freshUser) {
        logger.error(
          { userId: client.state.user.id },
          'User not found when sending init data',
        );
        return;
      }

      const [allAnalyses, allTeamsArray] = await Promise.all([
        analysisService.getAllAnalyses() as unknown as Promise<
          Record<string, Analysis>
        >,
        teamService.getAllTeams() as unknown as Promise<Team[]>,
      ]);

      // Convert teams array to object keyed by ID for frontend compatibility
      const allTeams: Record<string, Team> = {};
      allTeamsArray.forEach((team) => {
        allTeams[team.id] = team;
      });

      let analyses: Record<string, Analysis> = allAnalyses;
      let teams: Record<string, Team> = allTeams;
      let allowedTeamIds: string[] = [];

      // Filter data for non-admin users
      if (freshUser.role !== 'admin') {
        // Get user's allowed team IDs for view_analyses permission
        allowedTeamIds = getUserTeamIds(freshUser.id, 'view_analyses');

        // Filter analyses to only include those from accessible teams
        const filteredAnalyses: Record<string, Analysis> = {};
        for (const [analysisId, analysis] of Object.entries(allAnalyses)) {
          if (allowedTeamIds.includes(analysis.teamId || 'uncategorized')) {
            filteredAnalyses[analysisId] = analysis;
          }
        }

        // Filter teams to only those user has access to
        const filteredTeams: Record<string, Team> = {};
        for (const [teamId, team] of Object.entries(allTeams)) {
          if (allowedTeamIds.includes(teamId)) {
            filteredTeams[teamId] = team;
          }
        }

        analyses = filteredAnalyses;
        teams = filteredTeams;
      } else {
        // Admin users have access to all teams
        allowedTeamIds = Object.keys(allTeams);
      }

      // Get team structure from config and filter based on permissions
      const config =
        (await analysisService.getConfig()) as unknown as ConfigData;
      const allTeamStructure = config.teamStructure || {};

      // Filter teamStructure to only include structures for accessible teams
      const teamStructure: Record<string, TeamStructure> = {};
      for (const [teamId, structure] of Object.entries(allTeamStructure)) {
        if (allowedTeamIds.includes(teamId)) {
          teamStructure[teamId] = structure;
        }
      }

      const initData = {
        type: 'init',
        sessionId: client.id,
        analyses,
        teams,
        teamStructure,
        version: SSE_API_VERSION,
      };

      await client.push(initData);

      // Send initial status
      await this.sendStatusUpdate(client);
    } catch (error) {
      logger.error({ error }, 'Error sending initial SSE data');
    }
  }

  /**
   * Refresh init data for user
   * Extracted from sse.ts lines 804-836
   */
  async refreshInitDataForUser(userId: string): Promise<number> {
    const userSessions =
      this.manager.sessionManager.getSessionsByUserId(userId);
    if (userSessions.length === 0) {
      logger.debug({ userId }, 'No SSE sessions found for user to refresh');
      return 0;
    }

    logger.info(
      { userId, sessionCount: userSessions.length },
      'Refreshing init data for user',
    );
    let refreshedCount = 0;

    for (const session of userSessions) {
      try {
        if (session.isConnected) {
          await this.sendInitialData(session);
          refreshedCount++;
        }
      } catch (error) {
        logger.error(
          { userId, sessionId: session.id, error },
          'Error refreshing init data for user',
        );
      }
    }

    logger.info(
      { userId, refreshedCount },
      'Init data refresh completed for user',
    );
    return refreshedCount;
  }

  /**
   * Send status update to client
   * Extracted from sse.ts lines 865-943
   */
  async sendStatusUpdate(client: Session): Promise<void> {
    try {
      const analysisService = await getAnalysisService();
      const ms = await getMs();

      // Get container state
      const containerState = this.manager.getContainerState();

      let runningAnalyses: unknown[] = [];
      try {
        // Access private analyses property for internal status monitoring
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const analyses = (analysisService as any)?.analyses as
          | Map<string, { status?: string }>
          | undefined;
        if (analyses && typeof analyses.values === 'function') {
          runningAnalyses = Array.from(analyses.values()).filter(
            (analysis) => analysis && analysis.status === 'running',
          );
        }
      } catch (filterError) {
        logger.error({ error: filterError }, 'Error filtering analyses');
      }

      // Get Tago SDK version from centralized utility
      const tagoVersion = getPackageVersion('@tago-io/sdk');

      const status = {
        type: 'statusUpdate',
        container_health: {
          status:
            containerState.status === 'ready' ? 'healthy' : 'initializing',
          message: containerState.message,
          uptime: {
            seconds: Math.floor(
              (Date.now() - containerState.startTime.getTime()) / 1000,
            ),
            formatted: ms(Date.now() - containerState.startTime.getTime(), {
              long: true,
            }),
          },
        },
        tagoConnection: {
          sdkVersion: tagoVersion,
          runningAnalyses: runningAnalyses.length,
        },
        serverTime: getServerTime(),
      };

      // Use better-sse's push method (no event type for generic onmessage)
      await client.push(status);
    } catch (error) {
      logger.error({ error }, 'Error sending SSE status update');
    }
  }
}

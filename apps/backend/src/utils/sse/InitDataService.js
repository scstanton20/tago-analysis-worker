/**
 * Initialization and status update service
 * Handles sending initial data and status updates to clients
 */

import { createChildLogger } from '../logging/logger.js';
import { SSE_API_VERSION } from './utils.js';

const logger = createChildLogger('sse:init');

export class InitDataService {
  /**
   * @param {SSEManager} sseManager - Parent SSE manager
   */
  constructor(sseManager) {
    this.manager = sseManager;
  }

  /**
   * Send initial data to new client
   * Extracted from sse.js lines 682-780
   * @param {Session} client - Client session
   * @returns {Promise<void>}
   */
  async sendInitialData(client) {
    try {
      const { analysisService } = await import(
        '../../services/analysisService.js'
      );
      const { teamService } = await import('../../services/teamService.js');
      const { getUserTeamIds } = await import(
        '../../middleware/betterAuthMiddleware.js'
      );

      // IMPORTANT: Always fetch fresh user data from database
      // Don't rely on cached session.state.user which may be stale after permission changes
      const { executeQuery } = await import('../../utils/authDatabase.js');
      const freshUser = executeQuery(
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
        analysisService.getAllAnalyses(),
        teamService.getAllTeams(),
      ]);

      // Convert teams array to object keyed by ID for frontend compatibility
      const allTeams = {};
      allTeamsArray.forEach((team) => {
        allTeams[team.id] = team;
      });

      let analyses = allAnalyses;
      let teams = allTeams;
      let allowedTeamIds = [];

      // Filter data for non-admin users
      if (freshUser.role !== 'admin') {
        // Get user's allowed team IDs for view_analyses permission
        allowedTeamIds = getUserTeamIds(freshUser.id, 'view_analyses');

        // Filter analyses to only include those from accessible teams
        const filteredAnalyses = {};
        for (const [analysisId, analysis] of Object.entries(allAnalyses)) {
          if (allowedTeamIds.includes(analysis.teamId || 'uncategorized')) {
            filteredAnalyses[analysisId] = analysis;
          }
        }

        // Filter teams to only those user has access to
        const filteredTeams = {};
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
      const config = await analysisService.getConfig();
      const allTeamStructure = config.teamStructure || {};

      // Filter teamStructure to only include structures for accessible teams
      const teamStructure = {};
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
   * Extracted from sse.js lines 804-836
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count refreshed
   */
  async refreshInitDataForUser(userId) {
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
   * Extracted from sse.js lines 865-943
   * @param {Session} client - Client session
   * @returns {Promise<void>}
   */
  async sendStatusUpdate(client) {
    try {
      const { analysisService } = await import(
        '../../services/analysisService.js'
      );
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const ms = (await import('ms')).default;

      // Get container state
      const containerState = this.manager.getContainerState();

      let runningAnalyses = [];
      try {
        const analyses = analysisService?.analyses;
        if (analyses && typeof analyses.values === 'function') {
          runningAnalyses = Array.from(analyses.values()).filter(
            (analysis) => analysis && analysis.status === 'running',
          );
        }
      } catch (filterError) {
        logger.error({ error: filterError }, 'Error filtering analyses');
      }

      let tagoVersion;
      try {
        const fs = await import('fs');
        const path = await import('path');

        // Find the SDK package.json by resolving the SDK path
        const sdkPath = require.resolve('@tago-io/sdk');
        let currentDir = path.dirname(sdkPath);

        // Walk up directories to find the correct package.json
        while (currentDir !== path.dirname(currentDir)) {
          const potentialPath = path.join(currentDir, 'package.json');
          if (fs.existsSync(potentialPath)) {
            const pkg = JSON.parse(fs.readFileSync(potentialPath, 'utf8'));
            if (pkg.name === '@tago-io/sdk') {
              tagoVersion = pkg.version;
              break;
            }
          }
          currentDir = path.dirname(currentDir);
        }

        if (!tagoVersion) {
          tagoVersion = 'unknown';
        }
      } catch (error) {
        logger.error({ error }, 'Error reading tago SDK version');
        tagoVersion = 'unknown';
      }

      const status = {
        type: 'statusUpdate',
        container_health: {
          status:
            containerState.status === 'ready' ? 'healthy' : 'initializing',
          message: containerState.message,
          uptime: {
            seconds: Math.floor((new Date() - containerState.startTime) / 1000),
            formatted: ms(new Date() - containerState.startTime, {
              long: true,
            }),
          },
        },
        tagoConnection: {
          sdkVersion: tagoVersion,
          runningAnalyses: runningAnalyses.length,
        },
        serverTime: new Date().toString(),
      };

      // Use better-sse's push method (no event type for generic onmessage)
      await client.push(status);
    } catch (error) {
      logger.error({ error }, 'Error sending SSE status update');
    }
  }
}

/**
 * Broadcasting operations
 * Handles all message distribution to clients
 */

import { createChildLogger } from '../logging/logger.js';
import { metricsService } from '../../services/metricsService.js';
import { extractAnalysisName } from './utils.js';

const logger = createChildLogger('sse:broadcast');

export class BroadcastService {
  /**
   * @param {SSEManager} sseManager - Parent SSE manager
   */
  constructor(sseManager) {
    this.manager = sseManager;
  }

  /**
   * Broadcast to global channel (all sessions)
   * Extracted from sse.js lines 312-318
   * @param {Object} data - Message data
   * @returns {void}
   */
  broadcast(data) {
    try {
      this.manager.globalChannel.broadcast(data);
    } catch (error) {
      logger.error({ error }, 'Error broadcasting to global channel');
    }
  }

  /**
   * Generic broadcast to collection with filter
   * Extracted from sse.js lines 50-82
   * @param {Array|Set} sessions - Sessions to broadcast to
   * @param {Object} data - Message data
   * @param {Function} filterFn - Optional filter function
   * @returns {Promise<number>} Count of successful sends
   */
  async broadcastToClients(sessions, data, filterFn = null) {
    if (!sessions || typeof sessions[Symbol.iterator] !== 'function') {
      return 0; // safely skip if not iterable
    }

    let sentCount = 0;
    const failedSessions = [];

    for (const session of sessions) {
      try {
        if (filterFn && !filterFn(session)) continue;
        if (session.isConnected) {
          // Send without event type so it arrives at eventSource.onmessage
          await session.push(data);
          sentCount++;
        } else {
          failedSessions.push(session);
        }
      } catch (error) {
        logger.error(
          { userId: session.state?.userId, sessionId: session.id, error },
          'Error broadcasting SSE to session',
        );
        failedSessions.push(session);
      }
    }

    // Clean up failed sessions
    failedSessions.forEach((session) =>
      this.manager.sessionManager.removeClient(
        session.state?.userId,
        session.id,
      ),
    );
    return sentCount;
  }

  /**
   * Broadcast analysis log to subscribed sessions
   * Delegates to ChannelManager
   * @param {string} analysisName - Analysis name
   * @param {Object} logData - Log data
   * @returns {void}
   */
  broadcastAnalysisLog(analysisName, logData) {
    this.manager.channelManager.broadcastAnalysisLog(analysisName, logData);
  }

  /**
   * Route broadcast by type (log vs non-log)
   * Extracted from sse.js lines 1372-1396
   * @param {string} type - Update type
   * @param {Object} data - Update data
   * @returns {Promise<void>}
   */
  async broadcastUpdate(type, data) {
    if (type === 'log') {
      // Log broadcasts go to analysis channels (subscribed sessions only)
      const analysisName = extractAnalysisName(data);
      if (analysisName) {
        this.broadcastAnalysisLog(analysisName, {
          type: 'log',
          data: data,
        });
      } else {
        // Fallback to global broadcast if no analysis identified
        this.broadcast({
          type: 'log',
          data: data,
        });
      }
    } else {
      // Non-log updates go to global channel (all sessions)
      await this.broadcastAnalysisUpdate(type, {
        type: 'analysisUpdate',
        analysisName: type,
        update: data,
      });
    }
  }

  /**
   * Broadcast to users with team access
   * Extracted from sse.js lines 1169-1191
   * @param {string} teamId - Team ID
   * @param {Object} data - Message data
   * @returns {Promise<number>} Count sent
   */
  async broadcastToTeamUsers(teamId, data) {
    if (!teamId) {
      // If no team specified, broadcast to all (for backwards compatibility)
      return this.broadcast(data);
    }

    try {
      const { getUsersWithTeamAccess } = await import(
        '../../middleware/betterAuthMiddleware.js'
      );
      const authorizedUsers = getUsersWithTeamAccess(teamId, 'view_analyses');

      let sentCount = 0;
      for (const userId of authorizedUsers) {
        sentCount += this.manager.sessionManager.sendToUser(userId, data);
      }

      return sentCount;
    } catch (error) {
      logger.error({ error, teamId }, 'Error broadcasting to team users');
      return 0;
    }
  }

  /**
   * Broadcast to admin users only
   * Extracted from sse.js lines 1330-1349
   * @param {Object} data - Message data
   * @returns {Promise<number>} Count sent
   */
  async broadcastToAdminUsers(data) {
    const adminSessions = this.manager.sessionManager.getAdminSessions();
    let sentCount = 0;

    for (const session of adminSessions) {
      try {
        if (session.isConnected) {
          await session.push(data);
          sentCount++;
        }
      } catch (error) {
        logger.error(
          { sessionId: session.id, error },
          'Error broadcasting to admin session',
        );
      }
    }

    return sentCount;
  }

  /**
   * Broadcast team update
   * Extracted from sse.js lines 1210-1217
   * @param {Object} team - Team object
   * @param {string} action - Action type
   * @returns {Promise<void>}
   */
  async broadcastTeamUpdate(team, action) {
    await this.broadcastToAdminUsers({
      type: 'teamUpdate',
      action,
      team,
    });
  }

  /**
   * Broadcast analysis move between teams
   * Extracted from sse.js lines 1239-1257
   * @param {string} analysisName - Analysis name
   * @param {string} fromTeam - Source team
   * @param {string} toTeam - Destination team
   * @returns {Promise<void>}
   */
  async broadcastAnalysisMove(analysisName, fromTeam, toTeam) {
    const data = {
      type: 'analysisMovedToTeam',
      analysis: analysisName,
      from: fromTeam,
      to: toTeam,
    };

    // Broadcast to users with access to the source team
    if (fromTeam && fromTeam !== 'uncategorized') {
      await this.broadcastToTeamUsers(fromTeam, data);
    }

    // Broadcast to users with access to the destination team (avoid duplicates)
    if (toTeam && toTeam !== fromTeam) {
      await this.broadcastToTeamUsers(toTeam, data);
    }
  }

  /**
   * Broadcast analysis update
   * Extracted from sse.js lines 1283-1304
   * @param {string} analysisName - Analysis name
   * @param {Object} updateData - Update data
   * @param {string} teamId - Team ID (optional)
   * @returns {Promise<number>} Count sent
   */
  async broadcastAnalysisUpdate(analysisName, updateData, teamId = null) {
    try {
      // If teamId not provided, try to get it from the analysis
      let analysisTeamId = teamId;
      if (!analysisTeamId) {
        const { analysisService } = await import(
          '../../services/analysisService.js'
        );
        const analyses = await analysisService.getAllAnalyses();
        const analysis = analyses[analysisName];
        analysisTeamId = analysis?.teamId || 'uncategorized';
      }

      return await this.broadcastToTeamUsers(analysisTeamId, updateData);
    } catch (error) {
      logger.error(
        { error, analysisName },
        'Error broadcasting analysis update',
      );
      return 0;
    }
  }

  /**
   * Broadcast status update to all clients
   * Extracted from sse.js lines 1122-1130
   * @returns {Promise<void>}
   */
  async broadcastStatusUpdate() {
    if (this.manager.sessions.size === 0) return;

    for (const session of this.manager.sessions.values()) {
      if (session.isConnected) {
        await this.manager.initDataService.sendStatusUpdate(session);
      }
    }
  }

  /**
   * Broadcast refresh command
   * Extracted from sse.js lines 1143-1145
   * @returns {void}
   */
  broadcastRefresh() {
    this.broadcast({ type: 'refresh' });
  }

  /**
   * Send heartbeat to all sessions
   * Extracted from sse.js lines 1622-1624
   * @returns {void}
   */
  sendHeartbeat() {
    this.broadcast({ type: 'heartbeat' });
  }

  /**
   * Broadcast metrics update to all sessions
   * Extracted from sse.js lines 1441-1551
   * @returns {Promise<void>}
   */
  async broadcastMetricsUpdate() {
    if (this.manager.sessions.size === 0) return;

    try {
      // Load required dependencies and data
      const { metrics, analysisService, getUserTeamIds, ms } =
        await this.loadBroadcastDependencies();
      const allAnalyses = await analysisService.getAllAnalyses();
      const { containerState, sdkVersion } = this.loadContainerState();
      const { uptimeSeconds, uptimeFormatted } = this.calculateUptime(
        containerState,
        ms,
      );

      // Send customized metrics to each connected client
      for (const session of this.manager.sessions.values()) {
        await this.sendMetricsToSession(
          session,
          metrics,
          allAnalyses,
          getUserTeamIds,
          containerState,
          sdkVersion,
          uptimeSeconds,
          uptimeFormatted,
        );
      }
    } catch (error) {
      logger.error(
        { error: error.message },
        'Failed to broadcast metrics update',
      );
    }
  }

  /**
   * Load dependencies required for broadcasting metrics
   *
   * @returns {Promise<{metrics: Object, analysisService: Object, getUserTeamIds: Function, ms: Function}>}
   */
  async loadBroadcastDependencies() {
    const metrics = await metricsService.getAllMetrics();
    const { analysisService } = await import(
      '../../services/analysisService.js'
    );
    const { getUserTeamIds } = await import(
      '../../middleware/betterAuthMiddleware.js'
    );
    const ms = (await import('ms')).default;

    return { metrics, analysisService, getUserTeamIds, ms };
  }

  /**
   * Load container state and SDK version
   *
   * @returns {{containerState: Object, sdkVersion: string}}
   */
  loadContainerState() {
    const containerState = this.manager.getContainerState();
    const sdkVersion = this.manager.getSdkVersion();
    return { containerState, sdkVersion };
  }

  /**
   * Calculate uptime in seconds and formatted string
   *
   * @param {Object} containerState - Container state object
   * @param {Function} ms - Format milliseconds function
   * @returns {{uptimeSeconds: number, uptimeFormatted: string}}
   */
  calculateUptime(containerState, ms) {
    const uptimeSeconds = Math.floor(
      (new Date() - containerState.startTime) / 1000,
    );
    const uptimeFormatted = ms(new Date() - containerState.startTime, {
      long: true,
    });
    return { uptimeSeconds, uptimeFormatted };
  }

  /**
   * Send metrics to a single session with appropriate filtering
   *
   * @param {Object} session - SSE session
   * @param {Object} metrics - Raw metrics data
   * @param {Object} allAnalyses - All analyses keyed by name
   * @param {Function} getUserTeamIds - Function to get allowed team IDs
   * @param {Object} containerState - Container state
   * @param {string} sdkVersion - SDK version
   * @param {number} uptimeSeconds - Uptime in seconds
   * @param {string} uptimeFormatted - Formatted uptime
   * @returns {Promise<void>}
   */
  async sendMetricsToSession(
    session,
    metrics,
    allAnalyses,
    getUserTeamIds,
    containerState,
    sdkVersion,
    uptimeSeconds,
    uptimeFormatted,
  ) {
    try {
      if (!session.isConnected) return;

      const user = session.state.user || session.state;
      const filteredMetrics = this.filterMetricsForUser(
        user,
        metrics,
        allAnalyses,
        getUserTeamIds,
      );

      const metricsData = this.buildMetricsPayload(
        filteredMetrics,
        containerState,
        sdkVersion,
        uptimeSeconds,
        uptimeFormatted,
      );

      await session.push(metricsData);
    } catch (sessionError) {
      logger.error(
        { userId: session.state?.userId, error: sessionError },
        'Error sending metrics to session',
      );
      this.manager.sessionManager.removeClient(
        session.state?.userId,
        session.id,
      );
    }
  }

  /**
   * Filter metrics based on user permissions
   * Admin users see all analyses, regular users see only accessible teams
   *
   * @param {Object} user - User object
   * @param {Object} metrics - Raw metrics
   * @param {Object} allAnalyses - All analyses keyed by name
   * @param {Function} getUserTeamIds - Function to get allowed team IDs
   * @returns {Object} Filtered metrics
   */
  filterMetricsForUser(user, metrics, allAnalyses, getUserTeamIds) {
    const filteredMetrics = { ...metrics };

    if (user.role === 'admin') {
      return filteredMetrics;
    }

    // Non-admin: filter by team access
    const allowedTeamIds = getUserTeamIds(user.id, 'view_analyses');

    filteredMetrics.processes = metrics.processes.filter((process) => {
      const analysis = allAnalyses[process.name];
      const teamId = analysis?.teamId || 'uncategorized';
      return allowedTeamIds.includes(teamId);
    });

    // Recalculate aggregate metrics
    const filteredChildrenMetrics = {
      ...metrics.children,
      processCount: filteredMetrics.processes.length,
      memoryUsage: filteredMetrics.processes.reduce(
        (sum, p) => sum + (p.memory || 0),
        0,
      ),
      cpuUsage: filteredMetrics.processes.reduce(
        (sum, p) => sum + (p.cpu || 0),
        0,
      ),
    };

    filteredMetrics.children = filteredChildrenMetrics;
    filteredMetrics.total = {
      ...metrics.total,
      analysisProcesses: filteredChildrenMetrics.processCount,
      childrenCPU: filteredChildrenMetrics.cpuUsage,
      memoryUsage:
        metrics.container.memoryUsage + filteredChildrenMetrics.memoryUsage,
    };

    return filteredMetrics;
  }

  /**
   * Build complete metrics payload with container health and connection info
   *
   * @param {Object} filteredMetrics - Filtered metrics
   * @param {Object} containerState - Container state
   * @param {string} sdkVersion - SDK version
   * @param {number} uptimeSeconds - Uptime in seconds
   * @param {string} uptimeFormatted - Formatted uptime
   * @returns {Object} Complete metrics payload
   */
  buildMetricsPayload(
    filteredMetrics,
    containerState,
    sdkVersion,
    uptimeSeconds,
    uptimeFormatted,
  ) {
    const runningAnalysesCount = filteredMetrics.processes.length;

    return {
      type: 'metricsUpdate',
      ...filteredMetrics,
      container_health: {
        status: containerState.status === 'ready' ? 'healthy' : 'initializing',
        message: containerState.message,
        uptime: {
          seconds: uptimeSeconds,
          formatted: uptimeFormatted,
        },
      },
      tagoConnection: {
        sdkVersion: sdkVersion,
        runningAnalyses: runningAnalysesCount,
      },
    };
  }
}

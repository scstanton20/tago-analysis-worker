/**
 * Broadcasting operations
 * Handles all message distribution to clients
 */

import { createChildLogger } from '../logging/logger.ts';
import { metricsService } from '../../services/metricsService.ts';
import {
  extractAnalysisId,
  type Session,
  type ContainerState,
  type LogData,
  type SessionUser,
} from './utils.ts';
import type { SSEManager } from './SSEManager.ts';
import type {
  Analysis,
  Team,
  AnalysisProcessMetric,
  BackendSystemMetrics,
  TotalMetrics,
} from '@tago-analysis-worker/types';

const logger = createChildLogger('sse:broadcast');

/** Metrics data for broadcasting */
interface MetricsData {
  processes: AnalysisProcessMetric[];
  children: BackendSystemMetrics;
  container: BackendSystemMetrics;
  total: TotalMetrics;
}

export class BroadcastService {
  private manager: SSEManager;

  constructor(sseManager: SSEManager) {
    this.manager = sseManager;
  }

  /**
   * Broadcast to global channel (all sessions)
   * Extracted from sse.ts lines 312-318
   */
  broadcast(data: object): void {
    try {
      this.manager.globalChannel.broadcast(data);
    } catch (error) {
      logger.error({ error }, 'Error broadcasting to global channel');
    }
  }

  /**
   * Generic broadcast to collection with filter
   * Extracted from sse.ts lines 50-82
   */
  async broadcastToClients(
    sessions: Iterable<Session> | null | undefined,
    data: object,
    filterFn: ((session: Session) => boolean) | null = null,
  ): Promise<number> {
    if (
      !sessions ||
      typeof (sessions as { [Symbol.iterator]?: unknown })[Symbol.iterator] !==
        'function'
    ) {
      return 0; // safely skip if not iterable
    }

    let sentCount = 0;
    const failedSessions: Session[] = [];

    for (const session of sessions) {
      try {
        if (filterFn && !filterFn(session)) continue;
        if (session.isConnected) {
          // Send without event type so it arrives at eventSource.onmessage
          await session.push(data);
          // Update our independent lastPush tracking for stale detection
          this.manager.sessionLastPush.set(session.id, Date.now());
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
        session.state?.userId || '',
        session.id,
      ),
    );
    return sentCount;
  }

  /**
   * Broadcast analysis log to subscribed sessions
   * Delegates to ChannelManager
   */
  broadcastAnalysisLog(analysisId: string, logData: object): void {
    this.manager.channelManager.broadcastAnalysisLog(analysisId, logData);
  }

  /**
   * Broadcast DNS stats to analysis subscribers
   * Delegates to ChannelManager
   */
  async broadcastAnalysisDnsStats(analysisId: string): Promise<void> {
    await this.manager.channelManager.broadcastAnalysisDnsStats(analysisId);
  }

  /**
   * Route broadcast by type (log vs non-log)
   * Extracted from sse.ts lines 1372-1396
   */
  async broadcastUpdate(type: string, data: LogData | object): Promise<void> {
    if (type === 'log') {
      // Log broadcasts go to analysis channels (subscribed sessions only)
      const analysisId = extractAnalysisId(data as LogData);
      if (analysisId) {
        this.broadcastAnalysisLog(analysisId, {
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
        analysisId: type,
        update: data,
      });
    }
  }

  /**
   * Broadcast to users with team access
   * Extracted from sse.ts lines 1169-1191
   */
  async broadcastToTeamUsers(teamId: string, data: object): Promise<number> {
    if (!teamId) {
      // If no team specified, broadcast to all (for backwards compatibility)
      this.broadcast(data);
      return this.manager.sessions.size;
    }

    try {
      const { getUsersWithTeamAccess } = await import(
        '../../middleware/betterAuthMiddleware.ts'
      );
      const authorizedUsers = getUsersWithTeamAccess(teamId, 'view_analyses');

      let sentCount = 0;
      for (const userId of authorizedUsers) {
        sentCount += await this.manager.sessionManager.sendToUser(userId, data);
      }

      return sentCount;
    } catch (error) {
      logger.error({ error, teamId }, 'Error broadcasting to team users');
      return 0;
    }
  }

  /**
   * Broadcast to admin users only
   * Extracted from sse.ts lines 1330-1349
   */
  async broadcastToAdminUsers(data: object): Promise<number> {
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
   * Extracted from sse.ts lines 1210-1217
   */
  async broadcastTeamUpdate(team: Team, action: string): Promise<void> {
    await this.broadcastToAdminUsers({
      type: 'teamUpdate',
      action,
      team,
    });
  }

  /**
   * Broadcast analysis move between teams
   * Extracted from sse.ts lines 1239-1257
   */
  async broadcastAnalysisMove(
    analysisId: string,
    analysisName: string,
    fromTeam: string | null | undefined,
    toTeam: string,
  ): Promise<void> {
    const data = {
      type: 'analysisMovedToTeam',
      analysisId,
      analysisName,
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
   * Extracted from sse.ts lines 1283-1304
   */
  async broadcastAnalysisUpdate(
    analysisId: string,
    updateData: object,
    teamId: string | null = null,
  ): Promise<number> {
    try {
      // If teamId not provided, try to get it from the analysis
      let analysisTeamId = teamId;
      if (!analysisTeamId) {
        const { analysisService } = await import(
          '../../services/analysisService.ts'
        );
        const analysis = analysisService.getAnalysisById(analysisId) as
          | Analysis
          | undefined;
        analysisTeamId = analysis?.teamId || 'uncategorized';
      }

      return await this.broadcastToTeamUsers(analysisTeamId, updateData);
    } catch (error) {
      logger.error({ error, analysisId }, 'Error broadcasting analysis update');
      return 0;
    }
  }

  /**
   * Broadcast status update to all clients
   * Extracted from sse.ts lines 1122-1130
   */
  async broadcastStatusUpdate(): Promise<void> {
    if (this.manager.sessions.size === 0) return;

    for (const session of this.manager.sessions.values()) {
      if (session.isConnected) {
        await this.manager.initDataService.sendStatusUpdate(session);
      }
    }
  }

  /**
   * Broadcast refresh command
   * Extracted from sse.ts lines 1143-1145
   */
  broadcastRefresh(): void {
    this.broadcast({ type: 'refresh' });
  }

  /**
   * Send heartbeat to all sessions
   * Extracted from sse.ts lines 1622-1624
   */
  sendHeartbeat(): void {
    this.broadcast({ type: 'heartbeat' });
    // Update lastPush for all sessions since heartbeat goes to all via channel
    const now = Date.now();
    for (const session of this.manager.sessions.values()) {
      this.manager.sessionLastPush.set(session.id, now);
    }
  }

  /**
   * Broadcast metrics update to all sessions
   * Extracted from sse.ts lines 1441-1551
   */
  async broadcastMetricsUpdate(): Promise<void> {
    if (this.manager.sessions.size === 0) return;

    try {
      // Load required dependencies and data
      const { metrics, analysisService, getUserTeamIds, ms } =
        await this.loadBroadcastDependencies();
      const allAnalyses = (await analysisService.getAllAnalyses()) as Record<
        string,
        Analysis
      >;
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
      const err = error as Error;
      logger.error(
        { error: err.message },
        'Failed to broadcast metrics update',
      );
    }
  }

  /**
   * Load dependencies required for broadcasting metrics
   */
  private async loadBroadcastDependencies(): Promise<{
    metrics: MetricsData;
    analysisService: {
      getAllAnalyses: () => Promise<Record<string, Analysis>>;
    };
    getUserTeamIds: (userId: string, permission: string) => string[];
    ms: (value: number, options?: { long?: boolean }) => string;
  }> {
    const metrics =
      (await metricsService.getAllMetrics()) as unknown as MetricsData;
    const { analysisService } = await import(
      '../../services/analysisService.ts'
    );
    const { getUserTeamIds } = await import(
      '../../middleware/betterAuthMiddleware.ts'
    );
    const ms = (await import('ms')).default;

    return {
      metrics,
      analysisService: analysisService as unknown as {
        getAllAnalyses: () => Promise<Record<string, Analysis>>;
      },
      getUserTeamIds,
      ms: ms as unknown as (
        value: number,
        options?: { long?: boolean },
      ) => string,
    };
  }

  /**
   * Load container state and SDK version
   */
  private loadContainerState(): {
    containerState: ContainerState;
    sdkVersion: string;
  } {
    const containerState = this.manager.getContainerState();
    const sdkVersion = this.manager.getSdkVersion();
    return { containerState, sdkVersion };
  }

  /**
   * Calculate uptime in seconds and formatted string
   */
  private calculateUptime(
    containerState: ContainerState,
    ms: (value: number, options?: { long?: boolean }) => string,
  ): { uptimeSeconds: number; uptimeFormatted: string } {
    const uptimeMs = Date.now() - containerState.startTime.getTime();
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeFormatted = ms(uptimeMs, { long: true });
    return { uptimeSeconds, uptimeFormatted };
  }

  /**
   * Send metrics to a single session with appropriate filtering
   */
  private async sendMetricsToSession(
    session: Session,
    metrics: MetricsData,
    allAnalyses: Record<string, Analysis>,
    getUserTeamIds: (userId: string, permission: string) => string[],
    containerState: ContainerState,
    sdkVersion: string,
    uptimeSeconds: number,
    uptimeFormatted: string,
  ): Promise<void> {
    try {
      if (!session.isConnected) return;

      const user = (session.state.user || session.state) as SessionUser;
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
        session.state?.userId || '',
        session.id,
      );
    }
  }

  /**
   * Filter metrics based on user permissions
   * Admin users see all analyses, regular users see only accessible teams
   */
  private filterMetricsForUser(
    user: SessionUser,
    metrics: MetricsData,
    allAnalyses: Record<string, Analysis>,
    getUserTeamIds: (userId: string, permission: string) => string[],
  ): MetricsData {
    const filteredMetrics = { ...metrics };

    if (user.role === 'admin') {
      return filteredMetrics;
    }

    // Non-admin: filter by team access
    const allowedTeamIds = getUserTeamIds(user.id, 'view_analyses');

    filteredMetrics.processes = metrics.processes.filter((process) => {
      const analysis = allAnalyses[process.analysis_id];
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
   */
  private buildMetricsPayload(
    filteredMetrics: MetricsData,
    containerState: ContainerState,
    sdkVersion: string,
    uptimeSeconds: number,
    uptimeFormatted: string,
  ): object {
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

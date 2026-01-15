/**
 * Channel Management for SSE
 *
 * Manages three types of analysis-specific channels:
 * 1. Stats channels (lightweight) - log stats, DNS stats, process metrics
 * 2. Logs channels (heavy) - individual log lines
 * 3. Metrics channel (global) - detailed system metrics
 *
 * See SSE_CHANNEL_ARCHITECTURE.md for design details.
 */

import path from 'path';
import type { Request, Response } from 'express';
import { createChildLogger } from '../logging/logger.ts';
import {
  createChannel,
  Channel,
  Session as BetterSSESession,
} from 'better-sse';
import {
  getAnalysisService,
  getTeamPermissionHelpers,
  getAuthDatabase,
  getDnsCache,
} from '../lazyLoader.ts';
import { config } from '../../config/default.ts';
import { safeReadFile, safeStat } from '../safePath.ts';
import { metricsService } from '../../services/metricsService.ts';
import type { SSEManager } from './SSEManager.ts';
import type {
  Session,
  SubscriptionResult,
  UnsubscriptionResult,
  SessionUser,
} from './utils.ts';

const logger = createChildLogger('sse:channels');

/** User role query result */
interface UserRoleRow {
  id: string;
  role: string;
}

/** Extended request with user and body */
interface SubscribeRequest extends Request {
  user?: SessionUser;
  body: {
    sessionId?: string;
    analyses?: string[];
  };
}

/** Channel type for tracking subscriptions */
type ChannelType = 'stats' | 'logs';

export class ChannelManager {
  private manager: SSEManager;

  constructor(sseManager: SSEManager) {
    this.manager = sseManager;
  }

  // ========================================================================
  // Channel Creation/Access
  // ========================================================================

  /**
   * Get or create stats channel for an analysis (lightweight metadata)
   */
  getOrCreateStatsChannel(analysisId: string): Channel {
    if (!this.manager.analysisStatsChannels.has(analysisId)) {
      const channel = createChannel();
      this.manager.analysisStatsChannels.set(analysisId, channel);
      logger.debug({ analysisId }, 'Created new stats channel');
    }
    return this.manager.analysisStatsChannels.get(analysisId)!;
  }

  /**
   * Get or create logs channel for an analysis (heavy log lines)
   */
  getOrCreateLogsChannel(analysisId: string): Channel {
    if (!this.manager.analysisLogsChannels.has(analysisId)) {
      const channel = createChannel();
      this.manager.analysisLogsChannels.set(analysisId, channel);
      logger.debug({ analysisId }, 'Created new logs channel');
    }
    return this.manager.analysisLogsChannels.get(analysisId)!;
  }

  // ========================================================================
  // Stats Channel Subscriptions (lightweight - for Info Modal)
  // ========================================================================

  /**
   * Subscribe session to analysis stats channels
   * Pushes initial stats (log count, size, DNS, metrics) immediately
   */
  async subscribeToAnalysisStats(
    sessionId: string,
    analysisIds: string[],
    userId: string,
  ): Promise<SubscriptionResult> {
    return this.subscribeToChannels(sessionId, analysisIds, userId, 'stats');
  }

  /**
   * Unsubscribe from analysis stats channels
   */
  async unsubscribeFromAnalysisStats(
    sessionId: string,
    analysisIds: string[],
  ): Promise<UnsubscriptionResult> {
    return this.unsubscribeFromChannels(sessionId, analysisIds, 'stats');
  }

  // ========================================================================
  // Logs Channel Subscriptions (heavy - for Log Viewer)
  // ========================================================================

  /**
   * Subscribe session to analysis logs channels
   * Only receives individual log lines, not stats
   */
  async subscribeToAnalysisLogs(
    sessionId: string,
    analysisIds: string[],
    userId: string,
  ): Promise<SubscriptionResult> {
    return this.subscribeToChannels(sessionId, analysisIds, userId, 'logs');
  }

  /**
   * Unsubscribe from analysis logs channels
   */
  async unsubscribeFromAnalysisLogs(
    sessionId: string,
    analysisIds: string[],
  ): Promise<UnsubscriptionResult> {
    return this.unsubscribeFromChannels(sessionId, analysisIds, 'logs');
  }

  // ========================================================================
  // Metrics Channel Subscriptions (for Settings modal)
  // ========================================================================

  /**
   * Subscribe session to detailed metrics channel
   */
  async subscribeToMetrics(sessionId: string): Promise<{ success: boolean }> {
    const session = this.manager.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Register to metrics channel
    this.manager.metricsChannel.register(
      session as unknown as BetterSSESession,
    );
    session.state.subscribedToMetrics = true;

    logger.debug({ sessionId }, 'Subscribed to metrics channel');

    // Send initial metrics immediately
    await this.sendMetricsToSession(session);

    return { success: true };
  }

  /**
   * Unsubscribe from metrics channel
   */
  async unsubscribeFromMetrics(
    sessionId: string,
  ): Promise<{ success: boolean }> {
    const session = this.manager.sessions.get(sessionId);
    if (!session) {
      logger.debug(
        { sessionId },
        'Session not found during metrics unsubscribe',
      );
      return { success: true };
    }

    this.manager.metricsChannel.deregister(
      session as unknown as BetterSSESession,
    );
    session.state.subscribedToMetrics = false;

    logger.debug({ sessionId }, 'Unsubscribed from metrics channel');
    return { success: true };
  }

  // ========================================================================
  // Core Subscription Logic
  // ========================================================================

  /**
   * Generic subscription to analysis channels with permission checking
   */
  private async subscribeToChannels(
    sessionId: string,
    analysisIds: string[],
    userId: string,
    channelType: ChannelType,
  ): Promise<SubscriptionResult> {
    const session = this.manager.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Validate input
    if (!Array.isArray(analysisIds) || analysisIds.length === 0) {
      throw new Error('analysisIds must be a non-empty array');
    }

    if (analysisIds.some((id) => id == null)) {
      throw new Error('Analysis IDs cannot be null or undefined');
    }

    const subscribed: string[] = [];
    const denied: string[] = [];

    try {
      // Get user permissions
      const analysisService = await getAnalysisService();
      const { getUserTeamIds } = await getTeamPermissionHelpers();
      const { executeQuery } = await getAuthDatabase();

      const user = executeQuery<UserRoleRow>(
        'SELECT id, role FROM user WHERE id = ?',
        [userId],
        'checking user role for subscription',
      );

      const isAdmin = user?.role === 'admin';
      const allowedTeamIds = isAdmin
        ? null
        : getUserTeamIds(userId, 'view_analyses');

      // Get the appropriate subscription set
      const subscriptionSet =
        channelType === 'stats'
          ? session.state.subscribedStatsChannels
          : session.state.subscribedChannels;

      // Initialize set if needed
      if (!subscriptionSet) {
        if (channelType === 'stats') {
          session.state.subscribedStatsChannels = new Set();
        } else {
          session.state.subscribedChannels = new Set();
        }
      }

      const targetSet =
        channelType === 'stats'
          ? session.state.subscribedStatsChannels!
          : session.state.subscribedChannels;

      for (const analysisId of analysisIds) {
        // Skip if already subscribed (idempotent)
        if (targetSet.has(analysisId)) {
          subscribed.push(analysisId);
          continue;
        }

        // Check permissions for non-admin users
        if (!isAdmin && allowedTeamIds) {
          const analysis = analysisService.getAnalysisById(analysisId);
          const teamId = analysis?.teamId || 'uncategorized';

          if (!allowedTeamIds.includes(teamId)) {
            denied.push(analysisId);
            logger.warn(
              { userId, analysisId, teamId, channelType },
              'Permission denied for analysis subscription',
            );
            continue;
          }
        }

        // Create/get channel and register session
        const channel =
          channelType === 'stats'
            ? this.getOrCreateStatsChannel(analysisId)
            : this.getOrCreateLogsChannel(analysisId);

        channel.register(session as unknown as BetterSSESession);
        targetSet.add(analysisId);
        subscribed.push(analysisId);

        // Push initial data for stats channel only
        if (channelType === 'stats') {
          await this.sendInitialStatsToSession(session, analysisId);
        }
      }

      return {
        success: true,
        subscribed,
        ...(denied.length > 0 && { denied }),
        sessionId: session.id,
      };
    } catch (error) {
      logger.error(
        { error, sessionId, userId, channelType },
        'Error subscribing to channels',
      );
      throw error;
    }
  }

  /**
   * Generic unsubscription from analysis channels
   */
  private async unsubscribeFromChannels(
    sessionId: string,
    analysisIds: string[],
    channelType: ChannelType,
  ): Promise<UnsubscriptionResult> {
    const session = this.manager.sessions.get(sessionId);
    const unsubscribed: string[] = [];

    const channelMap =
      channelType === 'stats'
        ? this.manager.analysisStatsChannels
        : this.manager.analysisLogsChannels;

    const subscriptionSet = session
      ? channelType === 'stats'
        ? session.state.subscribedStatsChannels
        : session.state.subscribedChannels
      : null;

    for (const analysisId of analysisIds) {
      const channel = channelMap.get(analysisId);

      if (session && subscriptionSet?.has(analysisId)) {
        if (channel) {
          channel.deregister(session as unknown as BetterSSESession);
        }
        subscriptionSet.delete(analysisId);
        unsubscribed.push(analysisId);
      }

      // Clean up empty channels
      if (channel && channel.sessionCount === 0) {
        channelMap.delete(analysisId);
        logger.debug({ analysisId, channelType }, 'Cleaned up empty channel');
      }
    }

    if (!session) {
      logger.debug(
        { sessionId, channelType },
        'Session not found during unsubscribe',
      );
    }

    return {
      success: true,
      unsubscribed,
      sessionId: session?.id || sessionId,
    };
  }

  // ========================================================================
  // Initial Data Push (on subscription)
  // ========================================================================

  /**
   * Send all initial stats to a session on stats channel subscription
   */
  private async sendInitialStatsToSession(
    session: Session,
    analysisId: string,
  ): Promise<void> {
    await Promise.all([
      this.sendLogStatsToSession(session, analysisId),
      this.sendDnsStatsToSession(session, analysisId),
      this.sendProcessMetricsToSession(session, analysisId),
    ]);
  }

  /**
   * Send log stats (count, size) to a session
   */
  async sendLogStatsToSession(
    session: Session,
    analysisId: string,
  ): Promise<void> {
    try {
      const logPath = path.join(
        config.paths.analysis,
        analysisId,
        'logs',
        'analysis.log',
      );

      // Get file stats and count lines
      let size = 0;
      let totalCount = 0;

      try {
        const stats = await safeStat(logPath, config.paths.analysis);
        if (stats && typeof stats.size === 'number') {
          size = stats.size;
        }

        const content = await safeReadFile(logPath, config.paths.analysis, {
          encoding: 'utf8',
        });
        if (typeof content === 'string' && content.length > 0) {
          totalCount = content
            .split('\n')
            .filter((line) => line.trim().length > 0).length;
        }
      } catch {
        // File doesn't exist, use defaults (0, 0)
      }

      if (session.isConnected) {
        await session.push({
          type: 'analysisLogStats',
          analysisId,
          totalCount,
          logFileSize: size,
        });
      }
    } catch (error) {
      logger.error({ error, analysisId }, 'Error sending log stats to session');
    }
  }

  /**
   * Send DNS stats to a specific session
   */
  async sendDnsStatsToSession(
    session: Session,
    analysisId: string,
  ): Promise<void> {
    try {
      const dnsCache = await getDnsCache();

      const dnsConfig = dnsCache.getConfig();
      if (!dnsConfig.enabled) {
        return;
      }

      const stats = dnsCache.getAnalysisStats(analysisId);
      if (session.isConnected) {
        await session.push({
          type: 'analysisDnsStats',
          analysisId,
          stats,
          enabled: true,
        });
      }
    } catch (error) {
      logger.error({ error, analysisId }, 'Error sending DNS stats to session');
    }
  }

  /**
   * Send process metrics for an analysis to a session
   */
  async sendProcessMetricsToSession(
    session: Session,
    analysisId: string,
  ): Promise<void> {
    try {
      const allProcessMetrics = await metricsService.getProcessMetrics();
      const processData = allProcessMetrics.find(
        (p: { analysis_id: string }) => p.analysis_id === analysisId,
      );

      if (processData && session.isConnected) {
        await session.push({
          type: 'analysisProcessMetrics',
          analysisId,
          metrics: {
            cpu: processData.cpu || 0,
            memory: processData.memory || 0,
            uptime: processData.uptime || 0,
          },
        });
      }
    } catch (error) {
      logger.error(
        { error, analysisId },
        'Error sending process metrics to session',
      );
    }
  }

  /**
   * Send full metrics to a session (on metrics channel subscription)
   */
  private async sendMetricsToSession(session: Session): Promise<void> {
    try {
      const metrics = await metricsService.getAllMetrics();
      if (session.isConnected) {
        await session.push({
          type: 'metricsUpdate',
          ...metrics,
        });
      }
    } catch (error) {
      logger.error({ error }, 'Error sending metrics to session');
    }
  }

  // ========================================================================
  // Broadcasting
  // ========================================================================

  /**
   * Broadcast log to logs channel subscribers only
   *
   * NOTE: Do NOT pass event names - the frontend uses eventSource.onmessage
   * which only receives unnamed events. Named events require addEventListener().
   */
  broadcastAnalysisLog(analysisId: string, logData: object): void {
    const channel = this.manager.analysisLogsChannels.get(analysisId);

    if (!channel) {
      return;
    }

    try {
      channel.broadcast(logData);
    } catch (error) {
      logger.error({ error, analysisId }, 'Error broadcasting to logs channel');
    }
  }

  /**
   * Broadcast stats update to stats channel subscribers
   */
  broadcastAnalysisStats(
    analysisId: string,
    statsData: { totalCount: number; logFileSize: number },
  ): void {
    const channel = this.manager.analysisStatsChannels.get(analysisId);

    if (!channel) {
      return;
    }

    try {
      channel.broadcast({
        type: 'analysisLogStats',
        analysisId,
        ...statsData,
      });
    } catch (error) {
      logger.error(
        { error, analysisId },
        'Error broadcasting to stats channel',
      );
    }
  }

  /**
   * Broadcast DNS stats to stats channel subscribers
   */
  async broadcastAnalysisDnsStats(analysisId: string): Promise<void> {
    const channel = this.manager.analysisStatsChannels.get(analysisId);

    if (!channel) {
      return;
    }

    try {
      const dnsCache = await getDnsCache();

      const dnsConfig = dnsCache.getConfig();
      if (!dnsConfig.enabled) {
        return;
      }

      const stats = dnsCache.getAnalysisStats(analysisId);
      channel.broadcast({
        type: 'analysisDnsStats',
        analysisId,
        stats,
        enabled: true,
      });
    } catch (error) {
      logger.error(
        { error, analysisId },
        'Error broadcasting DNS stats to stats channel',
      );
    }
  }

  /**
   * Broadcast process metrics to stats channel subscribers
   */
  async broadcastAnalysisProcessMetrics(analysisId: string): Promise<void> {
    const channel = this.manager.analysisStatsChannels.get(analysisId);

    if (!channel) {
      return;
    }

    try {
      const allProcessMetrics = await metricsService.getProcessMetrics();
      const processData = allProcessMetrics.find(
        (p: { analysis_id: string }) => p.analysis_id === analysisId,
      );

      if (processData) {
        channel.broadcast({
          type: 'analysisProcessMetrics',
          analysisId,
          metrics: {
            cpu: processData.cpu || 0,
            memory: processData.memory || 0,
            uptime: processData.uptime || 0,
          },
        });
      }
    } catch (error) {
      logger.error(
        { error, analysisId },
        'Error broadcasting process metrics to stats channel',
      );
    }
  }

  /**
   * Broadcast to metrics channel subscribers only
   */
  broadcastToMetricsChannel(metricsData: object): void {
    try {
      this.manager.metricsChannel.broadcast({
        type: 'metricsUpdate',
        ...metricsData,
      });
    } catch (error) {
      logger.error({ error }, 'Error broadcasting to metrics channel');
    }
  }

  // ========================================================================
  // HTTP Request Handlers
  // ========================================================================

  /**
   * Handle HTTP subscribe to stats request
   */
  async handleSubscribeStatsRequest(
    req: SubscribeRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { sessionId, analyses } = req.body;

      if (!sessionId) {
        res
          .status(400)
          .json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!Array.isArray(analyses) || analyses.length === 0) {
        res.status(400).json({
          success: false,
          error: 'analyses must be a non-empty array',
        });
        return;
      }

      if (!this.manager.sessions.has(sessionId)) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const result = await this.subscribeToAnalysisStats(
        sessionId,
        analyses,
        req.user!.id,
      );
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling subscribe stats request');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * Handle HTTP unsubscribe from stats request
   */
  async handleUnsubscribeStatsRequest(
    req: SubscribeRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { sessionId, analyses } = req.body;

      if (!sessionId || !Array.isArray(analyses)) {
        res.status(400).json({
          success: false,
          error: 'sessionId and analyses array are required',
        });
        return;
      }

      if (!this.manager.sessions.has(sessionId)) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const result = await this.unsubscribeFromAnalysisStats(
        sessionId,
        analyses,
      );
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling unsubscribe stats request');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * Handle HTTP subscribe to logs request
   */
  async handleSubscribeLogsRequest(
    req: SubscribeRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { sessionId, analyses } = req.body;

      if (!sessionId) {
        res
          .status(400)
          .json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!Array.isArray(analyses) || analyses.length === 0) {
        res.status(400).json({
          success: false,
          error: 'analyses must be a non-empty array',
        });
        return;
      }

      if (!this.manager.sessions.has(sessionId)) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const result = await this.subscribeToAnalysisLogs(
        sessionId,
        analyses,
        req.user!.id,
      );
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling subscribe logs request');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * Handle HTTP unsubscribe from logs request
   */
  async handleUnsubscribeLogsRequest(
    req: SubscribeRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { sessionId, analyses } = req.body;

      if (!sessionId || !Array.isArray(analyses)) {
        res.status(400).json({
          success: false,
          error: 'sessionId and analyses array are required',
        });
        return;
      }

      if (!this.manager.sessions.has(sessionId)) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const result = await this.unsubscribeFromAnalysisLogs(
        sessionId,
        analyses,
      );
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling unsubscribe logs request');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * Handle HTTP subscribe to metrics request
   */
  async handleSubscribeMetricsRequest(
    req: SubscribeRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        res
          .status(400)
          .json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!this.manager.sessions.has(sessionId)) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const result = await this.subscribeToMetrics(sessionId);
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling subscribe metrics request');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * Handle HTTP unsubscribe from metrics request
   */
  async handleUnsubscribeMetricsRequest(
    req: SubscribeRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        res
          .status(400)
          .json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!this.manager.sessions.has(sessionId)) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const result = await this.unsubscribeFromMetrics(sessionId);
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling unsubscribe metrics request');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
}

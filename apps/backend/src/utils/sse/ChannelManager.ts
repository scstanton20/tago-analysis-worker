/**
 * Analysis channel management
 * Handles subscriptions, channel creation/cleanup, and log broadcasting
 */

import type { Request, Response } from 'express';
import { createChildLogger } from '../logging/logger.ts';
import {
  createChannel,
  Channel,
  Session as BetterSSESession,
} from 'better-sse';
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

export class ChannelManager {
  private manager: SSEManager;

  constructor(sseManager: SSEManager) {
    this.manager = sseManager;
  }

  /**
   * Get or create analysis channel
   * Extracted from sse.ts lines 327-334
   */
  getOrCreateAnalysisChannel(analysisId: string): Channel {
    if (!this.manager.analysisChannels.has(analysisId)) {
      const channel = createChannel();
      this.manager.analysisChannels.set(analysisId, channel);
      logger.debug({ analysisId }, 'Created new analysis channel');
    }
    return this.manager.analysisChannels.get(analysisId)!;
  }

  /**
   * Subscribe session to analyses with permission checking
   * Extracted from sse.ts lines 356-450
   */
  async subscribeToAnalysis(
    sessionId: string,
    analysisIds: string[],
    userId: string,
  ): Promise<SubscriptionResult> {
    const session = this.manager.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Validate input
    if (!Array.isArray(analysisIds) || analysisIds.length === 0) {
      throw new Error('analysisIds must be a non-empty array');
    }

    // Check for null/undefined analysis IDs
    if (analysisIds.some((id) => id == null)) {
      throw new Error('Analysis IDs cannot be null or undefined');
    }

    const subscribed: string[] = [];
    const denied: string[] = [];

    try {
      // Get user permissions
      const { analysisService } = await import(
        '../../services/analysisService.ts'
      );
      const { getUserTeamIds } = await import(
        '../../middleware/betterAuthMiddleware.ts'
      );

      // Get user's allowed teams (or all for admin)
      const { executeQuery } = await import('../../utils/authDatabase.ts');
      const user = executeQuery<UserRoleRow>(
        'SELECT id, role FROM user WHERE id = ?',
        [userId],
        'checking user role for subscription',
      );

      const isAdmin = user?.role === 'admin';
      const allowedTeamIds = isAdmin
        ? null
        : getUserTeamIds(userId, 'view_analyses');

      for (const analysisId of analysisIds) {
        // Skip if already subscribed (idempotent)
        if (session.state.subscribedChannels.has(analysisId)) {
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
              { userId, analysisId, teamId },
              'Permission denied for analysis subscription',
            );
            continue;
          }
        }

        const channel = this.getOrCreateAnalysisChannel(analysisId);
        channel.register(session as unknown as BetterSSESession);
        session.state.subscribedChannels.add(analysisId);
        subscribed.push(analysisId);

        // Push DNS stats to the newly subscribed session
        await this.sendDnsStatsToSession(session, analysisId);
      }

      return {
        success: true,
        subscribed,
        ...(denied.length > 0 && { denied }),
        sessionId: session.id,
      };
    } catch (error) {
      logger.error(
        { error, sessionId, userId },
        'Error subscribing to analysis channels',
      );
      throw error;
    }
  }

  /**
   * Unsubscribe from analyses
   * Extracted from sse.ts lines 460-496
   */
  async unsubscribeFromAnalysis(
    sessionId: string,
    analysisIds: string[],
  ): Promise<UnsubscriptionResult> {
    const session = this.manager.sessions.get(sessionId);
    const unsubscribed: string[] = [];

    for (const analysisId of analysisIds) {
      const channel = this.manager.analysisChannels.get(analysisId);

      if (session && session.state.subscribedChannels.has(analysisId)) {
        // Session exists and is subscribed
        if (channel) {
          channel.deregister(session as unknown as BetterSSESession);
        }
        session.state.subscribedChannels.delete(analysisId);
        unsubscribed.push(analysisId);
      }

      // Clean up empty channels regardless of session state
      if (channel && channel.sessionCount === 0) {
        this.manager.analysisChannels.delete(analysisId);
        logger.debug({ analysisId }, 'Cleaned up empty analysis channel');
      }
    }

    if (!session) {
      logger.debug(
        { sessionId },
        'Session not found during unsubscribe (already cleaned up?)',
      );
    }

    return {
      success: true,
      unsubscribed,
      sessionId: session?.id || sessionId,
    };
  }

  /**
   * Broadcast log to analysis subscribers
   * Extracted from sse.ts lines 506-521
   */
  broadcastAnalysisLog(analysisId: string, logData: object): void {
    const channel = this.manager.analysisChannels.get(analysisId);

    if (!channel) {
      return; // No subscribers
    }

    try {
      channel.broadcast(logData);
    } catch (error) {
      logger.error(
        { error, analysisId },
        'Error broadcasting to analysis channel',
      );
    }
  }

  /**
   * Send DNS stats to a specific session (used only on subscription)
   */
  async sendDnsStatsToSession(
    session: Session,
    analysisId: string,
  ): Promise<void> {
    try {
      const { dnsCache } = await import('../../services/dnsCache.ts');

      // Only send if DNS cache is enabled
      const config = dnsCache.getConfig();
      if (!config.enabled) {
        return;
      }

      const stats = dnsCache.getAnalysisStats(analysisId);
      if (session.isConnected) {
        await session.push({
          type: 'analysisDnsStats',
          analysisId,
          stats,
          enabled: true, // Only sent when DNS cache is enabled
        });
      }
    } catch (error) {
      logger.error({ error, analysisId }, 'Error sending DNS stats to session');
    }
  }

  /**
   * Broadcast DNS stats to all analysis subscribers
   */
  async broadcastAnalysisDnsStats(analysisId: string): Promise<void> {
    const channel = this.manager.analysisChannels.get(analysisId);

    if (!channel) {
      return; // No subscribers
    }

    try {
      const { dnsCache } = await import('../../services/dnsCache.ts');

      // Only broadcast if DNS cache is enabled
      const config = dnsCache.getConfig();
      if (!config.enabled) {
        return;
      }

      const stats = dnsCache.getAnalysisStats(analysisId);
      channel.broadcast({
        type: 'analysisDnsStats',
        analysisId,
        stats,
        enabled: true, // Only broadcast when DNS cache is enabled
      });
    } catch (error) {
      logger.error(
        { error, analysisId },
        'Error broadcasting DNS stats to analysis channel',
      );
    }
  }

  /**
   * Handle HTTP subscribe request
   * Extracted from sse.ts lines 530-570
   */
  async handleSubscribeRequest(
    req: SubscribeRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { sessionId, analyses } = req.body;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'sessionId is required',
        });
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
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      // Subscribe
      const result = await this.subscribeToAnalysis(
        sessionId,
        analyses,
        req.user!.id,
      );

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling subscribe request');
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle HTTP unsubscribe request
   * Extracted from sse.ts lines 579-610
   */
  async handleUnsubscribeRequest(
    req: SubscribeRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { sessionId, analyses } = req.body;

      // Validate input
      if (!sessionId || !Array.isArray(analyses)) {
        res.status(400).json({
          success: false,
          error: 'sessionId and analyses array are required',
        });
        return;
      }

      // Check if session exists
      if (!this.manager.sessions.has(sessionId)) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      // Unsubscribe
      const result = await this.unsubscribeFromAnalysis(sessionId, analyses);

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling unsubscribe request');
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
}

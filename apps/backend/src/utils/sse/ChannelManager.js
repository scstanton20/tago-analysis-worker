/**
 * Analysis channel management
 * Handles subscriptions, channel creation/cleanup, and log broadcasting
 */

import { createChildLogger } from '../logging/logger.js';
import { createChannel } from 'better-sse';

const logger = createChildLogger('sse:channels');

export class ChannelManager {
  /**
   * @param {SSEManager} sseManager - Parent SSE manager
   */
  constructor(sseManager) {
    this.manager = sseManager;
  }

  /**
   * Get or create analysis channel
   * Extracted from sse.js lines 327-334
   * @param {string} analysisId - Analysis ID (UUID)
   * @returns {Object} Channel object
   */
  getOrCreateAnalysisChannel(analysisId) {
    if (!this.manager.analysisChannels.has(analysisId)) {
      const channel = createChannel();
      this.manager.analysisChannels.set(analysisId, channel);
      logger.debug({ analysisId }, 'Created new analysis channel');
    }
    return this.manager.analysisChannels.get(analysisId);
  }

  /**
   * Subscribe session to analyses with permission checking
   * Extracted from sse.js lines 356-450
   * @param {string} sessionId - Session ID
   * @param {string[]} analysisIds - Analysis IDs (UUIDs)
   * @param {string} userId - User ID
   * @returns {Promise<SubscriptionResult>} Subscription result
   */
  async subscribeToAnalysis(sessionId, analysisIds, userId) {
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

    const subscribed = [];
    const denied = [];

    try {
      // Get user permissions
      const { analysisService } = await import(
        '../../services/analysisService.js'
      );
      const { getUserTeamIds } = await import(
        '../../middleware/betterAuthMiddleware.js'
      );

      // Get user's allowed teams (or all for admin)
      const { executeQuery } = await import('../../utils/authDatabase.js');
      const user = executeQuery(
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
        if (!isAdmin) {
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
        channel.register(session);
        session.state.subscribedChannels.add(analysisId);
        subscribed.push(analysisId);
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
   * Extracted from sse.js lines 460-496
   * @param {string} sessionId - Session ID
   * @param {string[]} analysisIds - Analysis IDs (UUIDs)
   * @returns {Promise<Object>} Unsubscription result
   */
  async unsubscribeFromAnalysis(sessionId, analysisIds) {
    const session = this.manager.sessions.get(sessionId);
    const unsubscribed = [];

    for (const analysisId of analysisIds) {
      const channel = this.manager.analysisChannels.get(analysisId);

      if (session && session.state.subscribedChannels.has(analysisId)) {
        // Session exists and is subscribed
        if (channel) {
          channel.deregister(session);
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
   * Extracted from sse.js lines 506-521
   * @param {string} analysisId - Analysis ID (UUID)
   * @param {Object} logData - Log data
   * @returns {void}
   */
  broadcastAnalysisLog(analysisId, logData) {
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
   * Handle HTTP subscribe request
   * Extracted from sse.js lines 530-570
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async handleSubscribeRequest(req, res) {
    try {
      const { sessionId, analyses } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'sessionId is required',
        });
      }

      if (!Array.isArray(analyses) || analyses.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'analyses must be a non-empty array',
        });
      }

      if (!this.manager.sessions.has(sessionId)) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      // Subscribe
      const result = await this.subscribeToAnalysis(
        sessionId,
        analyses,
        req.user.id,
      );

      return res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling subscribe request');
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle HTTP unsubscribe request
   * Extracted from sse.js lines 579-610
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async handleUnsubscribeRequest(req, res) {
    try {
      const { sessionId, analyses } = req.body;

      // Validate input
      if (!sessionId || !Array.isArray(analyses)) {
        return res.status(400).json({
          success: false,
          error: 'sessionId and analyses array are required',
        });
      }

      // Check if session exists
      if (!this.manager.sessions.has(sessionId)) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      // Unsubscribe
      const result = await this.unsubscribeFromAnalysis(sessionId, analyses);

      return res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error handling unsubscribe request');
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

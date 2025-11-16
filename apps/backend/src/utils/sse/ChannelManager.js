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
   * @param {string} analysisName - Analysis name
   * @returns {Object} Channel object
   */
  getOrCreateAnalysisChannel(analysisName) {
    if (!this.manager.analysisChannels.has(analysisName)) {
      const channel = createChannel();
      this.manager.analysisChannels.set(analysisName, channel);
      logger.debug({ analysisName }, 'Created new analysis channel');
    }
    return this.manager.analysisChannels.get(analysisName);
  }

  /**
   * Subscribe session to analyses with permission checking
   * Extracted from sse.js lines 356-450
   * @param {string} sessionId - Session ID
   * @param {string[]} analysisNames - Analysis names
   * @param {string} userId - User ID
   * @returns {Promise<SubscriptionResult>} Subscription result
   */
  async subscribeToAnalysis(sessionId, analysisNames, userId) {
    const session = this.manager.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Validate input
    if (!Array.isArray(analysisNames) || analysisNames.length === 0) {
      throw new Error('analysisNames must be a non-empty array');
    }

    // Check for null/undefined analysis names
    if (analysisNames.some((name) => name == null)) {
      throw new Error('Analysis names cannot be null or undefined');
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

      let allAnalyses = {};
      try {
        allAnalyses = (await analysisService.getAllAnalyses()) || {};
      } catch (getAllAnalysesError) {
        // In test environment or when storage not initialized, getAllAnalyses may fail
        // This is acceptable - we'll just have an empty analysis list
        logger.debug(
          { error: getAllAnalysesError.message },
          'Failed to get all analyses, using empty list',
        );
      }

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

      for (const analysisName of analysisNames) {
        // Skip if already subscribed (idempotent)
        if (session.state.subscribedChannels.has(analysisName)) {
          subscribed.push(analysisName);
          continue;
        }

        // Check permissions for non-admin users
        if (!isAdmin) {
          const analysis = allAnalyses[analysisName];
          const teamId = analysis?.teamId || 'uncategorized';

          if (!allowedTeamIds.includes(teamId)) {
            denied.push(analysisName);
            logger.warn(
              { userId, analysisName, teamId },
              'Permission denied for analysis subscription',
            );
            continue;
          }
        }

        const channel = this.getOrCreateAnalysisChannel(analysisName);
        channel.register(session);
        session.state.subscribedChannels.add(analysisName);
        subscribed.push(analysisName);
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
   * @param {string[]} analysisNames - Analysis names
   * @returns {Promise<Object>} Unsubscription result
   */
  async unsubscribeFromAnalysis(sessionId, analysisNames) {
    const session = this.manager.sessions.get(sessionId);
    const unsubscribed = [];

    for (const analysisName of analysisNames) {
      const channel = this.manager.analysisChannels.get(analysisName);

      if (session && session.state.subscribedChannels.has(analysisName)) {
        // Session exists and is subscribed
        if (channel) {
          channel.deregister(session);
        }
        session.state.subscribedChannels.delete(analysisName);
        unsubscribed.push(analysisName);
      }

      // Clean up empty channels regardless of session state
      if (channel && channel.sessionCount === 0) {
        this.manager.analysisChannels.delete(analysisName);
        logger.debug({ analysisName }, 'Cleaned up empty analysis channel');
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
   * @param {string} analysisName - Analysis name
   * @param {Object} logData - Log data
   * @returns {void}
   */
  broadcastAnalysisLog(analysisName, logData) {
    const channel = this.manager.analysisChannels.get(analysisName);

    if (!channel) {
      return; // No subscribers
    }

    try {
      channel.broadcast(logData);
    } catch (error) {
      logger.error(
        { error, analysisName },
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

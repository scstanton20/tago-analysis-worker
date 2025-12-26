/**
 * Session lifecycle management
 * Handles client connections, disconnections, and user session queries
 */

import { createChildLogger } from '../logging/logger.js';
import { createSession } from 'better-sse';
import {
  generateSessionId,
  FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS,
} from './utils.js';

const logger = createChildLogger('sse:sessions');

export class SessionManager {
  /**
   * @param {SSEManager} sseManager - Parent SSE manager
   */
  constructor(sseManager) {
    this.manager = sseManager;
  }

  /**
   * Add new authenticated SSE client
   * Extracted from sse.js lines 95-151
   * @param {string} userId - User ID
   * @param {Object} res - Express response
   * @param {Object} req - Express request
   * @returns {Promise<Session>} Session object
   */
  async addClient(userId, res, req) {
    try {
      // Create better-sse session
      const session = await createSession(req, res);

      // Generate and attach session ID
      session.id = generateSessionId();

      // Initialize session state
      if (!session.state) {
        session.state = {};
      }
      session.state.userId = userId;
      session.state.user = req.user;
      if (!session.state.subscribedChannels) {
        session.state.subscribedChannels = new Set();
      }

      // Track session
      this.manager.sessions.set(session.id, session);
      // Initialize last push timestamp for stale detection (independent of better-sse internals)
      this.manager.sessionLastPush.set(session.id, Date.now());

      // Register to global channel
      this.manager.globalChannel.register(session);

      logger.info({ userId, sessionId: session.id }, 'SSE session created');

      // Start heartbeat if first client
      if (this.manager.sessions.size === 1 && !this.manager.heartbeatInterval) {
        this.manager.startHeartbeat();
      }

      // Start metrics if first client
      if (this.manager.sessions.size === 1 && !this.manager.metricsInterval) {
        this.manager.startMetricsBroadcasting();
      }

      // Handle disconnect
      req.on('close', async () => {
        await this.removeClient(userId, session.id);
      });

      return session;
    } catch (error) {
      logger.error({ error, userId }, 'Error adding SSE client');
      throw error;
    }
  }

  /**
   * Remove client and cleanup
   * Extracted from sse.js lines 161-185
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async removeClient(userId, sessionId) {
    const session = this.manager.sessions.get(sessionId);

    if (session) {
      // Unsubscribe from all analysis channels
      const subscribedChannels = Array.from(session.state.subscribedChannels);
      if (subscribedChannels.length > 0) {
        await this.manager.channelManager.unsubscribeFromAnalysis(
          sessionId,
          subscribedChannels,
        );
      }

      // Deregister from global channel
      this.manager.globalChannel.deregister(session);

      // Remove from sessions map and lastPush tracking
      this.manager.sessions.delete(sessionId);
      this.manager.sessionLastPush.delete(sessionId);

      logger.info({ userId, sessionId }, 'SSE session removed');
    }

    // Stop heartbeat/metrics if no clients
    if (this.manager.sessions.size === 0) {
      this.manager.stopHeartbeat();
      this.manager.stopMetricsBroadcasting();
    }
  }

  /**
   * Get all sessions for a user
   * Extracted from sse.js lines 987-991
   * @param {string} userId - User ID
   * @returns {Array<Session>} Sessions for user
   */
  getSessionsByUserId(userId) {
    return Array.from(this.manager.sessions.values()).filter(
      (session) => session.state?.userId === userId,
    );
  }

  /**
   * Get all admin sessions
   * Extracted from sse.js lines 997-1001
   * @returns {Array<Session>} Admin sessions
   */
  getAdminSessions() {
    return Array.from(this.manager.sessions.values()).filter(
      (session) => session.state?.user?.role === 'admin',
    );
  }

  /**
   * Send message to all user sessions
   * Extracted from sse.js lines 196-221
   * @param {string} userId - User ID
   * @param {Object} data - Message data
   * @returns {Promise<number>} Count of messages sent
   */
  async sendToUser(userId, data) {
    const userSessions = this.getSessionsByUserId(userId);
    let sentCount = 0;
    const failedSessions = [];

    for (const session of userSessions) {
      try {
        // session.push() returns a Promise - must await to catch errors
        await session.push(data);
        // Update our independent lastPush tracking for stale detection
        this.manager.sessionLastPush.set(session.id, Date.now());
        sentCount++;
      } catch (error) {
        logger.error(
          { userId, sessionId: session.id, error: error.message },
          'Error sending to user',
        );
        failedSessions.push(session.id);
      }
    }

    // Clean up failed sessions after iteration to avoid modifying during loop
    for (const sessionId of failedSessions) {
      try {
        await this.removeClient(userId, sessionId);
      } catch (cleanupError) {
        logger.error(
          { userId, sessionId, error: cleanupError.message },
          'Error cleaning up failed session',
        );
      }
    }

    if (sentCount > 0) {
      logger.debug(
        { userId, messageType: data.type, sessionCount: sentCount },
        'SSE message sent to user sessions',
      );
    }

    return sentCount;
  }

  /**
   * Disconnect all sessions for a user
   * Extracted from sse.js lines 231-269
   * @param {string} userId - User ID
   * @returns {number} Count of disconnected sessions
   */
  disconnectUser(userId) {
    const userSessions = this.getSessionsByUserId(userId);
    if (userSessions.length === 0) {
      logger.warn({ userId }, 'No SSE sessions to disconnect for user');
      return 0;
    }

    logger.info(
      { userId, sessionCount: userSessions.length },
      'Starting disconnection of all SSE sessions for user',
    );

    let disconnectedCount = 0;

    for (const session of userSessions) {
      try {
        if (session.isConnected) {
          logger.debug(
            { userId, sessionId: session.id },
            'Closing SSE session',
          );
          // better-sse handles disconnection
          session.state._disconnecting = true;
          disconnectedCount++;
        }
      } catch (error) {
        logger.error(
          { userId, sessionId: session.id, error },
          'Error disconnecting SSE session',
        );
      }
    }

    logger.info(
      { userId, disconnectedCount, totalSessions: userSessions.length },
      'Disconnected all SSE sessions for user',
    );
    return disconnectedCount;
  }

  /**
   * Force user logout
   * Extracted from sse.js lines 279-302
   * @param {string} userId - User ID
   * @param {string} reason - Logout reason
   * @returns {Promise<number>} Count of disconnected sessions
   */
  async forceUserLogout(userId, reason = 'Your session has been terminated') {
    logger.info({ userId, reason }, 'Forcing user logout via SSE');

    // Send logout notification
    const sentCount = await this.sendToUser(userId, {
      type: 'forceLogout',
      reason: reason,
      timestamp: new Date().toISOString(),
    });

    // Wait a moment for delivery
    if (sentCount > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS),
      );
    }

    // Close connections
    const closedCount = this.disconnectUser(userId);

    logger.info({ userId, sentCount, closedCount }, 'Force logout completed');

    return closedCount;
  }

  /**
   * Find session by session ID
   * Extracted from sse.js lines 343-345
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Session object or null if not found
   */
  findSessionById(sessionId) {
    return this.manager.sessions.get(sessionId) || null;
  }
}

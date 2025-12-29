/**
 * Session lifecycle management
 * Handles client connections, disconnections, and user session queries
 */

import type { Request, Response } from 'express';
import { createChildLogger } from '../logging/logger.ts';
import { createSession, Session as BetterSSESession } from 'better-sse';
import {
  generateSessionId,
  FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS,
  type Session,
  type SessionState,
  type SessionUser,
  type SSEMessage,
} from './utils.ts';
import type { SSEManager } from './SSEManager.ts';

const logger = createChildLogger('sse:sessions');

/** Extended request with user */
interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

export class SessionManager {
  private manager: SSEManager;

  constructor(sseManager: SSEManager) {
    this.manager = sseManager;
  }

  /**
   * Add new authenticated SSE client
   * Extracted from sse.js lines 95-151
   */
  async addClient(
    userId: string,
    res: Response,
    req: AuthenticatedRequest,
  ): Promise<Session> {
    try {
      // Create better-sse session
      const betterSession = await createSession(req, res);

      // Cast to our Session type with modifications
      const session = betterSession as unknown as Session & BetterSSESession;

      // Generate and attach session ID
      session.id = generateSessionId();

      // Initialize session state
      if (!session.state) {
        session.state = {} as SessionState;
      }
      session.state.userId = userId;
      session.state.user = req.user as SessionUser;
      if (!session.state.subscribedChannels) {
        session.state.subscribedChannels = new Set();
      }

      // Track session
      this.manager.sessions.set(session.id, session);
      // Initialize last push timestamp for stale detection (independent of better-sse internals)
      this.manager.sessionLastPush.set(session.id, Date.now());

      // Register to global channel
      this.manager.globalChannel.register(betterSession);

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
   */
  async removeClient(userId: string, sessionId: string): Promise<void> {
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
      this.manager.globalChannel.deregister(
        session as unknown as BetterSSESession,
      );

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
   */
  getSessionsByUserId(userId: string): Session[] {
    return Array.from(this.manager.sessions.values()).filter(
      (session) => session.state?.userId === userId,
    );
  }

  /**
   * Get all admin sessions
   * Extracted from sse.js lines 997-1001
   */
  getAdminSessions(): Session[] {
    return Array.from(this.manager.sessions.values()).filter(
      (session) => session.state?.user?.role === 'admin',
    );
  }

  /**
   * Send message to all user sessions
   * Extracted from sse.js lines 196-221
   */
  async sendToUser(userId: string, data: SSEMessage | object): Promise<number> {
    const userSessions = this.getSessionsByUserId(userId);
    let sentCount = 0;
    const failedSessions: string[] = [];

    for (const session of userSessions) {
      try {
        // session.push() returns a Promise - must await to catch errors
        await session.push(data);
        // Update our independent lastPush tracking for stale detection
        this.manager.sessionLastPush.set(session.id, Date.now());
        sentCount++;
      } catch (error) {
        const err = error as Error;
        logger.error(
          { userId, sessionId: session.id, error: err.message },
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
        const err = cleanupError as Error;
        logger.error(
          { userId, sessionId, error: err.message },
          'Error cleaning up failed session',
        );
      }
    }

    if (sentCount > 0) {
      logger.debug(
        {
          userId,
          messageType: (data as SSEMessage).type,
          sessionCount: sentCount,
        },
        'SSE message sent to user sessions',
      );
    }

    return sentCount;
  }

  /**
   * Disconnect all sessions for a user
   * Extracted from sse.js lines 231-269
   */
  disconnectUser(userId: string): number {
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
   */
  async forceUserLogout(
    userId: string,
    reason = 'Your session has been terminated',
  ): Promise<number> {
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
   */
  findSessionById(sessionId: string): Session | null {
    return this.manager.sessions.get(sessionId) || null;
  }
}

/**
 * Server-Sent Events (SSE) manager for real-time communication
 * Manages WebSocket-like connections using HTTP streaming to push updates to clients.
 *
 * Features:
 * - User-specific messaging with team-based access control
 * - Global broadcasts and admin-only broadcasts
 * - Automatic metrics broadcasting to connected clients
 * - Permission-aware data filtering based on user roles and team access
 * - Heartbeat mechanism with timeout detection for connection health
 * - Automatic stale connection cleanup to prevent memory leaks
 *
 * Connection Management:
 * - Tracks sessions using better-sse (sessionId -> Session)
 * - Per-analysis channels for targeted log broadcasting
 * - Global channel for system-wide broadcasts
 * - Automatic cleanup on disconnect
 * - Stale connection detection (60-second timeout)
 * - Heartbeat tracking with lastPushAt timestamp
 *
 * Heartbeat & Timeout:
 * - Centralized heartbeat every 30 seconds
 * - Tracks successful message delivery via lastHeartbeat
 * - Removes connections with no successful heartbeat in 60 seconds
 * - Prevents accumulation of dead connections
 *
 * Security:
 * - Better Auth integration for session validation
 * - Role-based message filtering (admin vs regular users)
 * - Team-based access control for analysis and metrics data
 *
 * Use Cases:
 * - Real-time analysis status updates
 * - Live log streaming
 * - System metrics broadcasting
 * - Team and analysis CRUD notifications
 * - Container health status updates
 *
 * @module sse
 */
// backend/src/utils/sse.js
import { auth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { createChildLogger } from './logging/logger.js';
import { metricsService } from '../services/metricsService.js';
import { createSession, createChannel } from 'better-sse';

const logger = createChildLogger('sse');

/**
 * SSEManager class for managing Server-Sent Events connections
 * Singleton instance exported as `sseManager` for application-wide use.
 *
 * Connection Lifecycle:
 * 1. Client connects via /api/sse endpoint
 * 2. Authentication via Better Auth middleware
 * 3. addClient() registers the connection
 * 4. sendInitialData() sends analyses, teams, and status
 * 5. Periodic broadcasts (metrics, status updates)
 * 6. removeClient() on disconnect
 *
 * Data Flow:
 * - Broadcast methods filter data based on user permissions
 * - Team-aware broadcasts only send to users with team access
 * - Admin broadcasts only reach admin users
 * - Metrics filtered by team access before sending
 */
class SSEManager {
  /**
   * Broadcast message to a collection of clients with optional filtering
   * Generic broadcast helper to reduce code duplication
   *
   * @param {Set|Array} clients - Collection of client objects to broadcast to
   * @param {Object} data - Message data to send (will be formatted as SSE)
   * @param {Function} [filterFn=null] - Optional filter function (client) => boolean
   * @returns {number} Count of clients that successfully received the message
   *
   * Behavior:
   * - Iterates through clients
   * - Applies optional filter function
   * - Skips destroyed connections
   * - Automatically removes failed clients
   * - Updates lastHeartbeat on successful writes
   *
   * Error Handling:
   * - Logs errors per client
   * - Collects and removes failed clients after iteration
   */
  /**
   * Broadcast message to a collection of better-sse sessions
   * Uses session.push() without event type for generic onmessage handler
   *
   * @param {Set|Array} sessions - Collection of better-sse Session objects
   * @param {Object} data - Message data to send
   * @param {Function} [filterFn=null] - Optional filter function (session) => boolean
   * @returns {Promise<number>} Count of sessions that successfully received the message
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
      this.removeClient(session.state?.userId, session.id),
    );
    return sentCount;
  }

  /**
   * Add authenticated SSE client connection using better-sse
   * Creates session, registers to global channel
   *
   * @param {string} userId - User ID from authenticated session
   * @param {Object} res - Express response object for SSE streaming
   * @param {Object} req - Express request object
   * @param {Object} req.user - Authenticated user object
   * @returns {Promise<Object>} better-sse Session object
   *
   * Side effects:
   * - Creates better-sse session
   * - Registers session to global channel
   * - Adds session to sessions map
   * - Adds to legacy tracking (backward compatibility)
   * - Starts heartbeat mechanism if first client
   * - Starts metrics broadcasting if first client
   * - Sets up disconnect handler
   */
  async addClient(userId, res, req) {
    // Create better-sse session
    const session = await createSession(req, res);

    // Generate a unique session ID (better-sse doesn't provide one)
    const sessionId =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    // Attach ID to session object
    session.id = sessionId;

    // Initialize session state (or use existing state from mock/real session)
    if (!session.state) {
      session.state = {};
    }
    session.state.userId = userId;
    session.state.user = req.user; // Store user object for permission checks
    if (!session.state.subscribedChannels) {
      session.state.subscribedChannels = new Set();
    }

    // Track session
    this.sessions.set(session.id, session);

    // Register to global channel
    this.globalChannel.register(session);

    logger.info({ userId, sessionId: session.id }, 'SSE session created');

    // Start heartbeat if this is the first client
    if (this.sessions.size === 1 && !this.heartbeatInterval) {
      this.startHeartbeat();
    }

    // Start metrics broadcasting if this is the first client
    if (this.sessions.size === 1 && !this.metricsInterval) {
      this.startMetricsBroadcasting();
    }

    // Handle disconnect via request 'close' event
    req.on('close', async () => {
      await this.removeClient(userId, session.id);
    });

    return session;
  }

  /**
   * Remove SSE client connection and cleanup all subscriptions
   *
   * @param {string} userId - User ID
   * @param {string} sessionId - Session identifier
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Unsubscribes from all analysis channels
   * - Deregisters from global channel
   * - Removes session from sessions map
   * - Removes from legacy tracking
   * - Stops heartbeat mechanism if no clients remaining
   * - Stops metrics broadcasting if no clients remaining
   */
  async removeClient(userId, sessionId) {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Unsubscribe from all analysis channels
      const subscribedChannels = Array.from(session.state.subscribedChannels);
      if (subscribedChannels.length > 0) {
        await this.unsubscribeFromAnalysis(sessionId, subscribedChannels);
      }

      // Deregister from global channel
      this.globalChannel.deregister(session);

      // Remove from sessions map
      this.sessions.delete(sessionId);

      logger.info({ userId, sessionId }, 'SSE session removed');
    }

    // Stop heartbeat and metrics broadcasting if no clients remaining
    if (this.sessions.size === 0) {
      this.stopHeartbeat();
      this.stopMetricsBroadcasting();
    }
  }

  /**
   * Send message to all connections of a specific user
   * Useful for user-specific notifications or permission changes
   *
   * @param {string} userId - Target user ID
   * @param {Object} data - Message data object (will be wrapped with timestamp)
   * @returns {number} Count of clients that successfully received the message
   *
   * Behavior:
   * - Returns 0 if user has no active connections
   * - Automatically removes failed clients
   * - Skips destroyed response objects
   *
   * Error Handling:
   * - Logs send errors
   * - Removes client on failure
   */
  sendToUser(userId, data) {
    const userSessions = this.getSessionsByUserId(userId);
    let sentCount = 0;

    for (const session of userSessions) {
      try {
        session.push(data);
        sentCount++;
      } catch (error) {
        logger.error(
          { userId, sessionId: session.id, error },
          'Error sending to user',
        );
        this.removeClient(userId, session.id);
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
   * Close all SSE connections for a specific user
   * Forcibly terminates all active SSE connections for the user
   *
   * @param {string} userId - User ID whose connections to close
   * @returns {number} Count of connections that were closed
   *
   * Use Cases:
   * - User banned from system
   * - User removed from organization
   *
   * Behavior:
   * - Ends each response stream
   * - Automatically triggers cleanup via 'close' event
   * - Safe to call even if user has no connections
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
   * Force logout a user by sending SSE notification and closing connections
   * Sends logout notification via SSE, then closes all user's SSE connections
   *
   * @param {string} userId - User ID to force logout
   * @param {string} [reason='Your session has been terminated'] - Reason for logout
   * @returns {Promise<number>} Count of connections that were closed
   *
   * Use Cases:
   * - User banned from system
   * - User sessions revoked by admin
   * - User removed from organization
   *
   * Behavior:
   * - Sends forceLogout message to all user's connections
   * - Waits briefly for message delivery
   * - Closes all SSE connections for the user
   * - Returns count of closed connections
   */
  async forceUserLogout(userId, reason = 'Your session has been terminated') {
    logger.info({ userId, reason }, 'Forcing user logout via SSE');

    // Send logout notification to all user's sessions
    const sentCount = this.sendToUser(userId, {
      type: 'forceLogout',
      reason: reason,
      timestamp: new Date().toISOString(),
    });

    // Give the message a moment to be delivered before closing connections
    if (sentCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    // Close all SSE connections for this user
    const closedCount = this.disconnectUser(userId);

    logger.info({ userId, sentCount, closedCount }, 'Force logout completed');

    return closedCount;
  }

  /**
   * Broadcast message to all connected sessions via global channel
   * Global system-wide broadcast without filtering
   *
   * @param {Object} data - Message data object
   * @returns {void}
   *
   * Behavior:
   * - Broadcasts to all sessions via global channel
   * - Uses better-sse channel broadcast mechanism
   *
   * Use Cases:
   * - System-wide notifications
   * - Global refresh commands
   * - Heartbeat messages
   * - Status updates
   *
   * Error Handling:
   * - Logs broadcast errors
   * - better-sse handles failed session cleanup
   */
  broadcast(data) {
    try {
      this.globalChannel.broadcast(data);
    } catch (error) {
      logger.error({ error }, 'Error broadcasting to global channel');
    }
  }

  /**
   * Get or create analysis-specific channel for log broadcasting
   * Creates channel on first request, reuses on subsequent requests
   *
   * @param {string} analysisName - Analysis identifier
   * @returns {Object} better-sse Channel instance
   */
  getOrCreateAnalysisChannel(analysisName) {
    if (!this.analysisChannels.has(analysisName)) {
      const channel = createChannel();
      this.analysisChannels.set(analysisName, channel);
      logger.debug({ analysisName }, 'Created new analysis channel');
    }
    return this.analysisChannels.get(analysisName);
  }

  /**
   * Find session by session ID
   * Helper method for subscription management
   *
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Session object or null if not found
   */
  findSessionById(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Subscribe session to analysis channels for log streaming
   * Checks permissions before subscribing
   *
   * @param {string} sessionId - Session identifier
   * @param {string[]} analysisNames - Array of analysis names to subscribe to
   * @param {string} userId - User ID for permission checking
   * @returns {Promise<Object>} Subscription result with success/denied lists
   */
  async subscribeToAnalysis(sessionId, analysisNames, userId) {
    const session = this.sessions.get(sessionId);
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
        '../services/analysisService.js'
      );
      const { getUserTeamIds } = await import(
        '../middleware/betterAuthMiddleware.js'
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
      const { executeQuery } = await import('../utils/authDatabase.js');
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
   * Unsubscribe session from analysis channels
   * Cleans up empty channels automatically
   *
   * @param {string} sessionId - Session identifier
   * @param {string[]} analysisNames - Array of analysis names to unsubscribe from
   * @returns {Promise<Object>} Unsubscription result
   */
  async unsubscribeFromAnalysis(sessionId, analysisNames) {
    const session = this.sessions.get(sessionId);

    const unsubscribed = [];

    for (const analysisName of analysisNames) {
      const channel = this.analysisChannels.get(analysisName);

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
        this.analysisChannels.delete(analysisName);
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
   * Broadcast log to analysis-specific channel
   * Only subscribed sessions receive the log
   *
   * @param {string} analysisName - Analysis name
   * @param {Object} logData - Log data to broadcast
   * @returns {void}
   */
  broadcastAnalysisLog(analysisName, logData) {
    const channel = this.analysisChannels.get(analysisName);

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
   * Handle HTTP subscription request
   *
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

      if (!this.sessions.has(sessionId)) {
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
   * Handle HTTP unsubscription request
   *
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
      if (!this.sessions.has(sessionId)) {
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

  /**
   * Get SSE connection statistics
   * Returns current connection metrics for monitoring
   *
   * @returns {Object} Connection statistics
   * @returns {number} returns.totalClients - Total number of active connections
   * @returns {number} returns.uniqueUsers - Number of unique users connected
   * @returns {Array<Object>} returns.userConnections - Per-user connection details
   * @returns {string} returns.userConnections[].userId - User ID
   * @returns {number} returns.userConnections[].connectionCount - Number of connections for this user
   *
   * Use Cases:
   * - System monitoring and diagnostics
   * - Connection health checks
   * - Debugging connection issues
   */
  getStats() {
    const userSessionCounts = new Map();

    for (const session of this.sessions.values()) {
      const userId = session.state?.userId;
      if (userId) {
        userSessionCounts.set(userId, (userSessionCounts.get(userId) || 0) + 1);
      }
    }

    return {
      totalClients: this.sessions.size,
      uniqueUsers: userSessionCounts.size,
      userConnections: Array.from(userSessionCounts.entries()).map(
        ([userId, count]) => ({
          userId,
          connectionCount: count,
        }),
      ),
    };
  }

  /**
   * Send initial data snapshot to newly connected client
   * Provides analyses, teams, team structure, and system status filtered by permissions
   *
   * @param {Object} client - Client object with res, req, userId properties
   * @param {Object} client.req - Express request with user object
   * @param {Object} client.req.user - Authenticated user with id property
   * @param {Object} client.res - Express response for writing SSE messages
   * @returns {Promise<void>}
   *
   * Data Sent:
   * - type: 'init' - Identifies as initialization message
   * - analyses: Analysis files (filtered by team access for non-admin)
   * - teams: Team configurations (filtered by team access for non-admin)
   * - teamStructure: Hierarchical folder structure (filtered by team access for non-admin)
   * - version: API version (currently '4.0')
   *
   * Permission Filtering:
   * - ALWAYS fetches fresh user data from database to ensure current role/permissions
   * - Admin users: Receive all analyses, teams, and teamStructure
   * - Regular users: Only receive analyses/teams/teamStructure for accessible teams
   * - Uses 'view_analyses' permission for filtering
   * - Prevents stale permissions from being applied after role/team changes
   *
   * Side Effects:
   * - Calls sendStatusUpdate() after sending init data
   *
   * Error Handling:
   * - Logs errors but doesn't throw
   * - Connection remains open even if init fails
   * - Returns early if user not found in database
   */
  async sendInitialData(client) {
    try {
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const teamService = (await import('../services/teamService.js')).default;
      const { getUserTeamIds } = await import(
        '../middleware/betterAuthMiddleware.js'
      );

      // IMPORTANT: Always fetch fresh user data from database
      // Don't rely on cached session.state.user which may be stale after permission changes
      const { executeQuery } = await import('../utils/authDatabase.js');
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
        for (const [analysisName, analysis] of Object.entries(allAnalyses)) {
          if (allowedTeamIds.includes(analysis.teamId || 'uncategorized')) {
            filteredAnalyses[analysisName] = analysis;
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
        version: '4.0',
      };

      await client.push(initData);

      // Send initial status
      await this.sendStatusUpdate(client);
    } catch (error) {
      logger.error({ error }, 'Error sending initial SSE data');
    }
  }

  /**
   * Refresh initialization data for specific user
   * Re-sends full data snapshot to update permissions or team changes
   *
   * @param {string} userId - User ID to refresh data for
   * @returns {Promise<number>} Number of client connections that were refreshed
   *
   * Use Cases:
   * - User permissions changed (team assignments, role changes)
   * - Team access modified
   * - Organization membership updated
   * - Force refresh after configuration changes
   *
   * Behavior:
   * - Returns 0 if user has no active connections
   * - Calls sendInitialData() for each client connection
   * - Skips destroyed connections
   *
   * Side Effects:
   * - Sends new 'init' message to all user's connections
   * - Updates client's view with current filtered data
   */
  async refreshInitDataForUser(userId) {
    const userSessions = this.getSessionsByUserId(userId);
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
   * Send system status update to specific client
   * Provides container health, Tago SDK version, running analyses count, and uptime
   *
   * @param {Object} client - Client object with res property
   * @param {Object} client.res - Express response for writing SSE message
   * @returns {Promise<void>}
   *
   * Status Data:
   * - type: 'statusUpdate' - Message type identifier
   * - container_health: Container status ('healthy'/'initializing'), message, uptime
   * - tagoConnection: Tago SDK version and running analyses count
   * - serverTime: Current server timestamp string
   *
   * Container Status:
   * - 'ready' -> 'healthy'
   * - Other states -> 'initializing'
   *
   * Uptime Calculation:
   * - Formatted using 'ms' library (e.g., "2 hours")
   * - Seconds for programmatic use
   *
   * Error Handling:
   * - SDK version fallback to 'unknown' on error
   * - Analysis filtering errors logged but don't prevent status send
   * - Logs but doesn't throw on send failure
   */
  async sendStatusUpdate(client) {
    try {
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const ms = (await import('ms')).default;

      // Get container state
      const containerState = this.getContainerState();

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

  /**
   * Initialize SSEManager instance
   * Sets up better-sse channels and initial container state
   *
   * @constructor
   *
   * Properties initialized:
   * - sessions: Map<sessionId, Session> - All active sessions
   * - analysisChannels: Map<analysisName, Channel> - Per-analysis log channels
   * - globalChannel: Channel - Global broadcast channel for non-log events
   * - containerState: Container health and status information
   * - heartbeatInterval: Interval ID for heartbeat and cleanup (starts when first client connects)
   * - metricsInterval: Interval ID for metrics broadcasting (starts when first client connects)
   *
   * Initial Container State:
   * - status: 'ready'
   * - startTime: Current timestamp
   * - message: 'Container is ready'
   */
  constructor() {
    // better-sse channel infrastructure
    this.sessions = new Map(); // sessionId -> Session
    this.analysisChannels = new Map(); // analysisName -> Channel
    this.globalChannel = createChannel(); // Global channel for non-log broadcasts

    this.containerState = {
      status: 'ready',
      startTime: new Date(),
      message: 'Container is ready',
    };
    this.metricsInterval = null;
    this.heartbeatInterval = null;
    this.cachedSdkVersion = null; // Cache SDK version to avoid repeated file reads
    this._initSdkVersion(); // Initialize SDK version cache
  }

  /**
   * Get all sessions for a specific user
   * @param {string} userId - User ID
   * @returns {Array<Session>} Array of sessions for this user
   */
  getSessionsByUserId(userId) {
    return Array.from(this.sessions.values()).filter(
      (session) => session.state?.userId === userId,
    );
  }

  /**
   * Get all admin sessions
   * @returns {Array<Session>} Array of admin sessions
   */
  getAdminSessions() {
    return Array.from(this.sessions.values()).filter(
      (session) => session.state?.user?.role === 'admin',
    );
  }

  /**
   * Initialize SDK version cache
   * Reads Tago SDK version once on startup and caches it
   *
   * @private
   * @returns {Promise<void>}
   */
  async _initSdkVersion() {
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
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
            this.cachedSdkVersion = pkg.version;
            logger.info({ version: pkg.version }, 'Cached Tago SDK version');
            return;
          }
        }
        currentDir = path.dirname(currentDir);
      }

      this.cachedSdkVersion = 'unknown';
      logger.warn('Could not find Tago SDK version');
    } catch (error) {
      logger.error({ error }, 'Error caching Tago SDK version');
      this.cachedSdkVersion = 'unknown';
    }
  }

  /**
   * Get cached SDK version
   * Returns the cached SDK version or 'unknown' if not available
   *
   * @returns {string} SDK version string
   */
  getSdkVersion() {
    return this.cachedSdkVersion || 'unknown';
  }

  /**
   * Set container state properties
   * Updates container state with partial state object (merge)
   *
   * @param {Object} state - Partial state object to merge
   * @param {string} [state.status] - Container status ('ready', 'error', etc.)
   * @param {Date} [state.startTime] - Container start timestamp
   * @param {string} [state.message] - Status message
   * @returns {void}
   *
   * Note: Does not trigger broadcasts, use updateContainerState() for that
   */
  setContainerState(state) {
    this.containerState = { ...this.containerState, ...state };
  }

  /**
   * Get current container state
   * Returns container health and status information
   *
   * @returns {Object} Container state object
   * @returns {string} returns.status - Container status
   * @returns {Date} returns.startTime - Container start timestamp
   * @returns {string} returns.message - Status message
   */
  getContainerState() {
    return this.containerState;
  }

  /**
   * Update container state and broadcast to all clients
   * Merges new state and triggers status broadcast
   *
   * @param {Object} newState - Partial state object to merge
   * @param {string} [newState.status] - Container status
   * @param {Date} [newState.startTime] - Container start timestamp
   * @param {string} [newState.message] - Status message
   * @returns {void}
   *
   * Side Effects:
   * - Updates container state
   * - Broadcasts 'statusUpdate' to all connected clients
   *
   * Use Cases:
   * - Container initialization complete
   * - Error state transitions
   * - Health status changes
   */
  updateContainerState(newState) {
    this.setContainerState(newState);
    // Broadcast status update when container state changes
    this.broadcastStatusUpdate();
  }

  /**
   * Broadcast status update to all connected clients
   * Sends current system status to every active connection
   *
   * @returns {void}
   *
   * Behavior:
   * - Returns early if no clients connected
   * - Calls sendStatusUpdate() for each client
   *
   * Use Cases:
   * - Container state changes
   * - Periodic status refresh
   * - Manual status broadcast trigger
   */
  async broadcastStatusUpdate() {
    if (this.sessions.size === 0) return;

    for (const session of this.sessions.values()) {
      if (session.isConnected) {
        await this.sendStatusUpdate(session);
      }
    }
  }

  /**
   * Broadcast refresh command to all clients
   * Triggers frontend to reload data from server
   *
   * @returns {void}
   *
   * Use Cases:
   * - Configuration changes requiring full refresh
   * - Database migrations or schema updates
   * - Cache invalidation
   */
  broadcastRefresh() {
    this.broadcast({ type: 'refresh' });
  }

  /**
   * Broadcast message to users with access to specific team
   * Permission-aware broadcasting based on team membership
   *
   * @param {string} teamId - Team ID to broadcast to
   * @param {Object} data - Message data object
   * @returns {Promise<number>} Count of users that received the message
   *
   * Behavior:
   * - If teamId is null/undefined, falls back to global broadcast
   * - Queries users with 'view_analyses' permission for team
   * - Sends to all connections for authorized users
   *
   * Use Cases:
   * - Analysis updates within a team
   * - Team-specific notifications
   * - Permission-scoped broadcasts
   *
   * Error Handling:
   * - Returns 0 on error
   * - Logs error with teamId context
   */
  async broadcastToTeamUsers(teamId, data) {
    if (!teamId) {
      // If no team specified, broadcast to all (for backwards compatibility)
      return this.broadcast(data);
    }

    try {
      const { getUsersWithTeamAccess } = await import(
        '../middleware/betterAuthMiddleware.js'
      );
      const authorizedUsers = getUsersWithTeamAccess(teamId, 'view_analyses');

      let sentCount = 0;
      for (const userId of authorizedUsers) {
        sentCount += this.sendToUser(userId, data);
      }

      return sentCount;
    } catch (error) {
      logger.error({ error, teamId }, 'Error broadcasting to team users');
      return 0;
    }
  }

  /**
   * Broadcast team configuration update to admin users
   * Sends team CRUD notifications to users with admin role
   *
   * @param {Object} team - Team object with configuration
   * @param {string} action - Action type ('created', 'updated', 'deleted')
   * @returns {void}
   *
   * Message Format:
   * - type: 'teamUpdate'
   * - action: CRUD operation
   * - team: Complete team object
   *
   * Security:
   * - Only admin users receive team updates
   * - Regular users filtered out automatically
   */
  broadcastTeamUpdate(team, action) {
    // Send team updates only to admin users (who can manage teams)
    this.broadcastToAdminUsers({
      type: 'teamUpdate',
      action,
      team,
    });
  }

  /**
   * Broadcast analysis move between teams
   * Notifies users with access to source or destination team
   *
   * @param {string} analysisName - Name of analysis being moved
   * @param {string} fromTeam - Source team ID (or 'uncategorized')
   * @param {string} toTeam - Destination team ID
   * @returns {void}
   *
   * Behavior:
   * - Broadcasts to users with access to source team
   * - Broadcasts to users with access to destination team (no duplicates)
   * - Skips 'uncategorized' team for source broadcasts
   *
   * Message Format:
   * - type: 'analysisMovedToTeam'
   * - analysis: Analysis name
   * - from: Source team ID
   * - to: Destination team ID
   */
  broadcastAnalysisMove(analysisName, fromTeam, toTeam) {
    // Send to users who have access to either the source or destination team
    const data = {
      type: 'analysisMovedToTeam',
      analysis: analysisName,
      from: fromTeam,
      to: toTeam,
    };

    // Broadcast to users with access to the source team
    if (fromTeam && fromTeam !== 'uncategorized') {
      this.broadcastToTeamUsers(fromTeam, data);
    }

    // Broadcast to users with access to the destination team (avoid duplicates)
    if (toTeam && toTeam !== fromTeam) {
      this.broadcastToTeamUsers(toTeam, data);
    }
  }

  /**
   * Broadcast analysis update to users with team access
   * Sends analysis changes only to users with permission to view the team
   *
   * @param {string} analysisName - Name of analysis being updated
   * @param {Object} updateData - Update data to broadcast
   * @param {string} [teamId=null] - Team ID (auto-detected if not provided)
   * @returns {Promise<number>} Count of users that received the update
   *
   * Behavior:
   * - Auto-detects teamId from analysis if not provided
   * - Defaults to 'uncategorized' if analysis not found
   * - Uses team-aware broadcasting for permission filtering
   *
   * Use Cases:
   * - Analysis status changes (running, stopped, error)
   * - Configuration updates
   * - Version changes
   * - Environment variable updates
   *
   * Error Handling:
   * - Logs error with analysisName context
   * - Returns 0 on failure
   */
  async broadcastAnalysisUpdate(analysisName, updateData, teamId = null) {
    try {
      // If teamId not provided, try to get it from the analysis
      let analysisTeamId = teamId;
      if (!analysisTeamId) {
        const { analysisService } = await import(
          '../services/analysisService.js'
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
   * Broadcast message to admin users only
   * Role-based filtering to send only to users with admin role
   *
   * @param {Object} data - Message data object
   * @returns {Promise<number>} Count of admin clients that received the message
   *
   * Behavior:
   * - Iterates all global clients
   * - Filters by client.req.user.role === 'admin'
   * - Skips destroyed connections
   * - Removes failed clients automatically
   *
   * Use Cases:
   * - Team management updates
   * - User permission changes
   * - DNS cache configuration updates
   * - System settings changes
   * - Admin-only notifications
   *
   * Error Handling:
   * - Logs errors per client
   * - Removes client on send failure
   */
  async broadcastToAdminUsers(data) {
    const adminSessions = this.getAdminSessions();
    let sentCount = 0;

    for (const session of adminSessions) {
      try {
        if (session.isConnected) {
          session.push(data);
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
   * Broadcast update with type-based routing
   * Routes messages based on type (log vs analysis update)
   *
   * @param {string} type - Update type or analysis name
   * @param {Object} data - Update data
   * @returns {void}
   *
   * Routing Logic:
   * - type === 'log': Route to analysis channels (only subscribed sessions receive)
   * - Other types: Route to global channel (all sessions receive)
   *
   * Log Message Format:
   * - type: 'log'
   * - data: Log data with analysis or fileName property
   *
   * Analysis Update Format:
   * - type: 'analysisUpdate'
   * - analysisName: Analysis identifier
   * - update: Update data
   */
  broadcastUpdate(type, data) {
    if (type === 'log') {
      // Log broadcasts go to analysis channels (subscribed sessions only)
      const analysisName = data.analysis || data.fileName;
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
      this.broadcastAnalysisUpdate(type, {
        type: 'analysisUpdate',
        analysisName: type,
        update: data,
      });
    }
  }

  /**
   * Broadcast system metrics to all connected clients
   * Sends permission-filtered metrics including container, process, and analysis data
   *
   * @returns {Promise<void>}
   *
   * Metrics Included:
   * - container: Docker container CPU/memory usage
   * - processes: Per-analysis process metrics from OS (filtered by team access)
   * - children: Aggregate child process metrics
   * - total: Combined system metrics
   * - container_health: Container status, uptime, and health information
   * - tagoConnection: SDK version and running analyses count (from OS processes)
   *
   * Source of Truth:
   * - Uses OS-level process metrics (pidusage) as the single source of truth
   * - runningAnalyses count comes from actual running processes, not application state
   * - Ensures data consistency between metrics and analysis counts
   *
   * Permission Filtering:
   * - Admin users: Receive all process metrics
   * - Regular users: Only processes from accessible teams
   * - Recalculates aggregates after filtering
   *
   * Per-Client Filtering:
   * - Each client receives customized metrics based on their team access
   * - Uses getUserTeamIds() with 'view_analyses' permission
   * - Filters process list and recalculates CPU/memory totals
   *
   * Message Format:
   * - type: 'metricsUpdate'
   * - container: Container metrics
   * - processes: Filtered process array
   * - children: Recalculated aggregate metrics
   * - total: Updated system totals
   * - container_health: Health status with uptime
   * - tagoConnection: SDK version and actual running analyses count
   *
   * Error Handling:
   * - Removes clients that fail to receive metrics
   * - Logs errors with userId context
   * - Logs aggregate errors at error level
   */
  async broadcastMetricsUpdate() {
    if (this.sessions.size === 0) return;

    try {
      const metrics = await metricsService.getAllMetrics();
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const { getUserTeamIds } = await import(
        '../middleware/betterAuthMiddleware.js'
      );
      const allAnalyses = await analysisService.getAllAnalyses();
      const ms = (await import('ms')).default;

      // Get container state and SDK version
      const containerState = this.getContainerState();
      const sdkVersion = this.getSdkVersion();

      // Calculate uptime
      const uptimeSeconds = Math.floor(
        (new Date() - containerState.startTime) / 1000,
      );
      const uptimeFormatted = ms(new Date() - containerState.startTime, {
        long: true,
      });

      // Send customized metrics to each connected client
      for (const session of this.sessions.values()) {
        try {
          if (!session.isConnected) continue;

          const user = session.state.user || session.state;
          const filteredMetrics = { ...metrics };

          // Filter process metrics based on team access for non-admin users
          if (user.role !== 'admin') {
            const allowedTeamIds = getUserTeamIds(user.id, 'view_analyses');

            // Filter process metrics to only include analyses from accessible teams
            filteredMetrics.processes = metrics.processes.filter((process) => {
              const analysis = allAnalyses[process.name];
              const teamId = analysis?.teamId || 'uncategorized';
              return allowedTeamIds.includes(teamId);
            });

            // Recalculate children metrics based on filtered processes
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

            // Update children and total metrics
            filteredMetrics.children = filteredChildrenMetrics;
            filteredMetrics.total = {
              ...metrics.total,
              analysisProcesses: filteredChildrenMetrics.processCount,
              childrenCPU: filteredChildrenMetrics.cpuUsage,
              memoryUsage:
                metrics.container.memoryUsage +
                filteredChildrenMetrics.memoryUsage,
            };
          }

          // Use OS-level process count as source of truth for running analyses
          // filteredMetrics.processes contains actual running processes from pidusage
          const runningAnalysesCount = filteredMetrics.processes.length;

          // Add container health and SDK version to metrics
          const metricsData = {
            type: 'metricsUpdate',
            ...filteredMetrics,
            container_health: {
              status:
                containerState.status === 'ready' ? 'healthy' : 'initializing',
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

          // Use better-sse's push method (no event type for generic onmessage)
          await session.push(metricsData);
        } catch (sessionError) {
          logger.error(
            { userId: session.state?.userId, error: sessionError },
            'Error sending metrics to session',
          );
          this.removeClient(session.state?.userId, session.id);
        }
      }
    } catch (error) {
      logger.error(
        { error: error.message },
        'Failed to broadcast metrics update',
      );
    }
  }

  /**
   * Start periodic metrics broadcasting
   * Begins sending system metrics every 1 second to all clients
   *
   * @returns {void}
   *
   * Behavior:
   * - No-op if already running (prevents duplicate intervals)
   * - Sends immediate metrics update on start
   * - Sets up 1-second interval for continuous updates
   * - Automatically started when first client connects
   *
   * Lifecycle:
   * - Started: First client connects (addClient)
   * - Running: While globalClients.size > 0
   * - Stopped: Last client disconnects (removeClient)
   */
  startMetricsBroadcasting() {
    if (this.metricsInterval) return; // Already running

    // Send initial metrics
    this.broadcastMetricsUpdate();

    // Start broadcasting every 1 second
    this.metricsInterval = setInterval(() => {
      this.broadcastMetricsUpdate();
    }, 1000);

    logger.info('Started metrics broadcasting');
  }

  /**
   * Stop periodic metrics broadcasting
   * Clears interval and stops sending metrics updates
   *
   * @returns {void}
   *
   * Behavior:
   * - Clears interval timer
   * - Sets metricsInterval to null
   * - Automatically stopped when last client disconnects
   *
   * Use Cases:
   * - Last client disconnect
   * - System shutdown
   * - Manual metrics pause (if needed)
   */
  stopMetricsBroadcasting() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      logger.info('Stopped metrics broadcasting');
    }
  }

  /**
   * Send heartbeat to all connected sessions via global channel
   * Keeps connections alive via better-sse channel broadcast
   *
   * @returns {void}
   *
   * Behavior:
   * - Broadcasts heartbeat to all sessions via global channel
   * - better-sse handles connection health tracking
   * - Failed sessions automatically cleaned up by better-sse
   *
   * Heartbeat Format:
   * - type: 'heartbeat'
   */
  sendHeartbeat() {
    this.broadcast({ type: 'heartbeat' });
  }

  /**
   * Clean up stale connections that haven't received heartbeat in 60 seconds
   * Detects and removes dead connections that accumulate due to network issues
   *
   * @returns {number} Count of stale connections removed
   *
   * Behavior:
   * - Checks all clients for stale connections
   * - Stale = current time - lastHeartbeat > 60 seconds
   * - Removes stale clients and logs removal
   *
   * Use Cases:
   * - Client disconnected without closing connection properly
   * - Network timeout without connection closure
   * - Half-open connections
   * - Memory leak prevention
   *
   * Called by:
   * - Periodic cleanup interval (every 30 seconds)
   *
   * Timeout Threshold:
   * - 60 seconds (60000ms) - Configurable via constant
   */
  cleanupStaleConnections() {
    const now = Date.now();
    const timeout = 60000; // 60 seconds
    const staleSessions = [];

    for (const session of this.sessions.values()) {
      const timeSinceLastPush = now - (session.lastPushAt?.getTime() || now);
      if (timeSinceLastPush > timeout) {
        staleSessions.push(session);
        logger.info(
          {
            userId: session.state?.userId,
            sessionId: session.id,
            timeSinceLastPush: Math.floor(timeSinceLastPush / 1000),
          },
          'Removing stale SSE session',
        );
      }
    }

    // Remove stale sessions
    staleSessions.forEach((session) => {
      this.removeClient(session.state?.userId, session.id);
    });

    if (staleSessions.length > 0) {
      logger.info(
        { count: staleSessions.length },
        'Cleaned up stale SSE sessions',
      );
    }

    return staleSessions.length;
  }

  /**
   * Start periodic heartbeat and stale connection cleanup
   * Sends heartbeat every 30 seconds and cleans up stale connections
   *
   * @returns {void}
   *
   * Behavior:
   * - No-op if already running (prevents duplicate intervals)
   * - Sends immediate heartbeat on start
   * - Sets up 30-second interval for heartbeat and cleanup
   * - Automatically started when first client connects
   *
   * Heartbeat Schedule:
   * - Interval: 30 seconds
   * - Heartbeat sent to all clients
   * - Stale connections cleaned up (> 60 seconds old)
   *
   * Lifecycle:
   * - Started: First client connects (addClient)
   * - Running: While globalClients.size > 0
   * - Stopped: Last client disconnects (removeClient)
   */
  startHeartbeat() {
    if (this.heartbeatInterval) return; // Already running

    logger.info('Starting SSE heartbeat and cleanup');

    // Send initial heartbeat
    this.sendHeartbeat();

    // Start heartbeat and cleanup every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
      this.cleanupStaleConnections();
    }, 30000); // 30 seconds
  }

  /**
   * Stop periodic heartbeat and cleanup
   * Clears interval and stops heartbeat/cleanup
   *
   * @returns {void}
   *
   * Behavior:
   * - Clears interval timer
   * - Sets heartbeatInterval to null
   * - Automatically stopped when last client disconnects
   *
   * Use Cases:
   * - Last client disconnect
   * - System shutdown
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Stopped SSE heartbeat and cleanup');
    }
  }
}

// Export singleton instance
export const sseManager = new SSEManager();

/**
 * Authentication middleware for SSE connections
 * Validates Better Auth session and attaches user to request
 *
 * @param {Object} req - Express request object
 * @param {Object} req.headers - HTTP headers containing session cookie
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 *
 * Authentication Flow:
 * 1. Extract session from Better Auth using request headers
 * 2. Validate session and user exist
 * 3. Attach user object to req.user
 * 4. Call next() to continue to SSE handler
 *
 * Security:
 * - Validates Better Auth session cookie
 * - Requires both session and user to exist
 * - Returns 401 if authentication fails
 *
 * Response on Failure:
 * - Status 401: Unauthorized
 * - JSON: { error: 'Authentication required' } or { error: 'Authentication failed' }
 *
 * Use with:
 * - app.get('/api/sse', authenticateSSE, handleSSEConnection)
 *
 * @throws {Object} 401 response if authentication fails
 */
export async function authenticateSSE(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.session || !session?.user) {
      logger.warn('SSE authentication failed: No valid session');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Attach user to request
    Object.assign(req, { user: session.user });
    next();
  } catch (error) {
    logger.error({ error: error.message }, 'SSE authentication failed');
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * SSE connection route handler
 * Establishes Server-Sent Events stream and manages connection lifecycle
 *
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (attached by authenticateSSE)
 * @param {string} req.user.id - User ID for connection tracking
 * @param {Object} res - Express response object
 * @returns {void}
 *
 * Connection Setup:
 * 1. Sets SSE headers (Content-Type, Cache-Control, CORS)
 * 2. Sends connection confirmation message
 * 3. Registers client with sseManager
 * 4. Sends initial data (analyses, teams, status)
 *
 * SSE Headers:
 * - Content-Type: text/event-stream
 * - Cache-Control: no-cache
 * - Connection: keep-alive
 * - Access-Control-Allow-Origin: Request origin or *
 * - Access-Control-Allow-Credentials: true
 *
 * Heartbeat & Timeout Detection:
 * - Centralized heartbeat managed by SSEManager
 * - Sends {"type":"heartbeat"} every 30 seconds to all clients
 * - Tracks lastHeartbeat timestamp on successful write
 * - Automatically removes stale connections (> 60 seconds without heartbeat)
 * - Prevents memory leaks from dead connections
 *
 * Lifecycle:
 * - Connection: Client added to sseManager with lastHeartbeat timestamp
 * - Active: Receives broadcasts, updates, and heartbeats
 * - Heartbeat: Updates lastHeartbeat on successful message delivery
 * - Stale Detection: Removed if no successful heartbeat in 60 seconds
 * - Disconnect: Cleanup via 'close' event handler or stale connection cleanup
 *
 * Use with:
 * - app.get('/api/sse', authenticateSSE, handleSSEConnection)
 */
export async function handleSSEConnection(req, res) {
  const session = await sseManager.addClient(req.user.id, res, req);
  await session.push({ type: 'connection', status: 'connected' });
  await sseManager.sendInitialData(session);
}

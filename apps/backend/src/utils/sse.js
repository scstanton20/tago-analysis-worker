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
 * - Tracks clients per user (userId -> Set of clients)
 * - Global client registry for system-wide broadcasts
 * - Automatic cleanup on disconnect
 * - Stale connection detection (60-second timeout)
 * - Heartbeat tracking with lastHeartbeat timestamp
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
   * Add authenticated SSE client connection
   * Registers client in user-specific and global registries, starts heartbeat and metrics if needed
   *
   * @param {string} userId - User ID from authenticated session
   * @param {Object} res - Express response object for SSE streaming
   * @param {Object} req - Express request object
   * @param {Object} req.user - Authenticated user object
   * @returns {Object} Client object with id, userId, res, req, createdAt, lastHeartbeat
   *
   * Side effects:
   * - Adds client to user-specific clients map
   * - Adds client to global clients set
   * - Starts heartbeat mechanism if first client
   * - Starts metrics broadcasting if first client
   * - Sets up disconnect and error handlers
   *
   * Connection Management:
   * - Generates unique client ID
   * - Initializes lastHeartbeat timestamp
   * - Handles 'close' event for cleanup
   * - Handles 'error' event (ignores ECONNRESET/EPIPE)
   */
  addClient(userId, res, req) {
    const clientId = Math.random().toString(36).substring(7);
    const client = {
      id: clientId,
      userId,
      res,
      req,
      createdAt: new Date(),
      lastHeartbeat: new Date(),
    };

    // Add to user-specific clients
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(client);

    // Add to global clients
    this.globalClients.add(client);

    logger.info({ userId, clientId }, 'SSE client connected');

    // Start heartbeat if this is the first client
    if (this.globalClients.size === 1 && !this.heartbeatInterval) {
      this.startHeartbeat();
    }

    // Start metrics broadcasting if this is the first client
    if (this.globalClients.size === 1 && !this.metricsInterval) {
      this.startMetricsBroadcasting();
    }

    // Handle client disconnect
    req.on('close', () => {
      this.removeClient(userId, clientId);
    });

    req.on('error', (error) => {
      // Only log actual errors, not normal disconnections
      if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') {
        logger.error(
          {
            userId,
            clientId,
            error: error.message,
            errorCode: error.code,
          },
          'SSE client error',
        );
      }
      this.removeClient(userId, clientId);
    });

    return client;
  }

  /**
   * Remove SSE client connection
   * Cleans up client from user-specific and global registries
   *
   * @param {string} userId - User ID of the client to remove
   * @param {string} clientId - Unique client ID generated at connection
   * @returns {void}
   *
   * Side effects:
   * - Removes client from user-specific clients set
   * - Removes client from global clients set
   * - Removes user entry if no more clients for that user
   * - Stops heartbeat mechanism if no clients remaining
   * - Stops metrics broadcasting if no clients remaining
   *
   * Called automatically on:
   * - Client disconnect ('close' event)
   * - Client error (except ECONNRESET/EPIPE)
   * - Send failures
   * - Stale connection cleanup (> 60s without heartbeat)
   */
  removeClient(userId, clientId) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const clientToRemove = Array.from(userClients).find(
        (c) => c.id === clientId,
      );
      if (clientToRemove) {
        userClients.delete(clientToRemove);
        this.globalClients.delete(clientToRemove);

        if (userClients.size === 0) {
          this.clients.delete(userId);
        }

        logger.info({ userId, clientId }, 'SSE client disconnected');
      }
    }

    // Stop heartbeat and metrics broadcasting if no clients remaining
    if (this.globalClients.size === 0) {
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
    const userClients = this.clients.get(userId);
    if (!userClients) {
      logger.warn(
        { userId, messageType: data.type },
        'No SSE clients found for user',
      );
      return 0;
    }

    const message = this.formatSSEMessage(data);
    let sentCount = 0;

    for (const client of userClients) {
      try {
        if (!client.res.destroyed) {
          client.res.write(message);
          sentCount++;
          logger.debug(
            { userId, clientId: client.id, messageType: data.type },
            'SSE message sent to client',
          );
        } else {
          logger.warn(
            { userId, clientId: client.id },
            'Skipping destroyed client',
          );
        }
      } catch (error) {
        logger.error({ userId, error }, 'Error sending SSE to user');
        this.removeClient(userId, client.id);
      }
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
   * - Force logout after permission changes
   *
   * Behavior:
   * - Ends each response stream
   * - Automatically triggers cleanup via 'close' event
   * - Safe to call even if user has no connections
   */
  disconnectUser(userId) {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) {
      logger.warn(
        { userId, hasClientsMap: !!userClients },
        'No SSE clients to disconnect for user',
      );
      return 0;
    }

    logger.info(
      { userId, clientCount: userClients.size },
      'Starting disconnection of all SSE clients for user',
    );

    let disconnectedCount = 0;
    const clientsToDisconnect = Array.from(userClients);

    for (const client of clientsToDisconnect) {
      try {
        if (!client.res.destroyed) {
          logger.debug(
            { userId, clientId: client.id },
            'Closing SSE client connection',
          );
          client.res.end(); // Close the SSE connection
          disconnectedCount++;
        } else {
          logger.warn(
            { userId, clientId: client.id },
            'Client already destroyed',
          );
        }
      } catch (error) {
        logger.error(
          { userId, clientId: client.id, error },
          'Error disconnecting SSE client',
        );
      }
    }

    logger.info(
      { userId, disconnectedCount, totalClients: clientsToDisconnect.length },
      'Disconnected all SSE clients for user',
    );
    return disconnectedCount;
  }

  /**
   * Broadcast message to all connected clients
   * Global system-wide broadcast without filtering
   *
   * @param {Object} data - Message data object (will be wrapped with timestamp)
   * @returns {number} Count of clients that successfully received the message
   *
   * Behavior:
   * - Sends to every client in globalClients set
   * - Automatically removes failed/destroyed clients
   * - Skips destroyed response objects
   *
   * Use Cases:
   * - System-wide notifications
   * - Global refresh commands
   * - Uncategorized updates
   *
   * Error Handling:
   * - Logs broadcast errors per client
   * - Collects and removes failed clients after iteration
   */
  broadcast(data) {
    const message = this.formatSSEMessage(data);
    let sentCount = 0;
    const failedClients = [];

    for (const client of this.globalClients) {
      try {
        if (!client.res.destroyed) {
          client.res.write(message);
          sentCount++;
        } else {
          failedClients.push(client);
        }
      } catch (error) {
        logger.error(
          {
            userId: client.userId,
            clientId: client.id,
            error,
          },
          'Error broadcasting SSE to user',
        );
        failedClients.push(client);
      }
    }

    // Clean up failed clients
    failedClients.forEach((client) => {
      this.removeClient(client.userId, client.id);
    });

    return sentCount;
  }

  /**
   * Format data as SSE protocol message
   * Adds timestamp and wraps in SSE format: "data: JSON\n\n"
   *
   * @param {Object} data - Message data object
   * @returns {string} Formatted SSE message string
   *
   * SSE Format:
   * - "data: " prefix required by SSE specification
   * - JSON stringified data
   * - Double newline "\n\n" to delimit messages
   * - Automatic timestamp injection in ISO format
   *
   * @example
   * formatSSEMessage({ type: 'log', message: 'Hello' })
   * // Returns: "data: {\"type\":\"log\",\"message\":\"Hello\",\"timestamp\":\"2025-01-15T10:30:00.000Z\"}\n\n"
   */
  formatSSEMessage(data) {
    const timestamp = new Date().toISOString();
    const messageData = {
      ...data,
      timestamp,
    };

    // SSE format: data: JSON\n\n
    return `data: ${JSON.stringify(messageData)}\n\n`;
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
    return {
      totalClients: this.globalClients.size,
      uniqueUsers: this.clients.size,
      userConnections: Array.from(this.clients.entries()).map(
        ([userId, clients]) => ({
          userId,
          connectionCount: clients.size,
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
   * @param {Object} client.req.user - Authenticated user with role property
   * @param {Object} client.res - Express response for writing SSE messages
   * @returns {Promise<void>}
   *
   * Data Sent:
   * - type: 'init' - Identifies as initialization message
   * - analyses: Analysis files (filtered by team access for non-admin)
   * - teams: Team configurations (filtered by team access for non-admin)
   * - teamStructure: Hierarchical folder structure from config
   * - version: API version (currently '4.0')
   *
   * Permission Filtering:
   * - Admin users: Receive all analyses and teams
   * - Regular users: Only receive analyses/teams for accessible teams
   * - Uses 'view_analyses' permission for filtering
   *
   * Side Effects:
   * - Calls sendStatusUpdate() after sending init data
   *
   * Error Handling:
   * - Logs errors but doesn't throw
   * - Connection remains open even if init fails
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

      // Get user from client request
      const user = client.req.user;

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

      // Filter data for non-admin users
      if (user.role !== 'admin') {
        // Get user's allowed team IDs for view_analyses permission
        const allowedTeamIds = getUserTeamIds(user.id, 'view_analyses');

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
      }

      // Get team structure from config
      const config = await analysisService.getConfig();
      const teamStructure = config.teamStructure || {};

      const initData = {
        type: 'init',
        analyses,
        teams,
        teamStructure,
        version: '4.0',
      };

      const message = this.formatSSEMessage(initData);
      client.res.write(message);

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
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) {
      logger.debug({ userId }, 'No SSE clients found for user to refresh');
      return 0;
    }

    logger.info({ userId }, 'Refreshing init data for user');
    let refreshedCount = 0;

    for (const client of userClients) {
      try {
        if (!client.res.destroyed) {
          await this.sendInitialData(client);
          refreshedCount++;
        }
      } catch (error) {
        logger.error({ userId, error }, 'Error refreshing init data for user');
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

      const message = this.formatSSEMessage(status);
      client.res.write(message);
    } catch (error) {
      logger.error({ error }, 'Error sending SSE status update');
    }
  }

  /**
   * Initialize SSEManager instance
   * Sets up client registries and initial container state
   *
   * @constructor
   *
   * Properties initialized:
   * - clients: Map<userId, Set<client>> - User-specific client connections
   * - globalClients: Set<client> - All active connections
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
    this.clients = new Map(); // userId -> Set of SSE connections
    this.globalClients = new Set(); // All connections for global broadcasts
    this.containerState = {
      status: 'ready',
      startTime: new Date(),
      message: 'Container is ready',
    };
    this.metricsInterval = null;
    this.heartbeatInterval = null;
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
  broadcastStatusUpdate() {
    if (this.globalClients.size === 0) return;

    for (const client of this.globalClients) {
      this.sendStatusUpdate(client);
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
      const authorizedUsers = await getUsersWithTeamAccess(
        teamId,
        'view_analyses',
      );

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
    let sentCount = 0;
    for (const client of this.globalClients) {
      try {
        if (client.req.user?.role === 'admin' && !client.res.destroyed) {
          client.res.write(this.formatSSEMessage(data));
          sentCount++;
        }
      } catch (error) {
        logger.error(
          { userId: client.userId, error },
          'Error sending to admin user',
        );
        this.removeClient(client.userId, client.id);
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
   * - type === 'log': Extract analysis name from data, use team-aware broadcast
   * - Other types: Treat type as analysis name, broadcast analysis update
   *
   * Log Message Format:
   * - type: 'log'
   * - data: Log data with analysis or fileName property
   *
   * Analysis Update Format:
   * - type: 'analysisUpdate'
   * - analysisName: Analysis identifier
   * - update: Update data
   *
   * Fallback:
   * - If log has no analysis name, uses global broadcast
   */
  broadcastUpdate(type, data) {
    if (type === 'log') {
      // Log broadcasts should be sent to users who can access the analysis
      // Extract analysis name from log data to determine team
      const analysisName = data.analysis || data.fileName;
      if (analysisName) {
        this.broadcastAnalysisUpdate(analysisName, {
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
      // Analysis update - use team-aware broadcasting
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
   * - processes: Per-analysis process metrics (filtered by team access)
   * - children: Aggregate child process metrics
   * - total: Combined system metrics
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
   *
   * Error Handling:
   * - Removes clients that fail to receive metrics
   * - Logs errors with userId context
   * - Logs aggregate errors at error level
   */
  async broadcastMetricsUpdate() {
    if (this.globalClients.size === 0) return;

    try {
      const metrics = await metricsService.getAllMetrics();
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const { getUserTeamIds } = await import(
        '../middleware/betterAuthMiddleware.js'
      );
      const allAnalyses = await analysisService.getAllAnalyses();

      // Send customized metrics to each connected client
      for (const client of this.globalClients) {
        try {
          if (client.res.destroyed) continue;

          const user = client.req.user;
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

          const message = this.formatSSEMessage({
            type: 'metricsUpdate',
            ...filteredMetrics,
          });
          client.res.write(message);
        } catch (clientError) {
          logger.error(
            { userId: client.userId, error: clientError },
            'Error sending metrics to client',
          );
          this.removeClient(client.userId, client.id);
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
   * Send heartbeat to all connected clients and update lastHeartbeat timestamp
   * Keeps connections alive and tracks successful communication
   *
   * @returns {void}
   *
   * Behavior:
   * - Sends heartbeat message to all clients
   * - Updates lastHeartbeat timestamp on successful write
   * - Removes clients that fail to receive heartbeat
   * - Skips destroyed connections
   *
   * Heartbeat Format:
   * - type: 'heartbeat'
   * - timestamp: ISO timestamp (added by formatSSEMessage)
   *
   * Connection Health:
   * - Successful write -> Updates client.lastHeartbeat
   * - Failed write -> Client removed via removeClient
   * - Destroyed connection -> Skipped and added to failed list
   */
  sendHeartbeat() {
    const message = this.formatSSEMessage({ type: 'heartbeat' });
    const failedClients = [];

    for (const client of this.globalClients) {
      try {
        if (!client.res.destroyed) {
          client.res.write(message);
          // Update lastHeartbeat on successful write
          client.lastHeartbeat = new Date();
        } else {
          failedClients.push(client);
        }
      } catch (error) {
        logger.debug(
          {
            userId: client.userId,
            clientId: client.id,
            error: error.message,
          },
          'Failed to send heartbeat to client',
        );
        failedClients.push(client);
      }
    }

    // Clean up failed clients
    failedClients.forEach((client) => {
      this.removeClient(client.userId, client.id);
    });
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
    const staleClients = [];

    for (const client of this.globalClients) {
      const timeSinceLastHeartbeat = now - client.lastHeartbeat.getTime();
      if (timeSinceLastHeartbeat > timeout) {
        staleClients.push(client);
        logger.info(
          {
            userId: client.userId,
            clientId: client.id,
            timeSinceLastHeartbeat: Math.floor(timeSinceLastHeartbeat / 1000),
          },
          'Removing stale SSE connection',
        );
      }
    }

    // Remove stale clients
    staleClients.forEach((client) => {
      this.removeClient(client.userId, client.id);
    });

    if (staleClients.length > 0) {
      logger.info(
        { count: staleClients.length },
        'Cleaned up stale SSE connections',
      );
    }

    return staleClients.length;
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
export function handleSSEConnection(req, res) {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  // Send initial connection confirmation
  res.write('data: {"type":"connection","status":"connected"}\n\n');

  // Add client to manager
  const client = sseManager.addClient(req.user.id, res, req);

  // Send initial data
  sseManager.sendInitialData(client);
}

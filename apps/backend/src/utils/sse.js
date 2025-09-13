// backend/src/utils/sse.js
import { auth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { createChildLogger } from './logging/logger.js';
import { metricsService } from '../services/metricsService.js';

const logger = createChildLogger('sse');

class SSEManager {
  // Add authenticated SSE client
  addClient(userId, res, req) {
    const clientId = Math.random().toString(36).substring(7);
    const client = {
      id: clientId,
      userId,
      res,
      req,
      createdAt: new Date(),
    };

    // Add to user-specific clients
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(client);

    // Add to global clients
    this.globalClients.add(client);

    logger.info({ userId, clientId }, 'SSE client connected');

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

  // Remove SSE client
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

    // Stop metrics broadcasting if no clients remaining
    if (this.globalClients.size === 0) {
      this.stopMetricsBroadcasting();
    }
  }

  // Send message to specific user's connections
  sendToUser(userId, data) {
    const userClients = this.clients.get(userId);
    if (!userClients) return 0;

    const message = this.formatSSEMessage(data);
    let sentCount = 0;

    for (const client of userClients) {
      try {
        if (!client.res.destroyed) {
          client.res.write(message);
          sentCount++;
        }
      } catch (error) {
        logger.error({ userId, error }, 'Error sending SSE to user');
        this.removeClient(userId, client.id);
      }
    }

    return sentCount;
  }

  // Broadcast to all connected clients
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

  // Format data as SSE message
  formatSSEMessage(data) {
    const timestamp = new Date().toISOString();
    const messageData = {
      ...data,
      timestamp,
    };

    // SSE format: data: JSON\n\n
    return `data: ${JSON.stringify(messageData)}\n\n`;
  }

  // Get connection stats
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

  // Send initial data to a client
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

      const initData = {
        type: 'init',
        analyses,
        teams,
        version: '3.0',
      };

      const message = this.formatSSEMessage(initData);
      client.res.write(message);

      // Send initial status
      await this.sendStatusUpdate(client);
    } catch (error) {
      logger.error({ error }, 'Error sending initial SSE data');
    }
  }

  // Send status update to specific client
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

  // Container state management
  constructor() {
    this.clients = new Map(); // userId -> Set of SSE connections
    this.globalClients = new Set(); // All connections for global broadcasts
    this.containerState = {
      status: 'ready',
      startTime: new Date(),
      message: 'Container is ready',
    };
    this.metricsInterval = null;
  }

  setContainerState(state) {
    this.containerState = { ...this.containerState, ...state };
  }

  getContainerState() {
    return this.containerState;
  }

  updateContainerState(newState) {
    this.setContainerState(newState);
    // Broadcast status update when container state changes
    this.broadcastStatusUpdate();
  }

  // Broadcast status update to all clients
  broadcastStatusUpdate() {
    if (this.globalClients.size === 0) return;

    for (const client of this.globalClients) {
      this.sendStatusUpdate(client);
    }
  }

  // Enhanced broadcast functions
  broadcastRefresh() {
    this.broadcast({ type: 'refresh' });
  }

  // Team-aware broadcast that only sends to users with access to the team
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

  broadcastTeamUpdate(team, action) {
    // Send team updates only to admin users (who can manage teams)
    this.broadcastToAdminUsers({
      type: 'teamUpdate',
      action,
      team,
    });
  }

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

  // Broadcast analysis updates only to users with access to the analysis's team
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

  // Broadcast only to admin users
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

  // Metrics broadcasting methods - team-aware
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

  stopMetricsBroadcasting() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      logger.info('Stopped metrics broadcasting');
    }
  }
}

// Export singleton instance
export const sseManager = new SSEManager();

// Authentication middleware for SSE using Better Auth
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

// SSE route handler
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

  // Keep connection alive with periodic heartbeat
  const heartbeatInterval = setInterval(() => {
    if (!res.destroyed) {
      res.write('data: {"type":"heartbeat"}\n\n');
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000); // 30 seconds

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
  });
}

/**
 * Core SSE Manager - Orchestrator for all SSE operations
 * Singleton instance for application-wide use
 *
 * This is the main orchestrator that coordinates all SSE functionality
 * by delegating to specialized service modules.
 */

import { createChannel } from 'better-sse';

import { SessionManager } from './SessionManager.js';
import { ChannelManager } from './ChannelManager.js';
import { BroadcastService } from './BroadcastService.js';
import { InitDataService } from './InitDataService.js';
import { HeartbeatService } from './HeartbeatService.js';
import { getTagoSdkVersion } from '../sdkVersion.js';

export class SSEManager {
  /**
   * Initialize SSEManager
   * Extracted from sse.js lines 965-980
   */
  constructor() {
    // Infrastructure (owned by SSEManager)
    this.sessions = new Map(); // sessionId -> Session
    this.analysisChannels = new Map(); // analysisId -> Channel
    this.globalChannel = createChannel(); // Global channel for non-log broadcasts
    this.sessionLastPush = new Map(); // sessionId -> timestamp (independent tracking for stale detection)

    this.containerState = {
      status: 'ready',
      startTime: new Date(),
      message: 'Container is ready',
    };
    this.metricsInterval = null;
    this.heartbeatInterval = null;

    // Service instances (composition pattern)
    this.sessionManager = new SessionManager(this);
    this.channelManager = new ChannelManager(this);
    this.broadcastService = new BroadcastService(this);
    this.initDataService = new InitDataService(this);
    this.heartbeatService = new HeartbeatService(this);
  }

  /**
   * Get cached SDK version
   * Uses centralized sdkVersion utility
   * @returns {string} SDK version
   */
  getSdkVersion() {
    return getTagoSdkVersion();
  }

  /**
   * Get container state
   * Extracted from sse.js lines 1078-1080
   * @returns {ContainerState} Container state
   */
  getContainerState() {
    return this.containerState;
  }

  /**
   * Set container state (no broadcast)
   * Extracted from sse.js lines 1065-1067
   * @param {Partial<ContainerState>} state - Partial state to merge
   * @returns {void}
   */
  setContainerState(state) {
    this.containerState = { ...this.containerState, ...state };
  }

  /**
   * Update container state and broadcast
   * Extracted from sse.js lines 1101-1105
   * @param {Partial<ContainerState>} newState - New state
   * @returns {void}
   */
  updateContainerState(newState) {
    this.setContainerState(newState);
    this.broadcastService.broadcastStatusUpdate();
  }

  /**
   * Get connection statistics
   * Extracted from sse.js lines 628-648
   * @returns {Object} Stats object
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
   * Get all admin sessions
   * Helper method for filtering
   * @returns {Array<Session>} Admin sessions
   */
  getAdminSessions() {
    return this.sessionManager.getAdminSessions();
  }

  // ========================================================================
  // Session Management (delegates to SessionManager)
  // ========================================================================

  async addClient(userId, res, req) {
    return this.sessionManager.addClient(userId, res, req);
  }

  async removeClient(userId, sessionId) {
    return this.sessionManager.removeClient(userId, sessionId);
  }

  async sendToUser(userId, data) {
    return this.sessionManager.sendToUser(userId, data);
  }

  disconnectUser(userId) {
    return this.sessionManager.disconnectUser(userId);
  }

  async forceUserLogout(userId, reason) {
    return this.sessionManager.forceUserLogout(userId, reason);
  }

  findSessionById(sessionId) {
    return this.sessionManager.findSessionById(sessionId);
  }

  getSessionsByUserId(userId) {
    return this.sessionManager.getSessionsByUserId(userId);
  }

  // ========================================================================
  // Channel Management (delegates to ChannelManager)
  // ========================================================================

  getOrCreateAnalysisChannel(analysisId) {
    return this.channelManager.getOrCreateAnalysisChannel(analysisId);
  }

  async subscribeToAnalysis(sessionId, analysisIds, userId) {
    return this.channelManager.subscribeToAnalysis(
      sessionId,
      analysisIds,
      userId,
    );
  }

  async unsubscribeFromAnalysis(sessionId, analysisIds) {
    return this.channelManager.unsubscribeFromAnalysis(sessionId, analysisIds);
  }

  async handleSubscribeRequest(req, res) {
    return this.channelManager.handleSubscribeRequest(req, res);
  }

  async handleUnsubscribeRequest(req, res) {
    return this.channelManager.handleUnsubscribeRequest(req, res);
  }

  // ========================================================================
  // Broadcasting (delegates to BroadcastService)
  // ========================================================================

  broadcast(data) {
    return this.broadcastService.broadcast(data);
  }

  async broadcastToClients(sessions, data, filterFn) {
    return this.broadcastService.broadcastToClients(sessions, data, filterFn);
  }

  broadcastAnalysisLog(analysisId, logData) {
    return this.broadcastService.broadcastAnalysisLog(analysisId, logData);
  }

  async broadcastUpdate(type, data) {
    return this.broadcastService.broadcastUpdate(type, data);
  }

  async broadcastToTeamUsers(teamId, data) {
    return this.broadcastService.broadcastToTeamUsers(teamId, data);
  }

  async broadcastToAdminUsers(data) {
    return this.broadcastService.broadcastToAdminUsers(data);
  }

  broadcastTeamUpdate(team, action) {
    return this.broadcastService.broadcastTeamUpdate(team, action);
  }

  async broadcastAnalysisMove(analysisId, analysisName, fromTeam, toTeam) {
    return this.broadcastService.broadcastAnalysisMove(
      analysisId,
      analysisName,
      fromTeam,
      toTeam,
    );
  }

  async broadcastAnalysisUpdate(analysisId, updateData, teamId) {
    return this.broadcastService.broadcastAnalysisUpdate(
      analysisId,
      updateData,
      teamId,
    );
  }

  broadcastRefresh() {
    return this.broadcastService.broadcastRefresh();
  }

  async broadcastStatusUpdate() {
    return this.broadcastService.broadcastStatusUpdate();
  }

  async broadcastMetricsUpdate() {
    return this.broadcastService.broadcastMetricsUpdate();
  }

  // ========================================================================
  // Initialization (delegates to InitDataService)
  // ========================================================================

  async sendInitialData(client) {
    return this.initDataService.sendInitialData(client);
  }

  async refreshInitDataForUser(userId) {
    return this.initDataService.refreshInitDataForUser(userId);
  }

  async sendStatusUpdate(client) {
    return this.initDataService.sendStatusUpdate(client);
  }

  // ========================================================================
  // Heartbeat & Cleanup (delegates to HeartbeatService)
  // ========================================================================

  sendHeartbeat() {
    return this.heartbeatService.sendHeartbeat();
  }

  cleanupStaleConnections() {
    return this.heartbeatService.cleanupStaleConnections();
  }

  startHeartbeat() {
    return this.heartbeatService.startHeartbeat();
  }

  stopHeartbeat() {
    return this.heartbeatService.stopHeartbeat();
  }

  startMetricsBroadcasting() {
    return this.heartbeatService.startMetricsBroadcasting();
  }

  stopMetricsBroadcasting() {
    return this.heartbeatService.stopMetricsBroadcasting();
  }
}

// Export singleton instance (maintains backward compatibility)
export const sseManager = new SSEManager();

/**
 * SSE connection route handler
 * Extracted from sse.js lines 1788-1792
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
export async function handleSSEConnection(req, res) {
  const session = await sseManager.addClient(req.user.id, res, req);
  await session.push({ type: 'connection', status: 'connected' });
  await sseManager.sendInitialData(session);
}

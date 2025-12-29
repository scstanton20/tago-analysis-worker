/**
 * Core SSE Manager - Orchestrator for all SSE operations
 * Singleton instance for application-wide use
 *
 * This is the main orchestrator that coordinates all SSE functionality
 * by delegating to specialized service modules.
 */

import type { Request, Response } from 'express';
import { createChannel, Channel } from 'better-sse';

import { SessionManager } from './SessionManager.ts';
import { ChannelManager } from './ChannelManager.ts';
import { BroadcastService } from './BroadcastService.ts';
import { InitDataService } from './InitDataService.ts';
import { HeartbeatService } from './HeartbeatService.ts';
import { getTagoSdkVersion } from '../sdkVersion.ts';
import type { Session, ContainerState, SSEMessage, LogData } from './utils.ts';
import type {
  Team,
  SubscriptionResult,
  UnsubscriptionResult,
} from '@tago-analysis-worker/types';

/** Extended request with user (backend-specific) */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role?: string;
  };
}

/** Connection stats (extended from shared) */
interface ConnectionStatsDetailed {
  totalClients: number;
  uniqueUsers: number;
  userConnections: Array<{
    userId: string;
    connectionCount: number;
  }>;
}

export class SSEManager {
  // Infrastructure (owned by SSEManager)
  sessions: Map<string, Session>;
  analysisChannels: Map<string, Channel>;
  globalChannel: Channel;
  sessionLastPush: Map<string, number>;

  containerState: ContainerState;
  metricsInterval: ReturnType<typeof setInterval> | null;
  heartbeatInterval: ReturnType<typeof setInterval> | null;

  // Service instances (composition pattern)
  sessionManager: SessionManager;
  channelManager: ChannelManager;
  broadcastService: BroadcastService;
  initDataService: InitDataService;
  heartbeatService: HeartbeatService;

  /**
   * Initialize SSEManager
   * Extracted from sse.js lines 965-980
   */
  constructor() {
    // Infrastructure (owned by SSEManager)
    this.sessions = new Map();
    this.analysisChannels = new Map();
    this.globalChannel = createChannel();
    this.sessionLastPush = new Map();

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
   */
  getSdkVersion(): string {
    return getTagoSdkVersion();
  }

  /**
   * Get container state
   * Extracted from sse.js lines 1078-1080
   */
  getContainerState(): ContainerState {
    return this.containerState;
  }

  /**
   * Set container state (no broadcast)
   * Extracted from sse.js lines 1065-1067
   */
  setContainerState(state: Partial<ContainerState>): void {
    this.containerState = { ...this.containerState, ...state };
  }

  /**
   * Update container state and broadcast
   * Extracted from sse.js lines 1101-1105
   */
  updateContainerState(newState: Partial<ContainerState>): void {
    this.setContainerState(newState);
    this.broadcastService.broadcastStatusUpdate();
  }

  /**
   * Get connection statistics
   * Extracted from sse.js lines 628-648
   */
  getStats(): ConnectionStatsDetailed {
    const userSessionCounts = new Map<string, number>();

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
   */
  getAdminSessions(): Session[] {
    return this.sessionManager.getAdminSessions();
  }

  // ========================================================================
  // Session Management (delegates to SessionManager)
  // ========================================================================

  async addClient(
    userId: string,
    res: Response,
    req: AuthenticatedRequest,
  ): Promise<Session> {
    return this.sessionManager.addClient(userId, res, req);
  }

  async removeClient(userId: string, sessionId: string): Promise<void> {
    return this.sessionManager.removeClient(userId, sessionId);
  }

  async sendToUser(userId: string, data: SSEMessage | object): Promise<number> {
    return this.sessionManager.sendToUser(userId, data);
  }

  disconnectUser(userId: string): number {
    return this.sessionManager.disconnectUser(userId);
  }

  async forceUserLogout(userId: string, reason?: string): Promise<number> {
    return this.sessionManager.forceUserLogout(userId, reason);
  }

  findSessionById(sessionId: string): Session | null {
    return this.sessionManager.findSessionById(sessionId);
  }

  getSessionsByUserId(userId: string): Session[] {
    return this.sessionManager.getSessionsByUserId(userId);
  }

  // ========================================================================
  // Channel Management (delegates to ChannelManager)
  // ========================================================================

  getOrCreateAnalysisChannel(analysisId: string): Channel {
    return this.channelManager.getOrCreateAnalysisChannel(analysisId);
  }

  async subscribeToAnalysis(
    sessionId: string,
    analysisIds: string[],
    userId: string,
  ): Promise<SubscriptionResult> {
    return this.channelManager.subscribeToAnalysis(
      sessionId,
      analysisIds,
      userId,
    );
  }

  async unsubscribeFromAnalysis(
    sessionId: string,
    analysisIds: string[],
  ): Promise<UnsubscriptionResult> {
    return this.channelManager.unsubscribeFromAnalysis(sessionId, analysisIds);
  }

  async handleSubscribeRequest(req: Request, res: Response): Promise<void> {
    return this.channelManager.handleSubscribeRequest(
      req as AuthenticatedRequest,
      res,
    );
  }

  async handleUnsubscribeRequest(req: Request, res: Response): Promise<void> {
    return this.channelManager.handleUnsubscribeRequest(
      req as AuthenticatedRequest,
      res,
    );
  }

  // ========================================================================
  // Broadcasting (delegates to BroadcastService)
  // ========================================================================

  broadcast(data: object): void {
    return this.broadcastService.broadcast(data);
  }

  async broadcastToClients(
    sessions: Iterable<Session> | null | undefined,
    data: object,
    filterFn?: ((session: Session) => boolean) | null,
  ): Promise<number> {
    return this.broadcastService.broadcastToClients(sessions, data, filterFn);
  }

  broadcastAnalysisLog(analysisId: string, logData: object): void {
    return this.broadcastService.broadcastAnalysisLog(analysisId, logData);
  }

  async broadcastUpdate(type: string, data: LogData | object): Promise<void> {
    return this.broadcastService.broadcastUpdate(type, data);
  }

  async broadcastToTeamUsers(teamId: string, data: object): Promise<number> {
    return this.broadcastService.broadcastToTeamUsers(teamId, data);
  }

  async broadcastToAdminUsers(data: object): Promise<number> {
    return this.broadcastService.broadcastToAdminUsers(data);
  }

  broadcastTeamUpdate(team: Team, action: string): Promise<void> {
    return this.broadcastService.broadcastTeamUpdate(team, action);
  }

  async broadcastAnalysisMove(
    analysisId: string,
    analysisName: string,
    fromTeam: string | null | undefined,
    toTeam: string,
  ): Promise<void> {
    return this.broadcastService.broadcastAnalysisMove(
      analysisId,
      analysisName,
      fromTeam,
      toTeam,
    );
  }

  async broadcastAnalysisUpdate(
    analysisId: string,
    updateData: object,
    teamId?: string | null,
  ): Promise<number> {
    return this.broadcastService.broadcastAnalysisUpdate(
      analysisId,
      updateData,
      teamId || null,
    );
  }

  broadcastRefresh(): void {
    return this.broadcastService.broadcastRefresh();
  }

  async broadcastStatusUpdate(): Promise<void> {
    return this.broadcastService.broadcastStatusUpdate();
  }

  async broadcastMetricsUpdate(): Promise<void> {
    return this.broadcastService.broadcastMetricsUpdate();
  }

  // ========================================================================
  // Initialization (delegates to InitDataService)
  // ========================================================================

  async sendInitialData(client: Session): Promise<void> {
    return this.initDataService.sendInitialData(client);
  }

  async refreshInitDataForUser(userId: string): Promise<number> {
    return this.initDataService.refreshInitDataForUser(userId);
  }

  async sendStatusUpdate(client: Session): Promise<void> {
    return this.initDataService.sendStatusUpdate(client);
  }

  // ========================================================================
  // Heartbeat & Cleanup (delegates to HeartbeatService)
  // ========================================================================

  sendHeartbeat(): void {
    return this.heartbeatService.sendHeartbeat();
  }

  cleanupStaleConnections(): number {
    return this.heartbeatService.cleanupStaleConnections();
  }

  startHeartbeat(): void {
    return this.heartbeatService.startHeartbeat();
  }

  stopHeartbeat(): void {
    return this.heartbeatService.stopHeartbeat();
  }

  startMetricsBroadcasting(): void {
    return this.heartbeatService.startMetricsBroadcasting();
  }

  stopMetricsBroadcasting(): void {
    return this.heartbeatService.stopMetricsBroadcasting();
  }
}

// Export singleton instance (maintains backward compatibility)
export const sseManager = new SSEManager();

/**
 * SSE connection route handler
 * Extracted from sse.js lines 1788-1792
 */
export async function handleSSEConnection(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const session = await sseManager.addClient(req.user!.id, res, req);
  await session.push({ type: 'connection', status: 'connected' });
  await sseManager.sendInitialData(session);
}

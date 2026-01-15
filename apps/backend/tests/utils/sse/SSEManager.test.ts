import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock all dependencies
vi.mock('better-sse', () => ({
  createChannel: vi.fn(() => ({
    register: vi.fn(),
    broadcast: vi.fn(),
    unregister: vi.fn(),
    on: vi.fn(),
  })),
  createSession: vi.fn(
    (
      _req: Request,
      _res: Response,
      _options?: { keepAlive?: number; retry?: number },
    ) => ({
      id: 'session-1',
      push: vi.fn().mockResolvedValue(undefined),
      state: {
        userId: undefined,
        user: undefined,
        subscribedChannels: new Set(),
      },
      isConnected: true,
    }),
  ),
  Channel: vi.fn(),
}));

vi.mock('../../../src/utils/sse/SessionManager.ts', () => {
  return {
    SessionManager: class MockSessionManager {
      addClient = vi.fn().mockResolvedValue({
        id: 'session-1',
        push: vi.fn().mockResolvedValue(undefined),
        state: { subscribedChannels: new Set() },
        isConnected: true,
      });
      removeClient = vi.fn();
      getAdminSessions = vi.fn(() => []);
      sendToUser = vi.fn().mockResolvedValue(1);
      disconnectUser = vi.fn(() => 0);
      forceUserLogout = vi.fn().mockResolvedValue(0);
      findSessionById = vi.fn();
      getSessionsByUserId = vi.fn(() => []);
    },
  };
});

vi.mock('../../../src/utils/sse/ChannelManager.ts', () => {
  return {
    ChannelManager: class MockChannelManager {
      getOrCreateLogsChannel = vi.fn();
      getOrCreateStatsChannel = vi.fn();
      subscribeToAnalysisLogs = vi.fn(() => ({ success: true }));
      subscribeToAnalysisStats = vi.fn(() => ({ success: true }));
      subscribeToMetrics = vi.fn(() => ({ success: true }));
      unsubscribeFromAnalysisLogs = vi.fn(() => ({ success: true }));
      unsubscribeFromAnalysisStats = vi.fn(() => ({ success: true }));
      unsubscribeFromMetrics = vi.fn(() => ({ success: true }));
      handleSubscribeLogsRequest = vi.fn();
      handleUnsubscribeLogsRequest = vi.fn();
      handleSubscribeStatsRequest = vi.fn();
      handleUnsubscribeStatsRequest = vi.fn();
      handleSubscribeMetricsRequest = vi.fn();
      handleUnsubscribeMetricsRequest = vi.fn();
    },
  };
});

vi.mock('../../../src/utils/sse/BroadcastService.ts', () => {
  return {
    BroadcastService: class MockBroadcastService {
      broadcast = vi.fn();
      broadcastToClients = vi.fn().mockResolvedValue(1);
      broadcastAnalysisLog = vi.fn();
      broadcastUpdate = vi.fn();
      broadcastToTeamUsers = vi.fn().mockResolvedValue(1);
      broadcastToAdminUsers = vi.fn().mockResolvedValue(1);
      broadcastTeamUpdate = vi.fn().mockResolvedValue(undefined);
      broadcastAnalysisMove = vi.fn();
      broadcastAnalysisUpdate = vi.fn().mockResolvedValue(1);
      broadcastRefresh = vi.fn();
      broadcastStatusUpdate = vi.fn();
      broadcastMetricsUpdate = vi.fn();
    },
  };
});

vi.mock('../../../src/utils/sse/InitDataService.ts', () => {
  return {
    InitDataService: class MockInitDataService {
      sendInitialData = vi.fn().mockResolvedValue(undefined);
      refreshInitDataForUser = vi.fn().mockResolvedValue(1);
      sendStatusUpdate = vi.fn().mockResolvedValue(undefined);
    },
  };
});

vi.mock('../../../src/utils/sse/HeartbeatService.ts', () => {
  return {
    HeartbeatService: class MockHeartbeatService {
      sendHeartbeat = vi.fn();
      cleanupStaleConnections = vi.fn(() => 0);
      startHeartbeat = vi.fn();
      stopHeartbeat = vi.fn();
      startMetricsBroadcasting = vi.fn();
      stopMetricsBroadcasting = vi.fn();
    },
  };
});

vi.mock('../../../src/utils/sdkVersion.ts', () => ({
  getTagoSdkVersion: vi.fn(() => '5.0.0'),
}));

// Import after mocks
import {
  SSEManager,
  sseManager,
  handleSSEConnection,
} from '../../../src/utils/sse/SSEManager.ts';

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SSEManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with all service instances', () => {
      expect(manager.sessions).toBeInstanceOf(Map);
      expect(manager.analysisLogsChannels).toBeInstanceOf(Map);
      expect(manager.analysisStatsChannels).toBeInstanceOf(Map);
      expect(manager.globalChannel).toBeDefined();
      expect(manager.metricsChannel).toBeDefined();
      expect(manager.sessionLastPush).toBeInstanceOf(Map);
      expect(manager.containerState).toEqual({
        status: 'ready',
        startTime: expect.any(Date),
        message: 'Container is ready',
      });
      expect(manager.sessionManager).toBeDefined();
      expect(manager.channelManager).toBeDefined();
      expect(manager.broadcastService).toBeDefined();
      expect(manager.initDataService).toBeDefined();
      expect(manager.heartbeatService).toBeDefined();
    });
  });

  describe('getSdkVersion', () => {
    it('should return SDK version', () => {
      const version = manager.getSdkVersion();
      expect(version).toBe('5.0.0');
    });
  });

  describe('getContainerState', () => {
    it('should return container state', () => {
      const state = manager.getContainerState();
      expect(state).toEqual(manager.containerState);
    });
  });

  describe('setContainerState', () => {
    it('should update container state', () => {
      manager.setContainerState({
        status: 'shutdown',
        message: 'Shutting down',
      });

      expect(manager.containerState.status).toBe('shutdown');
      expect(manager.containerState.message).toBe('Shutting down');
    });
  });

  describe('updateContainerState', () => {
    it('should update container state and broadcast', () => {
      manager.updateContainerState({
        status: 'shutdown',
        message: 'Shutting down',
      });

      expect(manager.containerState.status).toBe('shutdown');
      expect(manager.broadcastService.broadcastStatusUpdate).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return connection statistics', () => {
      const stats = manager.getStats();

      expect(stats).toHaveProperty('totalClients');
      expect(stats).toHaveProperty('uniqueUsers');
      expect(stats).toHaveProperty('userConnections');
    });

    it('should count user sessions correctly', () => {
      // Add mock sessions
      manager.sessions.set('session-1', {
        id: 'session-1',
        state: { userId: 'user-1' },
      } as any);
      manager.sessions.set('session-2', {
        id: 'session-2',
        state: { userId: 'user-1' },
      } as any);
      manager.sessions.set('session-3', {
        id: 'session-3',
        state: { userId: 'user-2' },
      } as any);

      const stats = manager.getStats();

      expect(stats.totalClients).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
      expect(stats.userConnections).toHaveLength(2);
    });

    it('should skip sessions without userId in state', () => {
      // Add sessions - some with userId, some without
      manager.sessions.set('session-1', {
        id: 'session-1',
        state: { userId: 'user-1' },
      } as any);
      manager.sessions.set('session-2', {
        id: 'session-2',
        state: {}, // No userId
      } as any);
      manager.sessions.set('session-3', {
        id: 'session-3',
        state: null, // Null state
      } as any);
      manager.sessions.set('session-4', {
        id: 'session-4',
        // No state property at all
      } as any);
      manager.sessions.set('session-5', {
        id: 'session-5',
        state: { userId: undefined }, // Explicitly undefined
      } as any);

      const stats = manager.getStats();

      // Only session-1 should be counted as having a user
      expect(stats.totalClients).toBe(5);
      expect(stats.uniqueUsers).toBe(1);
      expect(stats.userConnections).toHaveLength(1);
      expect(stats.userConnections[0]).toEqual({
        userId: 'user-1',
        connectionCount: 1,
      });
    });
  });

  describe('getAdminSessions', () => {
    it('should delegate to sessionManager', () => {
      manager.getAdminSessions();
      expect(manager.sessionManager.getAdminSessions).toHaveBeenCalled();
    });
  });

  describe('session management delegates', () => {
    it('should delegate addClient to sessionManager', async () => {
      const mockRes = {} as Response;
      const mockReq = { user: { id: 'user-1' } } as any;

      await manager.addClient('user-1', mockRes, mockReq);

      expect(manager.sessionManager.addClient).toHaveBeenCalledWith(
        'user-1',
        mockRes,
        mockReq,
      );
    });

    it('should delegate removeClient to sessionManager', async () => {
      await manager.removeClient('user-1', 'session-1');

      expect(manager.sessionManager.removeClient).toHaveBeenCalledWith(
        'user-1',
        'session-1',
      );
    });

    it('should delegate sendToUser to sessionManager', async () => {
      await manager.sendToUser('user-1', { type: 'test' });

      expect(manager.sessionManager.sendToUser).toHaveBeenCalledWith('user-1', {
        type: 'test',
      });
    });

    it('should delegate disconnectUser to sessionManager', () => {
      manager.disconnectUser('user-1');

      expect(manager.sessionManager.disconnectUser).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('should delegate forceUserLogout to sessionManager', async () => {
      await manager.forceUserLogout('user-1', 'reason');

      expect(manager.sessionManager.forceUserLogout).toHaveBeenCalledWith(
        'user-1',
        'reason',
      );
    });

    it('should delegate findSessionById to sessionManager', () => {
      manager.findSessionById('session-1');

      expect(manager.sessionManager.findSessionById).toHaveBeenCalledWith(
        'session-1',
      );
    });

    it('should delegate getSessionsByUserId to sessionManager', () => {
      manager.getSessionsByUserId('user-1');

      expect(manager.sessionManager.getSessionsByUserId).toHaveBeenCalledWith(
        'user-1',
      );
    });
  });

  describe('channel management delegates', () => {
    it('should delegate getOrCreateLogsChannel to channelManager', () => {
      manager.getOrCreateLogsChannel('analysis-1');

      expect(
        manager.channelManager.getOrCreateLogsChannel,
      ).toHaveBeenCalledWith('analysis-1');
    });

    it('should delegate getOrCreateStatsChannel to channelManager', () => {
      manager.getOrCreateStatsChannel('analysis-1');

      expect(
        manager.channelManager.getOrCreateStatsChannel,
      ).toHaveBeenCalledWith('analysis-1');
    });

    it('should delegate subscribeToAnalysisLogs to channelManager', async () => {
      await manager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1'],
        'user-1',
      );

      expect(
        manager.channelManager.subscribeToAnalysisLogs,
      ).toHaveBeenCalledWith('session-1', ['analysis-1'], 'user-1');
    });

    it('should delegate subscribeToAnalysisStats to channelManager', async () => {
      await manager.subscribeToAnalysisStats(
        'session-1',
        ['analysis-1'],
        'user-1',
      );

      expect(
        manager.channelManager.subscribeToAnalysisStats,
      ).toHaveBeenCalledWith('session-1', ['analysis-1'], 'user-1');
    });

    it('should delegate subscribeToMetrics to channelManager', async () => {
      await manager.subscribeToMetrics('session-1');

      expect(manager.channelManager.subscribeToMetrics).toHaveBeenCalledWith(
        'session-1',
      );
    });

    it('should delegate unsubscribeFromAnalysisLogs to channelManager', async () => {
      await manager.unsubscribeFromAnalysisLogs('session-1', ['analysis-1']);

      expect(
        manager.channelManager.unsubscribeFromAnalysisLogs,
      ).toHaveBeenCalledWith('session-1', ['analysis-1']);
    });

    it('should delegate unsubscribeFromAnalysisStats to channelManager', async () => {
      await manager.unsubscribeFromAnalysisStats('session-1', ['analysis-1']);

      expect(
        manager.channelManager.unsubscribeFromAnalysisStats,
      ).toHaveBeenCalledWith('session-1', ['analysis-1']);
    });

    it('should delegate unsubscribeFromMetrics to channelManager', async () => {
      await manager.unsubscribeFromMetrics('session-1');

      expect(
        manager.channelManager.unsubscribeFromMetrics,
      ).toHaveBeenCalledWith('session-1');
    });

    it('should delegate handleSubscribeLogsRequest to channelManager', async () => {
      const mockReq = { user: { id: 'user-1' } } as any;
      const mockRes = {} as Response;

      await manager.handleSubscribeLogsRequest(mockReq, mockRes);

      expect(
        manager.channelManager.handleSubscribeLogsRequest,
      ).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it('should delegate handleUnsubscribeLogsRequest to channelManager', async () => {
      const mockReq = { user: { id: 'user-1' } } as any;
      const mockRes = {} as Response;

      await manager.handleUnsubscribeLogsRequest(mockReq, mockRes);

      expect(
        manager.channelManager.handleUnsubscribeLogsRequest,
      ).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it('should delegate handleSubscribeStatsRequest to channelManager', async () => {
      const mockReq = { user: { id: 'user-1' } } as any;
      const mockRes = {} as Response;

      await manager.handleSubscribeStatsRequest(mockReq, mockRes);

      expect(
        manager.channelManager.handleSubscribeStatsRequest,
      ).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it('should delegate handleUnsubscribeStatsRequest to channelManager', async () => {
      const mockReq = { user: { id: 'user-1' } } as any;
      const mockRes = {} as Response;

      await manager.handleUnsubscribeStatsRequest(mockReq, mockRes);

      expect(
        manager.channelManager.handleUnsubscribeStatsRequest,
      ).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it('should delegate handleSubscribeMetricsRequest to channelManager', async () => {
      const mockReq = { user: { id: 'user-1' } } as any;
      const mockRes = {} as Response;

      await manager.handleSubscribeMetricsRequest(mockReq, mockRes);

      expect(
        manager.channelManager.handleSubscribeMetricsRequest,
      ).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it('should delegate handleUnsubscribeMetricsRequest to channelManager', async () => {
      const mockReq = { user: { id: 'user-1' } } as any;
      const mockRes = {} as Response;

      await manager.handleUnsubscribeMetricsRequest(mockReq, mockRes);

      expect(
        manager.channelManager.handleUnsubscribeMetricsRequest,
      ).toHaveBeenCalledWith(mockReq, mockRes);
    });
  });

  describe('broadcast delegates', () => {
    it('should delegate broadcast to broadcastService', () => {
      const data = { type: 'test' };
      manager.broadcast(data);

      expect(manager.broadcastService.broadcast).toHaveBeenCalledWith(data);
    });

    it('should delegate broadcastToClients to broadcastService', async () => {
      const sessions = [{ id: 'session-1' }] as any;
      const data = { type: 'test' };

      await manager.broadcastToClients(sessions, data);

      expect(manager.broadcastService.broadcastToClients).toHaveBeenCalledWith(
        sessions,
        data,
        undefined,
      );
    });

    it('should delegate broadcastAnalysisLog to broadcastService', () => {
      const logData = { message: 'test' };
      manager.broadcastAnalysisLog('analysis-1', logData);

      expect(
        manager.broadcastService.broadcastAnalysisLog,
      ).toHaveBeenCalledWith('analysis-1', logData);
    });

    it('should delegate broadcastUpdate to broadcastService', async () => {
      const data = { message: 'test' };
      await manager.broadcastUpdate('log', data);

      expect(manager.broadcastService.broadcastUpdate).toHaveBeenCalledWith(
        'log',
        data,
      );
    });

    it('should delegate broadcastToTeamUsers to broadcastService', async () => {
      const data = { type: 'test' };
      await manager.broadcastToTeamUsers('team-1', data);

      expect(
        manager.broadcastService.broadcastToTeamUsers,
      ).toHaveBeenCalledWith('team-1', data);
    });

    it('should delegate broadcastToAdminUsers to broadcastService', async () => {
      const data = { type: 'test' };
      await manager.broadcastToAdminUsers(data);

      expect(
        manager.broadcastService.broadcastToAdminUsers,
      ).toHaveBeenCalledWith(data);
    });

    it('should delegate broadcastTeamUpdate to broadcastService', async () => {
      const team = { id: 'team-1', name: 'Test Team' };
      await manager.broadcastTeamUpdate(team as any, 'add');

      expect(manager.broadcastService.broadcastTeamUpdate).toHaveBeenCalledWith(
        team,
        'add',
      );
    });

    it('should delegate broadcastAnalysisMove to broadcastService', async () => {
      await manager.broadcastAnalysisMove(
        'analysis-1',
        'Test Analysis',
        'team-1',
        'team-2',
      );

      expect(
        manager.broadcastService.broadcastAnalysisMove,
      ).toHaveBeenCalledWith('analysis-1', 'Test Analysis', 'team-1', 'team-2');
    });

    it('should delegate broadcastAnalysisUpdate to broadcastService', async () => {
      const updateData = { status: 'running' };
      await manager.broadcastAnalysisUpdate('analysis-1', updateData, 'team-1');

      expect(
        manager.broadcastService.broadcastAnalysisUpdate,
      ).toHaveBeenCalledWith('analysis-1', updateData, 'team-1');
    });

    it('should pass null when teamId is undefined', async () => {
      const updateData = { status: 'running' };
      await manager.broadcastAnalysisUpdate(
        'analysis-1',
        updateData,
        undefined,
      );

      expect(
        manager.broadcastService.broadcastAnalysisUpdate,
      ).toHaveBeenCalledWith('analysis-1', updateData, null);
    });

    it('should pass null when teamId is null', async () => {
      const updateData = { status: 'running' };
      await manager.broadcastAnalysisUpdate('analysis-1', updateData, null);

      expect(
        manager.broadcastService.broadcastAnalysisUpdate,
      ).toHaveBeenCalledWith('analysis-1', updateData, null);
    });

    it('should delegate broadcastRefresh to broadcastService', () => {
      manager.broadcastRefresh();

      expect(manager.broadcastService.broadcastRefresh).toHaveBeenCalled();
    });

    it('should delegate broadcastStatusUpdate to broadcastService', async () => {
      await manager.broadcastStatusUpdate();

      expect(manager.broadcastService.broadcastStatusUpdate).toHaveBeenCalled();
    });

    it('should delegate broadcastMetricsUpdate to broadcastService', async () => {
      await manager.broadcastMetricsUpdate();

      expect(
        manager.broadcastService.broadcastMetricsUpdate,
      ).toHaveBeenCalled();
    });
  });

  describe('init data delegates', () => {
    it('should delegate sendInitialData to initDataService', async () => {
      const mockSession = { id: 'session-1' } as any;
      await manager.sendInitialData(mockSession);

      expect(manager.initDataService.sendInitialData).toHaveBeenCalledWith(
        mockSession,
      );
    });

    it('should delegate refreshInitDataForUser to initDataService', async () => {
      await manager.refreshInitDataForUser('user-1');

      expect(
        manager.initDataService.refreshInitDataForUser,
      ).toHaveBeenCalledWith('user-1');
    });

    it('should delegate sendStatusUpdate to initDataService', async () => {
      const mockSession = { id: 'session-1' } as any;
      await manager.sendStatusUpdate(mockSession);

      expect(manager.initDataService.sendStatusUpdate).toHaveBeenCalledWith(
        mockSession,
      );
    });
  });

  describe('heartbeat delegates', () => {
    it('should delegate sendHeartbeat to heartbeatService', () => {
      manager.sendHeartbeat();

      expect(manager.heartbeatService.sendHeartbeat).toHaveBeenCalled();
    });

    it('should delegate cleanupStaleConnections to heartbeatService', () => {
      manager.cleanupStaleConnections();

      expect(
        manager.heartbeatService.cleanupStaleConnections,
      ).toHaveBeenCalled();
    });

    it('should delegate startHeartbeat to heartbeatService', () => {
      manager.startHeartbeat();

      expect(manager.heartbeatService.startHeartbeat).toHaveBeenCalled();
    });

    it('should delegate stopHeartbeat to heartbeatService', () => {
      manager.stopHeartbeat();

      expect(manager.heartbeatService.stopHeartbeat).toHaveBeenCalled();
    });

    it('should delegate startMetricsBroadcasting to heartbeatService', () => {
      manager.startMetricsBroadcasting();

      expect(
        manager.heartbeatService.startMetricsBroadcasting,
      ).toHaveBeenCalled();
    });

    it('should delegate stopMetricsBroadcasting to heartbeatService', () => {
      manager.stopMetricsBroadcasting();

      expect(
        manager.heartbeatService.stopMetricsBroadcasting,
      ).toHaveBeenCalled();
    });
  });
});

describe('sseManager singleton', () => {
  it('should export a singleton instance', () => {
    expect(sseManager).toBeInstanceOf(SSEManager);
  });
});

describe('handleSSEConnection', () => {
  it('should create session, send connection message, and send initial data', async () => {
    const mockSession = {
      id: 'session-1',
      push: vi.fn().mockResolvedValue(undefined),
      state: { subscribedChannels: new Set() },
      isConnected: true,
    };

    // Update the mock to return our session
    sseManager.sessionManager.addClient = vi
      .fn()
      .mockResolvedValue(mockSession);

    const mockReq = {
      user: { id: 'user-1', role: 'admin' },
    } as any;
    const mockRes = {} as Response;

    await handleSSEConnection(mockReq, mockRes);

    expect(sseManager.sessionManager.addClient).toHaveBeenCalledWith(
      'user-1',
      mockRes,
      mockReq,
    );
    expect(mockSession.push).toHaveBeenCalledWith({
      type: 'connection',
      status: 'connected',
    });
    expect(sseManager.initDataService.sendInitialData).toHaveBeenCalledWith(
      mockSession,
    );
  });
});

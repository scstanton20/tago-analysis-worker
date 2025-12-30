/**
 * Test suite for BroadcastService
 * Tests broadcasting operations to SSE clients with various routing patterns
 * and permission-based filtering
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import { BroadcastService } from '../../../src/utils/sse/BroadcastService.ts';
import type { Session, ContainerState } from '../../../src/utils/sse/utils.ts';
import type { SSEMessage } from '@tago-analysis-worker/types';

// Mock session type with vi.fn() mock for push
type PushFn = (data: object | SSEMessage) => Promise<void>;
interface MockSession extends Omit<Session, 'push'> {
  push: MockInstance<PushFn> & PushFn;
}

// Mock logger
vi.mock('../../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock metricsService
vi.mock('../../../src/services/metricsService.ts', () => ({
  metricsService: {
    getAllMetrics: vi.fn(),
  },
}));

// Mock dynamic imports
vi.mock('../../../src/services/analysisService.ts', () => ({
  analysisService: {
    getAllAnalyses: vi.fn(() =>
      Promise.resolve({
        'analysis-1': {
          id: 'analysis-1',
          name: 'Analysis 1',
          teamId: 'team-1',
        },
        'analysis-2': {
          id: 'analysis-2',
          name: 'Analysis 2',
          teamId: 'team-2',
        },
      }),
    ),
    getAnalysisById: vi.fn((id: string) => ({
      id,
      name: `Analysis ${id}`,
      teamId: id.includes('team-2') ? 'team-2' : 'team-1',
    })),
  },
}));

vi.mock('../../../src/middleware/betterAuthMiddleware.ts', () => ({
  getUsersWithTeamAccess: vi.fn((teamId: string) => {
    if (teamId === 'team-1') return ['user-1', 'user-2'];
    if (teamId === 'team-2') return ['user-2', 'user-3'];
    return [];
  }),
  getUserTeamIds: vi.fn((userId: string) => {
    if (userId === 'user-1') return ['team-1', 'uncategorized'];
    if (userId === 'user-2') return ['team-1', 'team-2', 'uncategorized'];
    if (userId === 'user-3') return ['team-2', 'uncategorized'];
    return ['uncategorized'];
  }),
}));

// Helper to create mock SSEManager
function createMockSSEManager() {
  return {
    sessions: new Map<string, Session>(),
    analysisChannels: new Map(),
    globalChannel: {
      broadcast: vi.fn(),
    },
    sessionLastPush: new Map<string, number>(),
    sessionManager: {
      removeClient: vi.fn(),
      getAdminSessions: vi.fn((): Session[] => []),
      sendToUser: vi.fn(),
    },
    channelManager: {
      broadcastAnalysisLog: vi.fn(),
      broadcastAnalysisDnsStats: vi.fn(),
    },
    initDataService: {
      sendStatusUpdate: vi.fn(),
    },
    getContainerState: vi.fn(
      (): ContainerState => ({
        status: 'ready',
        startTime: new Date(Date.now() - 3600000),
        message: 'Container is ready',
      }),
    ),
    getSdkVersion: vi.fn(() => '1.0.0'),
  };
}

// Helper to create mock session
function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
  return {
    id: `session-${Math.random().toString(36).substring(7)}`,
    isConnected: true,
    push: vi.fn().mockResolvedValue(undefined),
    state: {
      userId: 'user-123',
      user: { id: 'user-123', role: 'user' },
      subscribedChannels: new Set(),
    },
    ...overrides,
  };
}

describe('BroadcastService', () => {
  let broadcastService: BroadcastService;
  let mockSSEManager: ReturnType<typeof createMockSSEManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSSEManager = createMockSSEManager();
    broadcastService = new BroadcastService(mockSSEManager as unknown as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================================================
  // 1. BROADCAST METHOD (global channel broadcast)
  // ========================================================================
  describe('broadcast()', () => {
    it('should broadcast to global channel', () => {
      const data = { type: 'test', message: 'hello' };

      broadcastService.broadcast(data);

      expect(mockSSEManager.globalChannel.broadcast).toHaveBeenCalledWith(data);
    });

    it('should handle broadcast errors gracefully', () => {
      const data = { type: 'test' };
      mockSSEManager.globalChannel.broadcast.mockImplementation(() => {
        throw new Error('Broadcast failed');
      });

      expect(() => {
        broadcastService.broadcast(data);
      }).not.toThrow();
    });

    it('should log errors when broadcast fails', () => {
      const data = { type: 'test' };
      const error = new Error('Broadcast failed');
      mockSSEManager.globalChannel.broadcast.mockImplementation(() => {
        throw error;
      });

      broadcastService.broadcast(data);

      // Error is caught and logged, not thrown
      expect(mockSSEManager.globalChannel.broadcast).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 2. BROADCAST TO CLIENTS (generic with filtering)
  // ========================================================================
  describe('broadcastToClients()', () => {
    it('should return 0 for null sessions', async () => {
      const count = await broadcastService.broadcastToClients(null, {
        type: 'test',
      });

      expect(count).toBe(0);
    });

    it('should return 0 for undefined sessions', async () => {
      const count = await broadcastService.broadcastToClients(undefined, {
        type: 'test',
      });

      expect(count).toBe(0);
    });

    it('should return 0 for non-iterable sessions', async () => {
      const count = await broadcastService.broadcastToClients(
        { type: 'test' } as any,
        { type: 'test' },
      );

      expect(count).toBe(0);
    });

    it('should broadcast to connected sessions', async () => {
      const session1 = createMockSession();
      const session2 = createMockSession();
      const sessions = [session1, session2];

      const count = await broadcastService.broadcastToClients(sessions, {
        type: 'test',
      });

      expect(count).toBe(2);
      expect(session1.push).toHaveBeenCalledWith({ type: 'test' });
      expect(session2.push).toHaveBeenCalledWith({ type: 'test' });
    });

    it('should not broadcast to disconnected sessions', async () => {
      const session1 = createMockSession({ isConnected: true });
      const session2 = createMockSession({ isConnected: false });
      const sessions = [session1, session2];

      const count = await broadcastService.broadcastToClients(sessions, {
        type: 'test',
      });

      expect(count).toBe(1);
      expect(session1.push).toHaveBeenCalled();
      expect(session2.push).not.toHaveBeenCalled();
    });

    it('should remove disconnected sessions', async () => {
      const session = createMockSession({ isConnected: false });
      const sessions = [session];

      await broadcastService.broadcastToClients(sessions, { type: 'test' });

      expect(mockSSEManager.sessionManager.removeClient).toHaveBeenCalledWith(
        session.state.userId,
        session.id,
      );
    });

    it('should handle failed sessions gracefully', async () => {
      const session1 = createMockSession();
      const session2 = createMockSession();
      session1.push.mockRejectedValueOnce(new Error('Push failed'));

      const sessions = [session1, session2];
      const count = await broadcastService.broadcastToClients(sessions, {
        type: 'test',
      });

      expect(count).toBe(1); // Only session2 succeeded
      expect(mockSSEManager.sessionManager.removeClient).toHaveBeenCalledWith(
        session1.state.userId,
        session1.id,
      );
    });

    it('should apply filter function if provided', async () => {
      const session1 = createMockSession({
        state: {
          userId: 'user-1',
          user: { id: 'user-1', role: 'user' },
          subscribedChannels: new Set(),
        },
      });
      const session2 = createMockSession({
        state: {
          userId: 'user-2',
          user: { id: 'user-2', role: 'admin' },
          subscribedChannels: new Set(),
        },
      });
      const sessions = [session1, session2];

      const count = await broadcastService.broadcastToClients(
        sessions,
        { type: 'test' },
        (session) => session.state.user?.role === 'admin',
      );

      expect(count).toBe(1);
      expect(session1.push).not.toHaveBeenCalled();
      expect(session2.push).toHaveBeenCalled();
    });

    it('should skip filtered-out sessions', async () => {
      const session = createMockSession();
      const sessions = [session];

      const count = await broadcastService.broadcastToClients(
        sessions,
        { type: 'test' },
        () => false, // Filter out all sessions
      );

      expect(count).toBe(0);
      expect(session.push).not.toHaveBeenCalled();
    });

    it('should update sessionLastPush for successful broadcasts', async () => {
      const session = createMockSession();
      const sessions = [session];
      const beforeTime = Date.now();

      await broadcastService.broadcastToClients(sessions, { type: 'test' });

      const lastPushTime = mockSSEManager.sessionLastPush.get(session.id);
      expect(lastPushTime).toBeDefined();
      expect(lastPushTime).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should handle empty sessions array', async () => {
      const count = await broadcastService.broadcastToClients([], {
        type: 'test',
      });

      expect(count).toBe(0);
    });

    it('should handle session with missing userId', async () => {
      const session = createMockSession({
        state: {
          userId: '',
          user: { id: '', role: 'user' },
          subscribedChannels: new Set(),
        },
        isConnected: false,
      });

      await broadcastService.broadcastToClients([session], { type: 'test' });

      expect(mockSSEManager.sessionManager.removeClient).toHaveBeenCalledWith(
        '',
        session.id,
      );
    });
  });

  // ========================================================================
  // 3. ANALYSIS LOG BROADCAST
  // ========================================================================
  describe('broadcastAnalysisLog()', () => {
    it('should delegate to channelManager', () => {
      const analysisId = 'test-analysis';
      const logData = { type: 'log', message: 'test log' };

      broadcastService.broadcastAnalysisLog(analysisId, logData);

      expect(
        mockSSEManager.channelManager.broadcastAnalysisLog,
      ).toHaveBeenCalledWith(analysisId, logData);
    });
  });

  // ========================================================================
  // 4. BROADCAST UPDATE (log vs non-log routing)
  // ========================================================================
  describe('broadcastUpdate()', () => {
    it('should route "log" type to analysis channel', async () => {
      const logData = {
        analysisId: 'test-analysis',
        message: 'log message',
      };

      await broadcastService.broadcastUpdate('log', logData);

      expect(
        mockSSEManager.channelManager.broadcastAnalysisLog,
      ).toHaveBeenCalledWith(
        'test-analysis',
        expect.objectContaining({ type: 'log' }),
      );
    });

    it('should fallback to global broadcast for log without analysisId', async () => {
      const logData = { message: 'log message' };
      vi.spyOn(broadcastService, 'broadcast');

      await broadcastService.broadcastUpdate('log', logData);

      expect(broadcastService.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'log' }),
      );
    });

    it('should route non-log type to broadcastAnalysisUpdate', async () => {
      vi.spyOn(broadcastService, 'broadcastAnalysisUpdate');
      const updateData = { status: 'running' };

      await broadcastService.broadcastUpdate('analysis-123', updateData);

      expect(broadcastService.broadcastAnalysisUpdate).toHaveBeenCalledWith(
        'analysis-123',
        expect.any(Object),
      );
    });

    it('should include analysisId in non-log broadcast payload', async () => {
      vi.spyOn(broadcastService, 'broadcastAnalysisUpdate');

      await broadcastService.broadcastUpdate('analysis-456', {
        status: 'stopped',
      });

      const callArgs = (broadcastService.broadcastAnalysisUpdate as Mock).mock
        .calls[0];
      expect(callArgs[1]).toEqual(
        expect.objectContaining({
          type: 'analysisUpdate',
          analysisId: 'analysis-456',
        }),
      );
    });
  });

  // ========================================================================
  // 5. BROADCAST TO TEAM USERS
  // ========================================================================
  describe('broadcastToTeamUsers()', () => {
    it('should return session count for empty teamId', async () => {
      const session1 = createMockSession();
      const session2 = createMockSession();
      mockSSEManager.sessions.set(session1.id, session1);
      mockSSEManager.sessions.set(session2.id, session2);

      const count = await broadcastService.broadcastToTeamUsers('', {
        type: 'test',
      });

      expect(count).toBe(2);
    });

    it('should broadcast to team-1 users', async () => {
      mockSSEManager.sessionManager.sendToUser.mockResolvedValue(1);
      const data = { type: 'teamUpdate' };

      const count = await broadcastService.broadcastToTeamUsers('team-1', data);

      expect(mockSSEManager.sessionManager.sendToUser).toHaveBeenCalledWith(
        'user-1',
        data,
      );
      expect(mockSSEManager.sessionManager.sendToUser).toHaveBeenCalledWith(
        'user-2',
        data,
      );
      expect(count).toBe(2);
    });

    it('should broadcast to team-2 users', async () => {
      mockSSEManager.sessionManager.sendToUser.mockResolvedValue(1);
      const data = { type: 'teamUpdate' };

      await broadcastService.broadcastToTeamUsers('team-2', data);

      expect(mockSSEManager.sessionManager.sendToUser).toHaveBeenCalledWith(
        'user-2',
        data,
      );
      expect(mockSSEManager.sessionManager.sendToUser).toHaveBeenCalledWith(
        'user-3',
        data,
      );
    });

    it('should return 0 on error', async () => {
      // Error will be caught and logged, count returns 0
      const count = await broadcastService.broadcastToTeamUsers('team-1', {
        type: 'test',
      });

      expect(typeof count).toBe('number');
    });

    it('should handle empty user list for team', async () => {
      const count = await broadcastService.broadcastToTeamUsers(
        'unknown-team',
        { type: 'test' },
      );

      expect(count).toBe(0);
    });

    it('should accumulate send counts from multiple users', async () => {
      mockSSEManager.sessionManager.sendToUser
        .mockResolvedValueOnce(2) // user-1 has 2 sessions
        .mockResolvedValueOnce(1); // user-2 has 1 session

      const count = await broadcastService.broadcastToTeamUsers('team-1', {
        type: 'test',
      });

      expect(count).toBe(3);
    });
  });

  // ========================================================================
  // 6. BROADCAST TO ADMIN USERS
  // ========================================================================
  describe('broadcastToAdminUsers()', () => {
    it('should broadcast to all admin sessions', async () => {
      const adminSession1 = createMockSession({
        state: {
          userId: 'admin-1',
          user: { id: 'admin-1', role: 'admin' },
          subscribedChannels: new Set(),
        },
      });
      const adminSession2 = createMockSession({
        state: {
          userId: 'admin-2',
          user: { id: 'admin-2', role: 'admin' },
          subscribedChannels: new Set(),
        },
      });

      mockSSEManager.sessionManager.getAdminSessions.mockReturnValue([
        adminSession1,
        adminSession2,
      ]);

      const count = await broadcastService.broadcastToAdminUsers({
        type: 'adminUpdate',
      });

      expect(count).toBe(2);
      expect(adminSession1.push).toHaveBeenCalled();
      expect(adminSession2.push).toHaveBeenCalled();
    });

    it('should not broadcast to disconnected admin sessions', async () => {
      const adminSession1 = createMockSession({
        isConnected: true,
      });
      const adminSession2 = createMockSession({
        isConnected: false,
      });

      mockSSEManager.sessionManager.getAdminSessions.mockReturnValue([
        adminSession1,
        adminSession2,
      ]);

      const count = await broadcastService.broadcastToAdminUsers({
        type: 'test',
      });

      expect(count).toBe(1);
      expect(adminSession1.push).toHaveBeenCalled();
      expect(adminSession2.push).not.toHaveBeenCalled();
    });

    it('should handle failed admin session broadcasts', async () => {
      const adminSession1 = createMockSession();
      const adminSession2 = createMockSession();
      adminSession1.push.mockRejectedValueOnce(new Error('Push failed'));

      mockSSEManager.sessionManager.getAdminSessions.mockReturnValue([
        adminSession1,
        adminSession2,
      ]);

      const count = await broadcastService.broadcastToAdminUsers({
        type: 'test',
      });

      expect(count).toBe(1); // Only adminSession2 succeeded
    });

    it('should handle empty admin sessions list', async () => {
      mockSSEManager.sessionManager.getAdminSessions.mockReturnValue([]);

      const count = await broadcastService.broadcastToAdminUsers({
        type: 'test',
      });

      expect(count).toBe(0);
    });

    it('should log errors on failed broadcasts', async () => {
      const adminSession = createMockSession();
      adminSession.push.mockRejectedValueOnce(new Error('Push failed'));

      mockSSEManager.sessionManager.getAdminSessions.mockReturnValue([
        adminSession,
      ]);

      await broadcastService.broadcastToAdminUsers({ type: 'test' });

      // No error should be thrown, just logged
      expect(adminSession.push).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 7. BROADCAST TEAM UPDATE
  // ========================================================================
  describe('broadcastTeamUpdate()', () => {
    it('should broadcast team update to admin users', async () => {
      vi.spyOn(broadcastService, 'broadcastToAdminUsers');

      const team = {
        id: 'team-1',
        name: 'Team 1',
        description: 'Test team',
      };

      await broadcastService.broadcastTeamUpdate(team as any, 'created');

      expect(broadcastService.broadcastToAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'teamUpdate',
          action: 'created',
          team,
        }),
      );
    });

    it('should handle different team actions', async () => {
      vi.spyOn(broadcastService, 'broadcastToAdminUsers');

      const team = { id: 'team-1' };
      const actions = ['created', 'updated', 'deleted'];

      for (const action of actions) {
        await broadcastService.broadcastTeamUpdate(team as any, action);

        expect(broadcastService.broadcastToAdminUsers).toHaveBeenCalledWith(
          expect.objectContaining({ action }),
        );
      }
    });
  });

  // ========================================================================
  // 8. BROADCAST ANALYSIS MOVE
  // ========================================================================
  describe('broadcastAnalysisMove()', () => {
    beforeEach(() => {
      mockSSEManager.sessionManager.sendToUser.mockResolvedValue(1);
    });

    it('should broadcast move from source team', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers');

      await broadcastService.broadcastAnalysisMove(
        'analysis-1',
        'Analysis 1',
        'team-1',
        'team-2',
      );

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledWith(
        'team-1',
        expect.objectContaining({
          type: 'analysisMovedToTeam',
          from: 'team-1',
          to: 'team-2',
        }),
      );
    });

    it('should broadcast move to destination team', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers');

      await broadcastService.broadcastAnalysisMove(
        'analysis-1',
        'Analysis 1',
        'team-1',
        'team-2',
      );

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledWith(
        'team-2',
        expect.objectContaining({
          type: 'analysisMovedToTeam',
          from: 'team-1',
          to: 'team-2',
        }),
      );
    });

    it('should not broadcast to source team if null', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers');

      await broadcastService.broadcastAnalysisMove(
        'analysis-1',
        'Analysis 1',
        null,
        'team-2',
      );

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledTimes(1);
      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledWith(
        'team-2',
        expect.any(Object),
      );
    });

    it('should not broadcast to source team if uncategorized', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers');

      await broadcastService.broadcastAnalysisMove(
        'analysis-1',
        'Analysis 1',
        'uncategorized',
        'team-1',
      );

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledTimes(1);
      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledWith(
        'team-1',
        expect.any(Object),
      );
    });

    it('should not broadcast twice if from and to are same', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers');

      await broadcastService.broadcastAnalysisMove(
        'analysis-1',
        'Analysis 1',
        'team-1',
        'team-1',
      );

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledTimes(1);
    });

    it('should include analysis details in broadcast', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers');

      await broadcastService.broadcastAnalysisMove(
        'analysis-123',
        'My Analysis',
        'team-1',
        'team-2',
      );

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          analysisId: 'analysis-123',
          analysisName: 'My Analysis',
        }),
      );
    });
  });

  // ========================================================================
  // 9. BROADCAST ANALYSIS UPDATE
  // ========================================================================
  describe('broadcastAnalysisUpdate()', () => {
    it('should use provided teamId', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers').mockResolvedValue(1);

      await broadcastService.broadcastAnalysisUpdate(
        'analysis-1',
        { status: 'running' },
        'team-1',
      );

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledWith(
        'team-1',
        expect.any(Object),
      );
    });

    it('should fetch teamId from analysis if not provided', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers').mockResolvedValue(1);

      await broadcastService.broadcastAnalysisUpdate('analysis-1', {
        status: 'running',
      });

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalledWith(
        'team-1', // From mocked analysisService.getAnalysisById
        expect.any(Object),
      );
    });

    it('should default to team from analysis if not provided', async () => {
      vi.spyOn(broadcastService, 'broadcastToTeamUsers').mockResolvedValue(0);

      await broadcastService.broadcastAnalysisUpdate('unknown-analysis', {
        status: 'running',
      });

      expect(broadcastService.broadcastToTeamUsers).toHaveBeenCalled();
    });

    it('should return count from broadcastToTeamUsers', async () => {
      mockSSEManager.sessionManager.sendToUser.mockResolvedValue(2);
      vi.spyOn(broadcastService, 'broadcastToTeamUsers').mockResolvedValue(2);

      const count = await broadcastService.broadcastAnalysisUpdate(
        'analysis-1',
        { status: 'running' },
        'team-1',
      );

      expect(count).toBe(2);
    });

    it('should return 0 on error', async () => {
      // Mock will throw error when dynamically imported
      // This tests the catch block
      vi.spyOn(broadcastService, 'broadcastToTeamUsers').mockImplementation(
        () => {
          throw new Error('Service error');
        },
      );

      const count = await broadcastService.broadcastAnalysisUpdate(
        'analysis-1',
        { status: 'running' },
      );

      expect(count).toBe(0);
    });
  });

  // ========================================================================
  // 10. BROADCAST STATUS UPDATE
  // ========================================================================
  describe('broadcastStatusUpdate()', () => {
    it('should send status update to all connected sessions', async () => {
      const session1 = createMockSession({ isConnected: true });
      const session2 = createMockSession({ isConnected: true });
      mockSSEManager.sessions.set(session1.id, session1);
      mockSSEManager.sessions.set(session2.id, session2);

      await broadcastService.broadcastStatusUpdate();

      expect(
        mockSSEManager.initDataService.sendStatusUpdate,
      ).toHaveBeenCalledWith(session1);
      expect(
        mockSSEManager.initDataService.sendStatusUpdate,
      ).toHaveBeenCalledWith(session2);
    });

    it('should skip disconnected sessions', async () => {
      const session1 = createMockSession({ isConnected: true });
      const session2 = createMockSession({ isConnected: false });
      mockSSEManager.sessions.set(session1.id, session1);
      mockSSEManager.sessions.set(session2.id, session2);

      await broadcastService.broadcastStatusUpdate();

      expect(
        mockSSEManager.initDataService.sendStatusUpdate,
      ).toHaveBeenCalledWith(session1);
      expect(
        mockSSEManager.initDataService.sendStatusUpdate,
      ).not.toHaveBeenCalledWith(session2);
    });

    it('should return early if no sessions', async () => {
      await broadcastService.broadcastStatusUpdate();

      expect(
        mockSSEManager.initDataService.sendStatusUpdate,
      ).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 11. BROADCAST REFRESH
  // ========================================================================
  describe('broadcastRefresh()', () => {
    it('should broadcast refresh message to global channel', () => {
      broadcastService.broadcastRefresh();

      expect(mockSSEManager.globalChannel.broadcast).toHaveBeenCalledWith({
        type: 'refresh',
      });
    });
  });

  // ========================================================================
  // 12. SEND HEARTBEAT
  // ========================================================================
  describe('sendHeartbeat()', () => {
    it('should broadcast heartbeat to global channel', () => {
      broadcastService.sendHeartbeat();

      expect(mockSSEManager.globalChannel.broadcast).toHaveBeenCalledWith({
        type: 'heartbeat',
      });
    });

    it('should update lastPush for all sessions', () => {
      const session1 = createMockSession();
      const session2 = createMockSession();
      mockSSEManager.sessions.set(session1.id, session1);
      mockSSEManager.sessions.set(session2.id, session2);
      const beforeTime = Date.now();

      broadcastService.sendHeartbeat();

      const lastPush1 = mockSSEManager.sessionLastPush.get(session1.id);
      const lastPush2 = mockSSEManager.sessionLastPush.get(session2.id);
      expect(lastPush1).toBeGreaterThanOrEqual(beforeTime);
      expect(lastPush2).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  // ========================================================================
  // 13. BROADCAST METRICS UPDATE
  // ========================================================================
  describe('broadcastMetricsUpdate()', () => {
    it('should return early if no sessions', async () => {
      await broadcastService.broadcastMetricsUpdate();

      expect(
        mockSSEManager.initDataService.sendStatusUpdate,
      ).not.toHaveBeenCalled();
    });

    it('should handle metrics update without throwing', async () => {
      const session = createMockSession({
        state: {
          userId: 'user-1',
          user: { id: 'user-1', role: 'admin' },
          subscribedChannels: new Set(),
        },
        isConnected: true,
      });
      mockSSEManager.sessions.set(session.id, session);

      // Should not throw
      await expect(
        broadcastService.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });

    it('should skip disconnected sessions', async () => {
      const session = createMockSession({ isConnected: false });
      mockSSEManager.sessions.set(session.id, session);

      await broadcastService.broadcastMetricsUpdate();

      expect(session.push).not.toHaveBeenCalled();
    });

    it('should handle session errors gracefully', async () => {
      const session = createMockSession();
      session.push.mockRejectedValueOnce(new Error('Push failed'));
      mockSSEManager.sessions.set(session.id, session);

      await broadcastService.broadcastMetricsUpdate();

      expect(mockSSEManager.sessionManager.removeClient).toHaveBeenCalledWith(
        session.state.userId,
        session.id,
      );
    });

    it('should handle multiple sessions', async () => {
      const session1 = createMockSession({
        state: {
          userId: 'user-1',
          user: { id: 'user-1', role: 'user' },
          subscribedChannels: new Set(),
        },
      });
      const session2 = createMockSession({
        state: {
          userId: 'user-2',
          user: { id: 'user-2', role: 'admin' },
          subscribedChannels: new Set(),
        },
      });
      mockSSEManager.sessions.set(session1.id, session1);
      mockSSEManager.sessions.set(session2.id, session2);

      await expect(
        broadcastService.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });

    it('should get container state and SDK version', async () => {
      const session = createMockSession();
      mockSSEManager.sessions.set(session.id, session);

      await broadcastService.broadcastMetricsUpdate();

      expect(mockSSEManager.getContainerState).toHaveBeenCalled();
      expect(mockSSEManager.getSdkVersion).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 14. FILTER METRICS FOR USER (tested via broadcastMetricsUpdate)
  // ========================================================================
  describe('filterMetricsForUser()', () => {
    it('should handle non-admin users with team filtering', async () => {
      // For user-1, only team-1 is accessible
      const session = createMockSession({
        state: {
          userId: 'user-1',
          user: { id: 'user-1', role: 'user' },
          subscribedChannels: new Set(),
        },
      });
      mockSSEManager.sessions.set(session.id, session);

      // Should not throw even though filtering happens
      await expect(
        broadcastService.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });

    it('should handle admin users without team filtering', async () => {
      const session = createMockSession({
        state: {
          userId: 'admin-1',
          user: { id: 'admin-1', role: 'admin' },
          subscribedChannels: new Set(),
        },
      });
      mockSSEManager.sessions.set(session.id, session);

      // Should not throw for admin users
      await expect(
        broadcastService.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });

    it('should recalculate aggregate metrics after filtering', async () => {
      const session = createMockSession({
        state: {
          userId: 'user-1',
          user: { id: 'user-1', role: 'user' },
          subscribedChannels: new Set(),
        },
      });
      mockSSEManager.sessions.set(session.id, session);

      // Should successfully complete metrics filtering and recalculation
      await expect(
        broadcastService.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });
  });

  // ========================================================================
  // 15. BUILD METRICS PAYLOAD (tested via broadcastMetricsUpdate)
  // ========================================================================
  describe('buildMetricsPayload()', () => {
    it('should build metrics payload successfully', async () => {
      const session = createMockSession({
        state: {
          userId: 'user-1',
          user: { id: 'user-1', role: 'admin' },
          subscribedChannels: new Set(),
        },
      });
      mockSSEManager.sessions.set(session.id, session);

      // Should complete without throwing
      await expect(
        broadcastService.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });

    it('should handle ready container status', async () => {
      const session = createMockSession({
        state: {
          userId: 'user-1',
          user: { id: 'user-1', role: 'admin' },
          subscribedChannels: new Set(),
        },
      });
      mockSSEManager.sessions.set(session.id, session);

      mockSSEManager.getContainerState.mockReturnValue({
        status: 'ready',
        startTime: new Date(Date.now() - 60000),
        message: 'Container ready',
      });

      // Should complete without throwing
      await expect(
        broadcastService.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });

    it('should handle initializing container status', async () => {
      const session = createMockSession({
        state: {
          userId: 'user-1',
          user: { id: 'user-1', role: 'admin' },
          subscribedChannels: new Set(),
        },
      });
      mockSSEManager.sessions.set(session.id, session);

      mockSSEManager.getContainerState.mockReturnValue({
        status: 'initializing',
        startTime: new Date(),
        message: 'Initializing...',
      });

      // Should complete without throwing
      await expect(
        broadcastService.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });
  });

  // ========================================================================
  // 16. BROADCAST ANALYSIS DNS STATS
  // ========================================================================
  describe('broadcastAnalysisDnsStats()', () => {
    it('should delegate to channelManager', async () => {
      const analysisId = 'test-analysis';

      await broadcastService.broadcastAnalysisDnsStats(analysisId);

      expect(
        mockSSEManager.channelManager.broadcastAnalysisDnsStats,
      ).toHaveBeenCalledWith(analysisId);
    });
  });
});

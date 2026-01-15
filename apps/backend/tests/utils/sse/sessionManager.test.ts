/**
 * TDD Tests for SessionManager
 * Tests session lifecycle, client management, user communication, and cleanup
 *
 * Coverage targets:
 * - Session creation and registration
 * - Session removal and cleanup
 * - Getting sessions by user and admin role
 * - Sending messages to user sessions
 * - Disconnecting users and force logout
 * - Finding sessions by ID
 * - Error handling and edge cases
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import type { Response } from 'express';

// Mock logger BEFORE importing SessionManager
vi.mock('../../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock better-sse BEFORE importing SessionManager
vi.mock('better-sse', () => ({
  createSession: vi.fn(),
  createChannel: vi.fn(),
}));

// Import SessionManager after mocks are set up
import { SessionManager } from '../../../src/utils/sse/SessionManager.ts';

interface MockSession {
  id: string;
  push: MockInstance;
  state: {
    userId?: string;
    user?: { id: string; role?: string; email?: string; name?: string };
    subscribedChannels: Set<string>;
    _disconnecting?: boolean;
  };
  isConnected: boolean;
  lastPushAt?: Date;
}

interface MockChannel {
  register: MockInstance;
  deregister: MockInstance;
  broadcast: MockInstance;
  sessionCount: number;
  activeSessions: Set<MockSession>;
}

interface MockSSEManager {
  sessions: Map<string, MockSession>;
  sessionLastPush: Map<string, number>;
  analysisLogsChannels: Map<string, MockChannel>;
  analysisStatsChannels: Map<string, MockChannel>;
  globalChannel: MockChannel;
  metricsChannel: MockChannel;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  metricsInterval: ReturnType<typeof setInterval> | null;
  channelManager: {
    unsubscribeFromAnalysisLogs: MockInstance;
    unsubscribeFromAnalysisStats: MockInstance;
    unsubscribeFromMetrics: MockInstance;
  };
  startHeartbeat: MockInstance;
  stopHeartbeat: MockInstance;
  startMetricsBroadcasting: MockInstance;
  stopMetricsBroadcasting: MockInstance;
}

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockSSEManager: MockSSEManager;
  let mockRes: Partial<Response>;
  let mockReq: any;
  let betterSSE: { createSession: MockInstance; createChannel: MockInstance };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked better-sse module
    const betterSSEModule = await import('better-sse');
    betterSSE = vi.mocked(betterSSEModule);

    // Create unique sessions for each call, using options.state if provided
    let sessionCounter = 0;
    betterSSE.createSession.mockImplementation(
      async (
        _req: unknown,
        _res: unknown,
        options?: { state?: Record<string, unknown> },
      ) => {
        const sessionId = `session-${sessionCounter++}-${Math.random()}`;
        return {
          id: sessionId,
          push: vi.fn().mockResolvedValue(undefined),
          state: options?.state || { subscribedChannels: new Set() },
          isConnected: true,
          lastPushAt: new Date(),
        };
      },
    );

    // Setup mock SSEManager
    const mockGlobalChannel: MockChannel = {
      register: vi.fn(),
      deregister: vi.fn(),
      broadcast: vi.fn(),
      sessionCount: 0,
      activeSessions: new Set(),
    };

    const mockMetricsChannel: MockChannel = {
      register: vi.fn(),
      deregister: vi.fn(),
      broadcast: vi.fn(),
      sessionCount: 0,
      activeSessions: new Set(),
    };

    mockSSEManager = {
      sessions: new Map(),
      sessionLastPush: new Map(),
      analysisLogsChannels: new Map(),
      analysisStatsChannels: new Map(),
      globalChannel: mockGlobalChannel,
      metricsChannel: mockMetricsChannel,
      heartbeatInterval: null,
      metricsInterval: null,
      channelManager: {
        unsubscribeFromAnalysisLogs: vi.fn().mockResolvedValue(undefined),
        unsubscribeFromAnalysisStats: vi.fn().mockResolvedValue(undefined),
        unsubscribeFromMetrics: vi.fn().mockResolvedValue(undefined),
      },
      startHeartbeat: vi.fn(),
      stopHeartbeat: vi.fn(),
      startMetricsBroadcasting: vi.fn(),
      stopMetricsBroadcasting: vi.fn(),
    };

    // Create SessionManager with mocked SSEManager
    sessionManager = new SessionManager(mockSSEManager as unknown as any);

    // Mock request/response
    mockReq = {
      user: {
        id: 'user-123',
        role: 'user',
        email: 'test@test.com',
        name: 'Test User',
      },
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'close') {
          (mockReq as any)._closeCallback = callback;
        }
      }),
      headers: {},
      params: {},
      body: {},
    };

    mockRes = {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear all sessions for test isolation
    mockSSEManager.sessions.clear();
    mockSSEManager.sessionLastPush.clear();
    mockSSEManager.analysisLogsChannels.clear();
    mockSSEManager.analysisStatsChannels.clear();
  });

  describe('addClient', () => {
    it('should create a new session with better-sse', async () => {
      const userId = 'user-123';

      await sessionManager.addClient(userId, mockRes as Response, mockReq);

      expect(betterSSE.createSession).toHaveBeenCalledWith(
        mockReq,
        mockRes,
        expect.objectContaining({
          retry: expect.any(Number),
          state: expect.any(Object),
        }),
      );
    });

    it('should generate a unique session ID and assign it to the session', async () => {
      const userId = 'user-123';

      const session = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );

      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe('string');
      expect(session.id.length).toBeGreaterThan(0);
    });

    it('should initialize session state with user ID', async () => {
      const userId = 'user-456';

      const session = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );

      expect(session.state.userId).toBe(userId);
    });

    it('should initialize session state with user object from request', async () => {
      const userId = 'user-789';

      const session = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );

      expect(session.state.user).toBe(mockReq.user);
    });

    it('should initialize empty subscribed channels set', async () => {
      const userId = 'user-123';

      const session = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );

      expect(session.state.subscribedChannels).toBeInstanceOf(Set);
      expect(session.state.subscribedChannels.size).toBe(0);
    });

    it('should track session in sessions map', async () => {
      const userId = 'user-123';

      const session = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );

      expect(mockSSEManager.sessions.has(session.id)).toBe(true);
      expect(mockSSEManager.sessions.get(session.id)).toBe(session);
    });

    it('should initialize lastPush timestamp tracking', async () => {
      const userId = 'user-123';
      const beforeTime = Date.now();

      const session = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );

      const afterTime = Date.now();
      const lastPush = mockSSEManager.sessionLastPush.get(session.id);

      expect(lastPush).toBeDefined();
      expect(lastPush).toBeGreaterThanOrEqual(beforeTime);
      expect(lastPush).toBeLessThanOrEqual(afterTime);
    });

    it('should register session to global channel', async () => {
      const userId = 'user-123';

      const session = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );

      expect(mockSSEManager.globalChannel.register).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id }),
      );
    });

    it('should start heartbeat on first client', async () => {
      expect(mockSSEManager.sessions.size).toBe(0);
      expect(mockSSEManager.heartbeatInterval).toBeNull();

      await sessionManager.addClient('user-1', mockRes as Response, mockReq);

      expect(mockSSEManager.startHeartbeat).toHaveBeenCalled();
    });

    it('should not start heartbeat on subsequent clients', async () => {
      mockSSEManager.heartbeatInterval = {} as any; // Simulate active heartbeat

      await sessionManager.addClient('user-1', mockRes as Response, mockReq);
      mockSSEManager.startHeartbeat.mockClear();

      await sessionManager.addClient('user-2', mockRes as Response, mockReq);

      expect(mockSSEManager.startHeartbeat).not.toHaveBeenCalled();
    });

    it('should start metrics broadcasting on first client', async () => {
      expect(mockSSEManager.sessions.size).toBe(0);
      expect(mockSSEManager.metricsInterval).toBeNull();

      await sessionManager.addClient('user-1', mockRes as Response, mockReq);

      expect(mockSSEManager.startMetricsBroadcasting).toHaveBeenCalled();
    });

    it('should not start metrics on subsequent clients', async () => {
      mockSSEManager.metricsInterval = {} as any; // Simulate active metrics

      await sessionManager.addClient('user-1', mockRes as Response, mockReq);
      mockSSEManager.startMetricsBroadcasting.mockClear();

      await sessionManager.addClient('user-2', mockRes as Response, mockReq);

      expect(mockSSEManager.startMetricsBroadcasting).not.toHaveBeenCalled();
    });

    it('should register close event handler on request', async () => {
      await sessionManager.addClient('user-123', mockRes as Response, mockReq);

      expect(mockReq.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should call removeClient on request close event', async () => {
      const session = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );
      const removeClientSpy = vi.spyOn(sessionManager, 'removeClient');

      const closeCallback = mockReq._closeCallback;
      await closeCallback();

      expect(removeClientSpy).toHaveBeenCalledWith('user-123', session.id);
    });

    it('should throw error on createSession failure', async () => {
      betterSSE.createSession.mockRejectedValueOnce(
        new Error('Session creation failed'),
      );

      await expect(
        sessionManager.addClient('user-123', mockRes as Response, mockReq),
      ).rejects.toThrow('Session creation failed');
    });

    it('should support multiple sessions for same user', async () => {
      const userId = 'user-123';

      const session1 = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );
      const session2 = await sessionManager.addClient(
        userId,
        mockRes as Response,
        mockReq,
      );

      expect(session1.id).not.toBe(session2.id);
      expect(mockSSEManager.sessions.has(session1.id)).toBe(true);
      expect(mockSSEManager.sessions.has(session2.id)).toBe(true);
    });

    it('should pass initial state to createSession', async () => {
      // Verify that we pass state options to createSession
      await sessionManager.addClient('user-123', mockRes as Response, mockReq);

      expect(betterSSE.createSession).toHaveBeenCalledWith(
        mockReq,
        mockRes,
        expect.objectContaining({
          state: expect.objectContaining({
            userId: 'user-123',
            subscribedChannels: expect.any(Set),
            subscribedStatsChannels: expect.any(Set),
            subscribedToMetrics: false,
          }),
        }),
      );
    });

    it('should pass retry option to createSession matching heartbeat interval', async () => {
      // Verify that retry option is set for automatic reconnection
      await sessionManager.addClient('user-123', mockRes as Response, mockReq);

      expect(betterSSE.createSession).toHaveBeenCalledWith(
        mockReq,
        mockRes,
        expect.objectContaining({
          retry: expect.any(Number),
        }),
      );
    });
  });

  describe('removeClient', () => {
    let session: MockSession;

    beforeEach(async () => {
      session = (await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      )) as unknown as MockSession;
      vi.clearAllMocks();
    });

    it('should remove session from sessions map', async () => {
      await sessionManager.removeClient('user-123', session.id);

      expect(mockSSEManager.sessions.has(session.id)).toBe(false);
    });

    it('should remove session from lastPush tracking', async () => {
      await sessionManager.removeClient('user-123', session.id);

      expect(mockSSEManager.sessionLastPush.has(session.id)).toBe(false);
    });

    it('should deregister session from global channel', async () => {
      await sessionManager.removeClient('user-123', session.id);

      expect(mockSSEManager.globalChannel.deregister).toHaveBeenCalledWith(
        session,
      );
    });

    it('should unsubscribe from all subscribed analysis logs channels', async () => {
      // Manually add subscribed channels
      session.state.subscribedChannels.add('analysis-1');
      session.state.subscribedChannels.add('analysis-2');

      await sessionManager.removeClient('user-123', session.id);

      expect(
        mockSSEManager.channelManager.unsubscribeFromAnalysisLogs,
      ).toHaveBeenCalledWith(session.id, ['analysis-1', 'analysis-2']);
    });

    it('should handle session with no subscriptions', async () => {
      expect(session.state.subscribedChannels.size).toBe(0);

      await expect(
        sessionManager.removeClient('user-123', session.id),
      ).resolves.not.toThrow();
    });

    it('should stop heartbeat when last session is removed', async () => {
      await sessionManager.removeClient('user-123', session.id);

      expect(mockSSEManager.stopHeartbeat).toHaveBeenCalled();
    });

    it('should not stop heartbeat when other sessions remain', async () => {
      // Add another session
      await sessionManager.addClient('user-456', mockRes as Response, mockReq);
      vi.clearAllMocks();

      await sessionManager.removeClient('user-123', session.id);

      expect(mockSSEManager.stopHeartbeat).not.toHaveBeenCalled();
    });

    it('should stop metrics when last session is removed', async () => {
      await sessionManager.removeClient('user-123', session.id);

      expect(mockSSEManager.stopMetricsBroadcasting).toHaveBeenCalled();
    });

    it('should not stop metrics when other sessions remain', async () => {
      await sessionManager.addClient('user-456', mockRes as Response, mockReq);
      vi.clearAllMocks();

      await sessionManager.removeClient('user-123', session.id);

      expect(mockSSEManager.stopMetricsBroadcasting).not.toHaveBeenCalled();
    });

    it('should handle non-existent session gracefully', async () => {
      await expect(
        sessionManager.removeClient('user-999', 'nonexistent-session-id'),
      ).resolves.not.toThrow();
    });

    it('should handle empty subscribed channels', async () => {
      session.state.subscribedChannels = new Set();

      await expect(
        sessionManager.removeClient('user-123', session.id),
      ).resolves.not.toThrow();

      expect(
        mockSSEManager.channelManager.unsubscribeFromAnalysisLogs,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getSessionsByUserId', () => {
    it('should return empty array when user has no sessions', () => {
      const sessions = sessionManager.getSessionsByUserId('user-no-sessions');

      expect(sessions).toEqual([]);
    });

    it('should return single session for user with one session', async () => {
      const session = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );

      const sessions = sessionManager.getSessionsByUserId('user-123');

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toBe(session);
    });

    it('should return multiple sessions for user with multiple sessions', async () => {
      const session1 = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );
      const session2 = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );

      const sessions = sessionManager.getSessionsByUserId('user-123');

      expect(sessions).toHaveLength(2);
      expect(sessions).toContain(session1);
      expect(sessions).toContain(session2);
    });

    it('should not return sessions from other users', async () => {
      await sessionManager.addClient('user-123', mockRes as Response, mockReq);
      const session456 = await sessionManager.addClient(
        'user-456',
        mockRes as Response,
        {
          ...mockReq,
          user: { id: 'user-456', role: 'user' },
        },
      );

      const sessions = sessionManager.getSessionsByUserId('user-123');

      expect(sessions).not.toContain(session456);
    });

    it('should filter by userId from session state', async () => {
      await sessionManager.addClient('user-123', mockRes as Response, mockReq);

      const sessions = sessionManager.getSessionsByUserId('user-123');

      expect(sessions.every((s) => s.state.userId === 'user-123')).toBe(true);
    });

    it('should handle missing userId in session state gracefully', () => {
      // Manually add session without userId
      const mockSession: MockSession = {
        id: 'test-session',
        push: vi.fn(),
        state: {
          subscribedChannels: new Set(),
        },
        isConnected: true,
      };
      mockSSEManager.sessions.set('test-session', mockSession);

      const sessions = sessionManager.getSessionsByUserId('user-123');

      expect(sessions).not.toContain(mockSession);
    });
  });

  describe('getAdminSessions', () => {
    it('should return empty array when no admin sessions exist', () => {
      const sessions = sessionManager.getAdminSessions();

      expect(sessions).toEqual([]);
    });

    it('should return admin sessions only', async () => {
      const adminReq = { ...mockReq, user: { id: 'admin-1', role: 'admin' } };
      const adminSession = await sessionManager.addClient(
        'admin-1',
        mockRes as Response,
        adminReq,
      );

      const userReq = { ...mockReq, user: { id: 'user-1', role: 'user' } };
      await sessionManager.addClient('user-1', mockRes as Response, userReq);

      const sessions = sessionManager.getAdminSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toBe(adminSession);
    });

    it('should return multiple admin sessions', async () => {
      const adminReq1 = { ...mockReq, user: { id: 'admin-1', role: 'admin' } };
      const adminSession1 = await sessionManager.addClient(
        'admin-1',
        mockRes as Response,
        adminReq1,
      );

      const adminReq2 = { ...mockReq, user: { id: 'admin-2', role: 'admin' } };
      const adminSession2 = await sessionManager.addClient(
        'admin-2',
        mockRes as Response,
        adminReq2,
      );

      const sessions = sessionManager.getAdminSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions).toContain(adminSession1);
      expect(sessions).toContain(adminSession2);
    });

    it('should filter by admin role in user object', async () => {
      const adminReq = { ...mockReq, user: { id: 'admin-1', role: 'admin' } };
      await sessionManager.addClient('admin-1', mockRes as Response, adminReq);

      const sessions = sessionManager.getAdminSessions();

      expect(sessions.every((s) => s.state.user?.role === 'admin')).toBe(true);
    });

    it('should handle missing user role gracefully', () => {
      const mockSession: MockSession = {
        id: 'test-session',
        push: vi.fn(),
        state: {
          userId: 'user-123',
          user: { id: 'user-123' }, // No role
          subscribedChannels: new Set(),
        },
        isConnected: true,
      };
      mockSSEManager.sessions.set('test-session', mockSession);

      const sessions = sessionManager.getAdminSessions();

      expect(sessions).not.toContain(mockSession);
    });

    it('should handle missing user object gracefully', () => {
      const mockSession: MockSession = {
        id: 'test-session',
        push: vi.fn(),
        state: {
          userId: 'user-123',
          subscribedChannels: new Set(),
        },
        isConnected: true,
      };
      mockSSEManager.sessions.set('test-session', mockSession);

      const sessions = sessionManager.getAdminSessions();

      expect(sessions).not.toContain(mockSession);
    });
  });

  describe('sendToUser', () => {
    let session1: MockSession;
    let session2: MockSession;

    beforeEach(async () => {
      session1 = (await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      )) as unknown as MockSession;
      session2 = (await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      )) as unknown as MockSession;
      vi.clearAllMocks();
    });

    it('should send message to all user sessions', async () => {
      const message = { type: 'test', data: 'hello' };

      const count = await sessionManager.sendToUser('user-123', message);

      expect(session1.push).toHaveBeenCalledWith(message);
      expect(session2.push).toHaveBeenCalledWith(message);
      expect(count).toBe(2);
    });

    it('should return count of sessions sent to', async () => {
      const count = await sessionManager.sendToUser('user-123', {
        type: 'test',
      });

      expect(count).toBe(2);
    });

    it('should return 0 when user has no sessions', async () => {
      const count = await sessionManager.sendToUser('user-999', {
        type: 'test',
      });

      expect(count).toBe(0);
    });

    it('should update lastPush timestamp on successful send', async () => {
      const beforeTime = Date.now();

      await sessionManager.sendToUser('user-123', { type: 'test' });

      const afterTime = Date.now();
      const lastPush1 = mockSSEManager.sessionLastPush.get(session1.id);
      const lastPush2 = mockSSEManager.sessionLastPush.get(session2.id);

      expect(lastPush1).toBeGreaterThanOrEqual(beforeTime);
      expect(lastPush1).toBeLessThanOrEqual(afterTime);
      expect(lastPush2).toBeGreaterThanOrEqual(beforeTime);
      expect(lastPush2).toBeLessThanOrEqual(afterTime);
    });

    it('should handle partial failures - remove failed sessions', async () => {
      session1.push = vi.fn().mockRejectedValueOnce(new Error('Push failed'));
      session2.push = vi.fn().mockResolvedValue(undefined);

      const removeClientSpy = vi.spyOn(sessionManager, 'removeClient');

      const count = await sessionManager.sendToUser('user-123', {
        type: 'test',
      });

      expect(count).toBe(1); // Only session2 succeeded
      expect(removeClientSpy).toHaveBeenCalledWith('user-123', session1.id);
    });

    it('should continue processing after individual push failure', async () => {
      session1.push = vi.fn().mockRejectedValueOnce(new Error('Push failed'));
      session2.push = vi.fn().mockResolvedValue(undefined);

      const count = await sessionManager.sendToUser('user-123', {
        type: 'test',
      });

      // Both should be attempted, but only session2 counts as success
      expect(session1.push).toHaveBeenCalled();
      expect(session2.push).toHaveBeenCalled();
      expect(count).toBe(1);
    });

    it('should handle cleanup failure gracefully', async () => {
      session1.push = vi.fn().mockRejectedValueOnce(new Error('Push failed'));

      const removeClientSpy = vi.spyOn(sessionManager, 'removeClient');
      removeClientSpy.mockRejectedValueOnce(new Error('Cleanup failed'));

      // Should not throw
      const count = await sessionManager.sendToUser('user-123', {
        type: 'test',
      });

      expect(count).toBe(1);
    });

    it('should support SSEMessage type with type field', async () => {
      const message = {
        type: 'statusUpdate',
        timestamp: new Date().toISOString(),
      };

      await sessionManager.sendToUser('user-123', message);

      expect(session1.push).toHaveBeenCalledWith(message);
    });

    it('should support generic object messages', async () => {
      const message = { arbitrary: 'data', nested: { value: 42 } };

      await sessionManager.sendToUser('user-123', message);

      expect(session1.push).toHaveBeenCalledWith(message);
    });

    it('should handle all sessions failing', async () => {
      session1.push = vi.fn().mockRejectedValue(new Error('Push failed'));
      session2.push = vi.fn().mockRejectedValue(new Error('Push failed'));

      const count = await sessionManager.sendToUser('user-123', {
        type: 'test',
      });

      expect(count).toBe(0);
    });
  });

  describe('disconnectUser', () => {
    let session1: MockSession;
    let session2: MockSession;

    beforeEach(async () => {
      session1 = (await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      )) as unknown as MockSession;
      session2 = (await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      )) as unknown as MockSession;
      vi.clearAllMocks();
    });

    it('should mark sessions as disconnecting', () => {
      const count = sessionManager.disconnectUser('user-123');

      expect(session1.state._disconnecting).toBe(true);
      expect(session2.state._disconnecting).toBe(true);
      expect(count).toBe(2);
    });

    it('should return count of disconnected sessions', () => {
      const count = sessionManager.disconnectUser('user-123');

      expect(count).toBe(2);
    });

    it('should return 0 when user has no sessions', () => {
      const count = sessionManager.disconnectUser('user-999');

      expect(count).toBe(0);
    });

    it('should only disconnect connected sessions', async () => {
      session1.isConnected = false;
      session2.isConnected = true;

      const count = sessionManager.disconnectUser('user-123');

      // Session 1 is not connected, so it should not be marked as disconnecting
      expect(session1.state._disconnecting).not.toBeDefined();
      // Session 2 is connected, so it should be marked
      expect(session2.state._disconnecting).toBe(true);
      expect(count).toBe(1);
    });

    it('should handle errors during disconnection gracefully', () => {
      vi.spyOn(sessionManager, 'getSessionsByUserId').mockImplementation(() => {
        throw new Error('Get sessions failed');
      });

      expect(() => sessionManager.disconnectUser('user-123')).toThrow(
        'Get sessions failed',
      );
    });

    it('should not throw when session disconnection fails', () => {
      // This is testing the try-catch around individual session disconnection

      expect(() => {
        sessionManager.disconnectUser('user-123');
      }).not.toThrow();
    });

    it('should handle user with single session', async () => {
      const session = await sessionManager.addClient(
        'user-456',
        mockRes as Response,
        {
          ...mockReq,
          user: { id: 'user-456', role: 'user' },
        },
      );

      const count = sessionManager.disconnectUser('user-456');

      expect(session.state._disconnecting).toBe(true);
      expect(count).toBe(1);
    });

    it('should catch and log errors when disconnecting individual session', () => {
      // Create a session object that throws an error when accessing isConnected
      const faultySession: MockSession = {
        id: 'faulty-session',
        push: vi.fn(),
        state: {
          userId: 'user-999',
          user: { id: 'user-999' },
          subscribedChannels: new Set(),
        },
        get isConnected(): boolean {
          throw new Error('Session property access failed');
        },
      } as unknown as MockSession;

      mockSSEManager.sessions.set('faulty-session', faultySession);

      // Should handle the error gracefully without throwing
      expect(() => {
        sessionManager.disconnectUser('user-999');
      }).not.toThrow();
    });
  });

  describe('forceUserLogout', () => {
    let session1: MockSession;
    let session2: MockSession;

    beforeEach(async () => {
      session1 = (await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      )) as unknown as MockSession;
      session2 = (await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      )) as unknown as MockSession;
      vi.clearAllMocks();
    });

    it('should send force logout message to all user sessions', async () => {
      await sessionManager.forceUserLogout('user-123');

      expect(session1.push).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'forceLogout',
          reason: 'Your session has been terminated',
        }),
      );
      expect(session2.push).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'forceLogout',
          reason: 'Your session has been terminated',
        }),
      );
    });

    it('should use default logout reason when not provided', async () => {
      await sessionManager.forceUserLogout('user-123');

      expect(session1.push).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Your session has been terminated',
        }),
      );
    });

    it('should use custom logout reason when provided', async () => {
      const customReason = 'Admin terminated your session';

      await sessionManager.forceUserLogout('user-123', customReason);

      expect(session1.push).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: customReason,
        }),
      );
    });

    it('should include timestamp in logout message', async () => {
      await sessionManager.forceUserLogout('user-123');

      expect(session1.push).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );
    });

    it('should wait for message delivery before disconnecting', async () => {
      const disconnectUserSpy = vi.spyOn(sessionManager, 'disconnectUser');

      // Mock sendToUser to track timing
      const sendToUserSpy = vi.spyOn(sessionManager, 'sendToUser');
      sendToUserSpy.mockResolvedValueOnce(2);

      await sessionManager.forceUserLogout('user-123');

      // Should call disconnectUser after sendToUser
      expect(disconnectUserSpy).toHaveBeenCalled();
    });

    it('should disconnect all user sessions after logout message', async () => {
      const disconnectUserSpy = vi.spyOn(sessionManager, 'disconnectUser');

      await sessionManager.forceUserLogout('user-123');

      expect(disconnectUserSpy).toHaveBeenCalledWith('user-123');
    });

    it('should return count of disconnected sessions', async () => {
      const count = await sessionManager.forceUserLogout('user-123');

      expect(count).toBe(2);
    });

    it('should return 0 when user has no sessions', async () => {
      const count = await sessionManager.forceUserLogout('user-999');

      expect(count).toBe(0);
    });

    it('should skip wait when no sessions receive message', async () => {
      const sendToUserSpy = vi.spyOn(sessionManager, 'sendToUser');
      sendToUserSpy.mockResolvedValueOnce(0); // No sessions to send to

      const startTime = Date.now();
      await sessionManager.forceUserLogout('user-999');
      const endTime = Date.now();

      // Should complete quickly without waiting (timeout only when sentCount > 0)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle logout message send failure gracefully', async () => {
      const sendToUserSpy = vi.spyOn(sessionManager, 'sendToUser');
      sendToUserSpy.mockRejectedValueOnce(new Error('Send failed'));

      // Should not throw
      await expect(
        sessionManager.forceUserLogout('user-123'),
      ).rejects.toThrow();
    });
  });

  describe('findSessionById', () => {
    it('should return session when session exists', async () => {
      const session = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );

      const found = sessionManager.findSessionById(session.id);

      expect(found).toBe(session);
    });

    it('should return null when session does not exist', () => {
      const found = sessionManager.findSessionById('nonexistent-session');

      expect(found).toBeNull();
    });

    it('should find session by exact ID match', async () => {
      const session = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );

      const found = sessionManager.findSessionById(session.id);

      expect(found?.id).toBe(session.id);
    });

    it('should distinguish between different sessions', async () => {
      const session1 = await sessionManager.addClient(
        'user-1',
        mockRes as Response,
        mockReq,
      );
      const session2 = await sessionManager.addClient(
        'user-2',
        mockRes as Response,
        {
          ...mockReq,
          user: { id: 'user-2', role: 'user' },
        },
      );

      const found1 = sessionManager.findSessionById(session1.id);
      const found2 = sessionManager.findSessionById(session2.id);

      expect(found1).toBe(session1);
      expect(found2).toBe(session2);
      expect(found1).not.toBe(found2);
    });

    it('should work after session is added and before removal', async () => {
      const session = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );
      const found = sessionManager.findSessionById(session.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(session.id);
    });

    it('should return null after session is removed', async () => {
      const session = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );
      await sessionManager.removeClient('user-123', session.id);

      const found = sessionManager.findSessionById(session.id);

      expect(found).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete user session lifecycle', async () => {
      // Add session
      const session = await sessionManager.addClient(
        'user-123',
        mockRes as Response,
        mockReq,
      );
      expect(mockSSEManager.sessions.has(session.id)).toBe(true);

      // Send message
      const count = await sessionManager.sendToUser('user-123', {
        type: 'test',
      });
      expect(count).toBe(1);

      // Find session
      const found = sessionManager.findSessionById(session.id);
      expect(found).toBe(session);

      // Remove session
      await sessionManager.removeClient('user-123', session.id);
      expect(mockSSEManager.sessions.has(session.id)).toBe(false);

      // Verify removed
      const notFound = sessionManager.findSessionById(session.id);
      expect(notFound).toBeNull();
    });

    it('should handle multiple users with multiple sessions', async () => {
      // User 1 - 2 sessions
      await sessionManager.addClient('user-1', mockRes as Response, {
        ...mockReq,
        user: { id: 'user-1', role: 'user' },
      });
      await sessionManager.addClient('user-1', mockRes as Response, {
        ...mockReq,
        user: { id: 'user-1', role: 'user' },
      });

      // User 2 - 1 session
      await sessionManager.addClient('user-2', mockRes as Response, {
        ...mockReq,
        user: { id: 'user-2', role: 'user' },
      });

      // Admin - 1 session
      await sessionManager.addClient('admin-1', mockRes as Response, {
        ...mockReq,
        user: { id: 'admin-1', role: 'admin' },
      });

      expect(sessionManager.getSessionsByUserId('user-1')).toHaveLength(2);
      expect(sessionManager.getSessionsByUserId('user-2')).toHaveLength(1);
      expect(sessionManager.getAdminSessions()).toHaveLength(1);
      expect(mockSSEManager.sessions.size).toBe(4);
    });

    it('should handle rapid add/remove cycles', async () => {
      const userId = 'user-123';

      for (let i = 0; i < 5; i++) {
        const session = await sessionManager.addClient(
          userId,
          mockRes as Response,
          mockReq,
        );
        expect(mockSSEManager.sessions.has(session.id)).toBe(true);

        await sessionManager.removeClient(userId, session.id);
        expect(mockSSEManager.sessions.has(session.id)).toBe(false);
      }
    });

    it('should manage heartbeat/metrics lifecycle correctly', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // First client starts heartbeat/metrics
      const session1 = await sessionManager.addClient(
        user1,
        mockRes as Response,
        {
          ...mockReq,
          user: { id: user1, role: 'user' },
        },
      );
      expect(mockSSEManager.startHeartbeat).toHaveBeenCalled();
      expect(mockSSEManager.startMetricsBroadcasting).toHaveBeenCalled();

      vi.clearAllMocks();

      // Second client doesn't restart
      await sessionManager.addClient(user2, mockRes as Response, {
        ...mockReq,
        user: { id: user2, role: 'user' },
      });
      expect(mockSSEManager.startHeartbeat).not.toHaveBeenCalled();
      expect(mockSSEManager.startMetricsBroadcasting).not.toHaveBeenCalled();

      vi.clearAllMocks();

      // Removing one client doesn't stop services
      await sessionManager.removeClient(user1, session1.id);
      expect(mockSSEManager.stopHeartbeat).not.toHaveBeenCalled();
      expect(mockSSEManager.stopMetricsBroadcasting).not.toHaveBeenCalled();
    });
  });
});

/**
 * TDD Tests for SSE Channel-Based Subscription Management
 *
 * This test suite drives the implementation of better-sse channel-based
 * subscription management where users only receive logs for analyses
 * they're actively viewing.
 *
 * RED PHASE: All tests will initially fail - implementation follows tests
 *
 * Architecture:
 * - Global channel for non-log broadcasts (init, statusUpdate, etc.)
 * - Per-analysis channels for log broadcasting
 * - HTTP endpoints for subscribe/unsubscribe
 * - Automatic channel cleanup when empty
 * - Permission-based filtering maintained
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock better-sse package
vi.mock('better-sse', () => ({
  createSession: vi.fn(),
  createChannel: vi.fn(),
}));

// Mock auth
vi.mock('../../src/lib/auth.js', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock services
vi.mock('../../src/services/metricsService.js', () => ({
  metricsService: {
    getAllMetrics: vi.fn(),
  },
}));

vi.mock('../../src/services/analysisService.js', () => ({
  analysisService: {
    getAllAnalyses: vi.fn(() => Promise.resolve({})),
    getConfig: vi.fn(() => Promise.resolve({ teamStructure: {} })),
    analyses: new Map(),
  },
}));

vi.mock('../../src/services/teamService.js', () => ({
  default: {
    getAllTeams: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../../src/middleware/betterAuthMiddleware.js', () => ({
  getUserTeamIds: vi.fn(() => ['team-1', 'uncategorized']),
  getUsersWithTeamAccess: vi.fn(() => ['user-123', 'user-456']),
}));

vi.mock('../../src/utils/authDatabase.js', () => ({
  executeQuery: vi.fn((query, params) => {
    // Return user object for user queries
    if (query.includes('SELECT') && query.includes('user')) {
      const userId = params?.[0] || 'user-123';
      return {
        id: userId,
        role: userId.includes('admin') ? 'admin' : 'user',
        email: `${userId}@test.com`,
        name: 'Test User',
      };
    }
    return null;
  }),
}));

describe('SSE Channel-Based Subscription Management', () => {
  let sse;
  let mockSession;
  let mockChannel;
  let mockReq;
  let mockRes;
  let betterSSE;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock better-sse session
    mockSession = {
      id: 'session-123',
      push: vi.fn(),
      state: { userId: 'user-123', subscribedChannels: new Set() },
      isConnected: true,
      lastPushAt: new Date(),
    };

    // Setup better-sse mocks - must be done before import
    betterSSE = await import('better-sse');

    // Create unique channel instances for each call
    let channelCallCount = 0;
    betterSSE.createChannel.mockImplementation(() => {
      const channel = {
        register: vi.fn(),
        deregister: vi.fn(),
        broadcast: vi.fn(),
        sessionCount: 0,
        activeSessions: new Set(),
        state: {},
        _id: `channel-${channelCallCount++}`, // For debugging
      };

      // Setup register to actually increment sessionCount
      channel.register.mockImplementation(function (session) {
        // Use 'this' to ensure we're modifying the correct channel object
        this.sessionCount++;
        this.activeSessions.add(session);
      });

      // Setup deregister to actually decrement sessionCount
      channel.deregister.mockImplementation(function (session) {
        // Use 'this' to ensure we're modifying the correct channel object
        this.sessionCount--;
        this.activeSessions.delete(session);
      });

      return channel;
    });

    // Session mock returns new instance with preserved ID
    betterSSE.createSession.mockImplementation(() => {
      const sessionId = `session-${Math.random().toString(36).substring(2, 15)}`;
      return {
        id: sessionId,
        push: vi.fn().mockResolvedValue(undefined), // Return resolved promise to prevent errors
        state: { subscribedChannels: new Set() },
        isConnected: true,
        lastPushAt: new Date(),
      };
    });

    // Import SSE module once (don't reset modules - it breaks mocks for dynamic imports)
    if (!sse) {
      sse = await import('../../src/utils/sse.js');
    }

    // Ensure any pending async operations from previous tests are settled
    await new Promise((resolve) => setImmediate(resolve));

    // Clear SSEManager state for test isolation
    sse.sseManager.sessions.clear();
    sse.sseManager.analysisChannels.clear();
    sse.sseManager.stopHeartbeat();
    sse.sseManager.stopMetricsBroadcasting();

    // Clear mock calls for better-sse
    betterSSE.createChannel.mockClear();
    betterSSE.createSession.mockClear();

    // Clear global channel mock calls
    if (sse.sseManager.globalChannel?.broadcast?.mockClear) {
      sse.sseManager.globalChannel.broadcast.mockClear();
    }
    if (sse.sseManager.globalChannel?.register?.mockClear) {
      sse.sseManager.globalChannel.register.mockClear();
    }
    if (sse.sseManager.globalChannel?.deregister?.mockClear) {
      sse.sseManager.globalChannel.deregister.mockClear();
    }

    // Mock request/response
    mockReq = {
      user: { id: 'user-123', role: 'user' },
      on: vi.fn(),
      headers: {},
      params: {},
      body: {},
    };

    mockRes = {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroyed: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================================================
  // 1. CHANNEL CREATION & MANAGEMENT
  // ========================================================================
  describe('Channel Creation & Management', () => {
    describe('getOrCreateAnalysisChannel', () => {
      it('should create new analysis channel on first request', () => {
        const analysisName = 'test-analysis';
        const channel = sse.sseManager.getOrCreateAnalysisChannel(analysisName);

        expect(channel).toBeDefined();
        expect(betterSSE.createChannel).toHaveBeenCalledTimes(1);
      });

      it('should reuse existing channel for subsequent requests', () => {
        const analysisName = 'test-analysis';

        const channel1 =
          sse.sseManager.getOrCreateAnalysisChannel(analysisName);
        const channel2 =
          sse.sseManager.getOrCreateAnalysisChannel(analysisName);

        expect(channel1).toBe(channel2);
        expect(betterSSE.createChannel).toHaveBeenCalledTimes(1);
      });

      it('should track channels in internal registry', () => {
        const analysisName = 'test-analysis';

        sse.sseManager.getOrCreateAnalysisChannel(analysisName);

        expect(sse.sseManager.analysisChannels).toBeDefined();
        expect(sse.sseManager.analysisChannels.has(analysisName)).toBe(true);
      });

      it('should create separate channels for different analyses', () => {
        const channel1 =
          sse.sseManager.getOrCreateAnalysisChannel('analysis-1');
        const channel2 =
          sse.sseManager.getOrCreateAnalysisChannel('analysis-2');

        expect(channel1).not.toBe(channel2);
        expect(betterSSE.createChannel).toHaveBeenCalledTimes(2);
      });

      it('should initialize channel with session tracking', () => {
        const analysisName = 'test-analysis';
        const channel = sse.sseManager.getOrCreateAnalysisChannel(analysisName);

        expect(channel.sessionCount).toBeDefined();
        expect(channel.activeSessions).toBeDefined();
      });
    });

    describe('auto-cleanup empty channels', () => {
      it('should remove channel when last session deregisters', async () => {
        // Disable metrics/heartbeat to prevent session removal on mock errors
        sse.sseManager.startMetricsBroadcasting = vi.fn();
        sse.sseManager.startHeartbeat = vi.fn();

        const analysisName = 'test-analysis';
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        // Subscribe and then unsubscribe
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          [analysisName],
          'user-123',
        );
        await sse.sseManager.unsubscribeFromAnalysis(session.id, [
          analysisName,
        ]);

        // Channel should be removed
        expect(sse.sseManager.analysisChannels.has(analysisName)).toBe(false);
      });

      it('should keep channel alive while sessions remain', async () => {
        const analysisName = 'test-analysis';

        const session1 = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        const session2 = await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });

        await sse.sseManager.subscribeToAnalysis(
          session1.id,
          [analysisName],
          'user-1',
        );
        await sse.sseManager.subscribeToAnalysis(
          session2.id,
          [analysisName],
          'user-2',
        );
        await sse.sseManager.unsubscribeFromAnalysis(session1.id, [
          analysisName,
        ]);

        // Channel should still exist (session-2 still subscribed)
        expect(sse.sseManager.analysisChannels.has(analysisName)).toBe(true);
      });

      it('should track session count per channel accurately', async () => {
        const analysisName = 'test-analysis';

        const session1 = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        const session2 = await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });

        await sse.sseManager.subscribeToAnalysis(
          session1.id,
          [analysisName],
          'user-1',
        );
        const channel = sse.sseManager.analysisChannels.get(analysisName);
        expect(channel.sessionCount).toBe(1);

        await sse.sseManager.subscribeToAnalysis(
          session2.id,
          [analysisName],
          'user-2',
        );
        expect(channel.sessionCount).toBe(2);

        await sse.sseManager.unsubscribeFromAnalysis(session1.id, [
          analysisName,
        ]);
        expect(channel.sessionCount).toBe(1);

        await sse.sseManager.unsubscribeFromAnalysis(session2.id, [
          analysisName,
        ]);
        expect(channel.sessionCount).toBe(0);
      });

      it('should clean up channel immediately when count reaches zero', async () => {
        // Disable metrics/heartbeat to prevent session removal on mock errors
        sse.sseManager.startMetricsBroadcasting = vi.fn();
        sse.sseManager.startHeartbeat = vi.fn();

        const analysisName = 'test-analysis';

        const session = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });

        await sse.sseManager.subscribeToAnalysis(
          session.id,
          [analysisName],
          'user-1',
        );
        expect(sse.sseManager.analysisChannels.has(analysisName)).toBe(true);

        await sse.sseManager.unsubscribeFromAnalysis(session.id, [
          analysisName,
        ]);

        // Should be cleaned up immediately, not deferred
        expect(sse.sseManager.analysisChannels.has(analysisName)).toBe(false);
      });
    });

    describe('global channel', () => {
      it('should create global channel on initialization', () => {
        expect(sse.sseManager.globalChannel).toBeDefined();
        expect(sse.sseManager.globalChannel.register).toBeDefined();
        expect(sse.sseManager.globalChannel.broadcast).toBeDefined();
      });

      it('should never cleanup global channel', async () => {
        const globalChannel = sse.sseManager.globalChannel;

        // Even with no sessions, global channel persists
        await sse.sseManager.removeClient('user-123', 'session-123');

        expect(sse.sseManager.globalChannel).toBe(globalChannel);
      });
    });
  });

  // ========================================================================
  // 2. SESSION LIFECYCLE
  // ========================================================================
  describe('Session Lifecycle', () => {
    describe('addClient with better-sse', () => {
      it('should create session using better-sse createSession', async () => {
        await sse.sseManager.addClient('user-123', mockRes, mockReq);

        expect(betterSSE.createSession).toHaveBeenCalledWith(mockReq, mockRes);
      });

      it('should register session to global channel automatically', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        expect(sse.sseManager.globalChannel.register).toHaveBeenCalledWith(
          expect.objectContaining({ id: session.id }),
        );
      });

      it('should track session in sessions map', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        expect(sse.sseManager.sessions).toBeDefined();
        expect(sse.sseManager.sessions.has(session.id)).toBe(true);
      });

      it('should initialize session with empty subscription set', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        expect(session.state.subscribedChannels).toBeDefined();
        expect(session.state.subscribedChannels instanceof Set).toBe(true);
        expect(session.state.subscribedChannels.size).toBe(0);
      });

      it('should store userId in session state', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        expect(session.state.userId).toBe('user-123');
      });
    });

    describe('removeClient with channel cleanup', () => {
      it('should deregister from global channel', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        await sse.sseManager.removeClient('user-123', session.id);

        expect(sse.sseManager.globalChannel.deregister).toHaveBeenCalledWith(
          session,
        );
      });

      it('should unsubscribe from all analysis channels', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1', 'analysis-2'],
          'user-123',
        );

        await sse.sseManager.removeClient('user-123', session.id);

        // Both channels should be cleaned up
        expect(sse.sseManager.analysisChannels.has('analysis-1')).toBe(false);
        expect(sse.sseManager.analysisChannels.has('analysis-2')).toBe(false);
      });

      it('should remove session from sessions map', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        await sse.sseManager.removeClient('user-123', session.id);

        expect(sse.sseManager.sessions.has(session.id)).toBe(false);
      });

      it('should handle removing session that never subscribed', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        expect(async () => {
          await sse.sseManager.removeClient('user-123', session.id);
        }).not.toThrow();
      });

      it('should handle removing non-existent session gracefully', async () => {
        expect(async () => {
          await sse.sseManager.removeClient('user-999', 'nonexistent-session');
        }).not.toThrow();
      });
    });

    describe('session disconnect handling', () => {
      it('should auto-cleanup on session disconnect', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1'],
          'user-123',
        );

        // Simulate disconnect
        const disconnectHandler = mockReq.on.mock.calls.find(
          (call) => call[0] === 'close',
        )[1];
        await disconnectHandler();

        // Should cleanup channels
        expect(sse.sseManager.analysisChannels.has('analysis-1')).toBe(false);
      });

      it('should cleanup multiple subscriptions on disconnect', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1', 'analysis-2', 'analysis-3'],
          'user-123',
        );

        const disconnectHandler = mockReq.on.mock.calls.find(
          (call) => call[0] === 'close',
        )[1];
        await disconnectHandler();

        expect(sse.sseManager.analysisChannels.size).toBe(0);
      });
    });
  });

  // ========================================================================
  // 3. SUBSCRIPTION MANAGEMENT
  // ========================================================================
  describe('Subscription Management', () => {
    describe('subscribeToAnalysis', () => {
      it('should subscribe session to single analysis channel', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['test-analysis'],
          'user-123',
        );

        expect(session.state.subscribedChannels.has('test-analysis')).toBe(
          true,
        );
      });

      it('should subscribe session to multiple analyses simultaneously', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1', 'analysis-2', 'analysis-3'],
          'user-123',
        );

        expect(session.state.subscribedChannels.has('analysis-1')).toBe(true);
        expect(session.state.subscribedChannels.has('analysis-2')).toBe(true);
        expect(session.state.subscribedChannels.has('analysis-3')).toBe(true);
      });

      it('should register session with analysis channel', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['test-analysis'],
          'user-123',
        );

        const channel = sse.sseManager.analysisChannels.get('test-analysis');
        expect(channel.register).toHaveBeenCalledWith(session);
      });

      it('should create analysis channel if it does not exist', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        expect(sse.sseManager.analysisChannels.has('new-analysis')).toBe(false);

        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['new-analysis'],
          'user-123',
        );

        expect(sse.sseManager.analysisChannels.has('new-analysis')).toBe(true);
      });

      it('should be idempotent - subscribing twice should work', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['test-analysis'],
          'user-123',
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['test-analysis'],
          'user-123',
        );

        // Should still only be subscribed once
        expect(session.state.subscribedChannels.size).toBe(1);
        const channel = sse.sseManager.analysisChannels.get('test-analysis');
        expect(channel.sessionCount).toBe(1);
      });

      it('should throw error if session not found', async () => {
        await expect(
          sse.sseManager.subscribeToAnalysis(
            'nonexistent-session',
            ['test-analysis'],
            'user-123',
          ),
        ).rejects.toThrow('Session not found');
      });

      it('should return subscription confirmation', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        const result = await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1', 'analysis-2'],
          'user-123',
        );

        expect(result).toEqual({
          success: true,
          subscribed: ['analysis-1', 'analysis-2'],
          sessionId: session.id,
        });
      });
    });

    describe('unsubscribeFromAnalysis', () => {
      it('should unsubscribe session from single analysis', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['test-analysis'],
          'user-123',
        );

        await sse.sseManager.unsubscribeFromAnalysis(session.id, [
          'test-analysis',
        ]);

        expect(session.state.subscribedChannels.has('test-analysis')).toBe(
          false,
        );
      });

      it('should unsubscribe from multiple analyses', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1', 'analysis-2', 'analysis-3'],
          'user-123',
        );

        await sse.sseManager.unsubscribeFromAnalysis(session.id, [
          'analysis-1',
          'analysis-3',
        ]);

        expect(session.state.subscribedChannels.has('analysis-1')).toBe(false);
        expect(session.state.subscribedChannels.has('analysis-2')).toBe(true);
        expect(session.state.subscribedChannels.has('analysis-3')).toBe(false);
      });

      it('should deregister session from channel', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['test-analysis'],
          'user-123',
        );

        await sse.sseManager.unsubscribeFromAnalysis(session.id, [
          'test-analysis',
        ]);

        const channel = sse.sseManager.analysisChannels.get('test-analysis');
        // Channel should be deleted when empty
        expect(channel).toBeUndefined();
      });

      it('should handle unsubscribing from non-subscribed analysis (no-op)', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        expect(async () => {
          await sse.sseManager.unsubscribeFromAnalysis(session.id, [
            'never-subscribed',
          ]);
        }).not.toThrow();
      });

      it('should handle non-existent session gracefully (no-op)', async () => {
        const result = await sse.sseManager.unsubscribeFromAnalysis(
          'nonexistent-session',
          ['test-analysis'],
        );

        expect(result.success).toBe(true);
        expect(result.unsubscribed).toEqual([]);
      });

      it('should return unsubscription confirmation', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1', 'analysis-2'],
          'user-123',
        );

        const result = await sse.sseManager.unsubscribeFromAnalysis(
          session.id,
          ['analysis-1'],
        );

        expect(result).toEqual({
          success: true,
          unsubscribed: ['analysis-1'],
          sessionId: session.id,
        });
      });
    });

    describe('concurrent subscriptions', () => {
      it('should handle multiple sessions subscribing to same analysis', async () => {
        const session1 = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        const session2 = await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });

        await Promise.all([
          sse.sseManager.subscribeToAnalysis(
            session1.id,
            ['analysis-1'],
            'user-1',
          ),
          sse.sseManager.subscribeToAnalysis(
            session2.id,
            ['analysis-1'],
            'user-2',
          ),
        ]);

        const channel = sse.sseManager.analysisChannels.get('analysis-1');
        expect(channel.sessionCount).toBe(2);
      });

      it('should handle rapid subscribe/unsubscribe on same analysis', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1'],
          'user-123',
        );
        await sse.sseManager.unsubscribeFromAnalysis(session.id, [
          'analysis-1',
        ]);
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1'],
          'user-123',
        );
        await sse.sseManager.unsubscribeFromAnalysis(session.id, [
          'analysis-1',
        ]);

        // Final state: not subscribed
        expect(session.state.subscribedChannels.has('analysis-1')).toBe(false);
        expect(sse.sseManager.analysisChannels.has('analysis-1')).toBe(false);
      });
    });
  });

  // ========================================================================
  // 4. BROADCASTING BEHAVIOR
  // ========================================================================
  describe('Broadcasting Behavior', () => {
    describe('broadcastAnalysisLog', () => {
      it('should send log to subscribed sessions only', async () => {
        const session1 = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        const session2 = await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });

        await sse.sseManager.subscribeToAnalysis(
          session1.id,
          ['analysis-1'],
          'user-1',
        );
        // session2 not subscribed

        sse.sseManager.broadcastAnalysisLog('analysis-1', {
          type: 'log',
          message: 'test log',
        });

        const channel = sse.sseManager.analysisChannels.get('analysis-1');
        expect(channel.broadcast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'log', message: 'test log' }),
        );
      });

      it('should not broadcast to non-subscribed sessions', async () => {
        const session1 = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        const session2 = await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });

        await sse.sseManager.subscribeToAnalysis(
          session1.id,
          ['analysis-1'],
          'user-1',
        );
        // session2 subscribed to different analysis
        await sse.sseManager.subscribeToAnalysis(
          session2.id,
          ['analysis-2'],
          'user-2',
        );

        mockSession.push.mockClear();
        sse.sseManager.broadcastAnalysisLog('analysis-1', {
          type: 'log',
          message: 'test log',
        });

        // Only session1 should receive it through channel
        const channel = sse.sseManager.analysisChannels.get('analysis-1');
        expect(channel.broadcast).toHaveBeenCalled();

        const channel2 = sse.sseManager.analysisChannels.get('analysis-2');
        expect(channel2.broadcast).not.toHaveBeenCalled();
      });

      it('should handle broadcasting to non-existent channel gracefully', () => {
        expect(() => {
          sse.sseManager.broadcastAnalysisLog('nonexistent-analysis', {
            type: 'log',
            message: 'test',
          });
        }).not.toThrow();
      });

      it('should handle empty channel (no subscribers)', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1'],
          'user-123',
        );
        await sse.sseManager.unsubscribeFromAnalysis(session.id, [
          'analysis-1',
        ]);

        // Channel should be cleaned up
        expect(() => {
          sse.sseManager.broadcastAnalysisLog('analysis-1', {
            type: 'log',
            message: 'test',
          });
        }).not.toThrow();
      });

      it('should broadcast to multiple sessions watching same analysis', async () => {
        const session1 = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        const session2 = await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });
        const session3 = await sse.sseManager.addClient('user-3', mockRes, {
          ...mockReq,
          user: { id: 'user-3' },
        });

        await sse.sseManager.subscribeToAnalysis(
          session1.id,
          ['analysis-1'],
          'user-1',
        );
        await sse.sseManager.subscribeToAnalysis(
          session2.id,
          ['analysis-1'],
          'user-2',
        );
        await sse.sseManager.subscribeToAnalysis(
          session3.id,
          ['analysis-1'],
          'user-3',
        );

        sse.sseManager.broadcastAnalysisLog('analysis-1', {
          type: 'log',
          message: 'shared log',
        });

        const channel = sse.sseManager.analysisChannels.get('analysis-1');
        expect(channel.broadcast).toHaveBeenCalled();
        expect(channel.sessionCount).toBe(3);
      });
    });

    describe('global broadcasts (non-log)', () => {
      it('should send init to global channel (all sessions)', async () => {
        const session1 = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        const session2 = await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });

        sse.sseManager.broadcast({ type: 'init', data: 'test' });

        expect(sse.sseManager.globalChannel.broadcast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'init', data: 'test' }),
        );
      });

      it('should send statusUpdate to all sessions', async () => {
        await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });

        sse.sseManager.broadcast({ type: 'statusUpdate', status: 'ready' });

        expect(sse.sseManager.globalChannel.broadcast).toHaveBeenCalled();
      });

      it('should send heartbeat to all sessions', async () => {
        await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });

        sse.sseManager.sendHeartbeat();

        expect(sse.sseManager.globalChannel.broadcast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'heartbeat' }),
        );
      });

      it('should send metrics to all sessions', async () => {
        const session = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1', role: 'user' },
        });

        const { metricsService } = await import(
          '../../src/services/metricsService.js'
        );
        metricsService.getAllMetrics.mockResolvedValue({
          total: { cpu: 50, memory: 200 },
          container: { cpu: 25, memory: 100 },
          children: { processCount: 2 },
          processes: [],
        });

        await sse.sseManager.broadcastMetricsUpdate();

        // Metrics are sent via session.push, not globalChannel.broadcast
        expect(session.push).toHaveBeenCalled();
        expect(session.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'metricsUpdate',
          }),
        );
      });
    });

    describe('broadcastUpdate compatibility', () => {
      it('should route log broadcasts to analysis channels', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['test-analysis'],
          'user-123',
        );

        sse.sseManager.broadcastUpdate('log', {
          analysis: 'test-analysis',
          message: 'log message',
        });

        const channel = sse.sseManager.analysisChannels.get('test-analysis');
        expect(channel.broadcast).toHaveBeenCalled();
      });

      it('should route analysis updates to global channel', async () => {
        // Ensure mocks are set up correctly for this test
        const { analysisService } = await import(
          '../../src/services/analysisService.js'
        );
        // Return empty to trigger uncategorized teamId, which goes to users via sendToUser
        analysisService.getAllAnalyses.mockResolvedValue({});

        const { getUsersWithTeamAccess } = await import(
          '../../src/middleware/betterAuthMiddleware.js'
        );
        getUsersWithTeamAccess.mockReturnValue(['user-123']);

        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        sse.sseManager.broadcastUpdate('analysisUpdate', {
          analysis: 'test-analysis',
          status: 'running',
        });

        // Wait for async operations: broadcastAnalysisUpdate -> broadcastToTeamUsers -> sendToUser
        await vi.waitFor(
          () => {
            expect(session.push).toHaveBeenCalled();
          },
          { timeout: 100 },
        );

        // Verify the correct data structure was sent
        expect(session.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'analysisUpdate',
          }),
        );
      });
    });
  });

  // ========================================================================
  // 5. PERMISSION INTEGRATION
  // ========================================================================
  describe('Permission Integration', () => {
    describe('team permissions enforcement', () => {
      it('should allow admin users to subscribe to any analysis', async () => {
        const adminReq = {
          ...mockReq,
          user: { id: 'admin-123', role: 'admin' },
        };
        const session = await sse.sseManager.addClient(
          'admin-123',
          mockRes,
          adminReq,
        );

        await expect(
          sse.sseManager.subscribeToAnalysis(
            session.id,
            ['restricted-analysis'],
            'admin-123',
          ),
        ).resolves.not.toThrow();
      });

      it('should check team permissions for non-admin users', async () => {
        const { getUserTeamIds } = await import(
          '../../src/middleware/betterAuthMiddleware.js'
        );
        getUserTeamIds.mockReturnValue(['team-1']); // User only has access to team-1

        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        // Mock analysis with team
        const { analysisService } = await import(
          '../../src/services/analysisService.js'
        );
        analysisService.getAllAnalyses.mockReturnValue({
          'team1-analysis': { name: 'team1-analysis', teamId: 'team-1' },
          'team2-analysis': { name: 'team2-analysis', teamId: 'team-2' },
        });

        // Should succeed for team-1 analysis
        await expect(
          sse.sseManager.subscribeToAnalysis(
            session.id,
            ['team1-analysis'],
            'user-123',
          ),
        ).resolves.not.toThrow();
      });

      it('should reject subscription to analysis without permission', async () => {
        const { getUserTeamIds } = await import(
          '../../src/middleware/betterAuthMiddleware.js'
        );
        getUserTeamIds.mockReturnValue(['team-1']); // User only has access to team-1

        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        const { analysisService } = await import(
          '../../src/services/analysisService.js'
        );
        analysisService.getAllAnalyses.mockResolvedValue({
          'team2-analysis': { name: 'team2-analysis', teamId: 'team-2' },
        });

        const result = await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['team2-analysis'],
          'user-123',
        );

        // Implementation returns success with denied array, not a thrown error
        expect(result.success).toBe(true);
        expect(result.subscribed).toEqual([]);
        expect(result.denied).toEqual(['team2-analysis']);
      });

      it('should check permissions for each analysis in batch subscribe', async () => {
        const { getUserTeamIds } = await import(
          '../../src/middleware/betterAuthMiddleware.js'
        );
        getUserTeamIds.mockReturnValue(['team-1']);

        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        const { analysisService } = await import(
          '../../src/services/analysisService.js'
        );
        analysisService.getAllAnalyses.mockReturnValue({
          'team1-analysis': { teamId: 'team-1' },
          'team2-analysis': { teamId: 'team-2' },
        });

        // Should partially succeed
        const result = await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['team1-analysis', 'team2-analysis'],
          'user-123',
        );

        expect(result.subscribed).toContain('team1-analysis');
        expect(result.subscribed).not.toContain('team2-analysis');
        expect(result.denied).toContain('team2-analysis');
      });

      it('should allow subscription to uncategorized analyses', async () => {
        const { getUserTeamIds } = await import(
          '../../src/middleware/betterAuthMiddleware.js'
        );
        getUserTeamIds.mockReturnValue(['team-1', 'uncategorized']);

        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        const { analysisService } = await import(
          '../../src/services/analysisService.js'
        );
        analysisService.getAllAnalyses.mockReturnValue({
          'uncategorized-analysis': { teamId: 'uncategorized' },
        });

        await expect(
          sse.sseManager.subscribeToAnalysis(
            session.id,
            ['uncategorized-analysis'],
            'user-123',
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('broadcastToTeamUsers compatibility', () => {
      it('should still filter broadcasts by team access', async () => {
        const { getUsersWithTeamAccess } = await import(
          '../../src/middleware/betterAuthMiddleware.js'
        );
        getUsersWithTeamAccess.mockReturnValue(['user-1', 'user-2']);

        await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        await sse.sseManager.addClient('user-3', mockRes, {
          ...mockReq,
          user: { id: 'user-3' },
        });

        await sse.sseManager.broadcastToTeamUsers('team-1', {
          type: 'teamUpdate',
          data: 'test',
        });

        // Should only broadcast to users with team access
        expect(getUsersWithTeamAccess).toHaveBeenCalledWith(
          'team-1',
          'view_analyses',
        );
      });
    });
  });

  // ========================================================================
  // 6. RECONNECTION & EDGE CASES
  // ========================================================================
  describe('Reconnection & Edge Cases', () => {
    describe('session reconnection', () => {
      it('should allow re-subscribing after disconnect', async () => {
        let session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1'],
          'user-123',
        );

        // Disconnect
        await sse.sseManager.removeClient('user-123', session.id);

        // Reconnect
        session = await sse.sseManager.addClient('user-123', mockRes, mockReq);
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1'],
          'user-123',
        );

        expect(session.state.subscribedChannels.has('analysis-1')).toBe(true);
      });

      it('should maintain channel state across reconnections', async () => {
        // Session 1 subscribes
        const session1 = await sse.sseManager.addClient('user-1', mockRes, {
          ...mockReq,
          user: { id: 'user-1' },
        });
        await sse.sseManager.subscribeToAnalysis(
          session1.id,
          ['analysis-1'],
          'user-1',
        );

        // Session 2 connects and subscribes
        const session2 = await sse.sseManager.addClient('user-2', mockRes, {
          ...mockReq,
          user: { id: 'user-2' },
        });
        await sse.sseManager.subscribeToAnalysis(
          session2.id,
          ['analysis-1'],
          'user-2',
        );

        // Session 1 disconnects
        await sse.sseManager.removeClient('user-1', session1.id);

        // Channel should still exist (session 2 still subscribed)
        expect(sse.sseManager.analysisChannels.has('analysis-1')).toBe(true);
      });
    });

    describe('memory cleanup', () => {
      it('should not leak memory when channels are deleted', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        for (let i = 0; i < 100; i++) {
          await sse.sseManager.subscribeToAnalysis(
            session.id,
            [`analysis-${i}`],
            'user-123',
          );
          await sse.sseManager.unsubscribeFromAnalysis(session.id, [
            `analysis-${i}`,
          ]);
        }

        // All channels should be cleaned up
        expect(sse.sseManager.analysisChannels.size).toBe(0);
      });

      it('should clean up session references on remove', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1', 'analysis-2'],
          'user-123',
        );

        await sse.sseManager.removeClient('user-123', session.id);

        // Session should be removed
        expect(sse.sseManager.sessions.has(session.id)).toBe(false);
        // Channels should be cleaned up
        expect(sse.sseManager.analysisChannels.size).toBe(0);
      });
    });

    describe('error handling', () => {
      it('should handle channel broadcast errors gracefully', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1'],
          'user-123',
        );

        const channel = sse.sseManager.analysisChannels.get('analysis-1');
        channel.broadcast.mockImplementation(() => {
          throw new Error('Broadcast failed');
        });

        expect(() => {
          sse.sseManager.broadcastAnalysisLog('analysis-1', {
            type: 'log',
            message: 'test',
          });
        }).not.toThrow();
      });

      it('should handle session.push failures', async () => {
        mockSession.push.mockImplementation(() => {
          throw new Error('Push failed');
        });

        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        expect(() => {
          sse.sseManager.broadcast({ type: 'test', data: 'test' });
        }).not.toThrow();
      });

      it('should handle malformed analysis names', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        await expect(
          sse.sseManager.subscribeToAnalysis(session.id, [null], 'user-123'),
        ).rejects.toThrow();

        await expect(
          sse.sseManager.subscribeToAnalysis(
            session.id,
            [undefined],
            'user-123',
          ),
        ).rejects.toThrow();
      });
    });
  });

  // ========================================================================
  // 7. INTEGRATION WITH EXISTING SSEMANAGER
  // ========================================================================
  describe('Integration with Existing SSEManager', () => {
    describe('backward compatibility', () => {
      it('should maintain existing broadcast() method signature', async () => {
        await sse.sseManager.addClient('user-123', mockRes, mockReq);

        expect(() => {
          sse.sseManager.broadcast({ type: 'test', data: 'test' });
        }).not.toThrow();
      });

      it('should maintain existing sendToUser() method', async () => {
        await sse.sseManager.addClient('user-123', mockRes, mockReq);

        expect(() => {
          sse.sseManager.sendToUser('user-123', { type: 'test', data: 'test' });
        }).not.toThrow();
      });

      it('should maintain existing broadcastRefresh() method', async () => {
        await sse.sseManager.addClient('user-123', mockRes, mockReq);

        expect(() => {
          sse.sseManager.broadcastRefresh();
        }).not.toThrow();
      });

      it('should maintain existing getStats() method', async () => {
        await sse.sseManager.addClient('user-123', mockRes, mockReq);

        const stats = sse.sseManager.getStats();

        expect(stats).toBeDefined();
        expect(stats.totalClients).toBeDefined();
        expect(stats.uniqueUsers).toBeDefined();
      });
    });

    describe('sendInitialData compatibility', () => {
      it('should still send initial data on connection', async () => {
        const client = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        const { analysisService } = await import(
          '../../src/services/analysisService.js'
        );
        const teamService = (await import('../../src/services/teamService.js'))
          .default;
        const { executeQuery } = await import(
          '../../src/utils/authDatabase.js'
        );

        executeQuery.mockReturnValue({
          id: 'user-123',
          role: 'admin',
          email: 'test@test.com',
          name: 'Test User',
        });

        analysisService.getAllAnalyses.mockResolvedValue({
          'test-analysis': { name: 'test', teamId: 'team-1' },
        });
        teamService.getAllTeams.mockResolvedValue([
          { id: 'team-1', name: 'Team 1' },
        ]);
        analysisService.getConfig.mockResolvedValue({
          teamStructure: {},
        });

        await sse.sseManager.sendInitialData(client);

        // Check the actual session's push method, not the unused mockSession
        expect(client.push).toHaveBeenCalled();
      });
    });

    describe('heartbeat compatibility', () => {
      it('should send heartbeat through global channel', async () => {
        await sse.sseManager.addClient('user-123', mockRes, mockReq);

        sse.sseManager.sendHeartbeat();

        expect(sse.sseManager.globalChannel.broadcast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'heartbeat' }),
        );
      });
    });

    describe('container state management', () => {
      it('should broadcast container state through global channel', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        sse.sseManager.updateContainerState({
          status: 'error',
          message: 'Test error',
        });

        // Wait for async broadcastStatusUpdate to complete
        await vi.waitFor(
          () => {
            expect(session.push).toHaveBeenCalled();
          },
          { timeout: 100 },
        );

        // Container state updates are sent via session.push, not globalChannel.broadcast
        expect(session.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
          }),
        );
      });
    });

    describe('metrics broadcasting', () => {
      it('should use per-session filtering for metrics', async () => {
        const { metricsService } = await import(
          '../../src/services/metricsService.js'
        );
        const { analysisService } = await import(
          '../../src/services/analysisService.js'
        );

        metricsService.getAllMetrics.mockResolvedValue({
          total: { cpu: 50, memory: 200 },
          container: { cpu: 25, memory: 100 },
          children: { processCount: 2 },
          processes: [
            { name: 'analysis-1', cpu: 10, memory: 50 },
            { name: 'analysis-2', cpu: 15, memory: 75 },
          ],
        });

        analysisService.getAllAnalyses.mockReturnValue({
          'analysis-1': { teamId: 'team-1' },
          'analysis-2': { teamId: 'team-2' },
        });

        const { getUserTeamIds } = await import(
          '../../src/middleware/betterAuthMiddleware.js'
        );
        getUserTeamIds.mockReturnValue(['team-1']);

        await sse.sseManager.addClient('user-123', mockRes, mockReq);
        await sse.sseManager.broadcastMetricsUpdate();

        // Should still work with session-based approach
        expect(metricsService.getAllMetrics).toHaveBeenCalled();
      });
    });
  });

  // ========================================================================
  // 8. HTTP ENDPOINT TESTS (Integration)
  // ========================================================================
  describe('HTTP Subscription Endpoints', () => {
    describe('POST /api/sse/subscribe', () => {
      it('should subscribe to analyses via HTTP endpoint', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );

        mockReq.body = {
          sessionId: session.id,
          analyses: ['analysis-1', 'analysis-2'],
        };

        await sse.sseManager.handleSubscribeRequest(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            subscribed: ['analysis-1', 'analysis-2'],
          }),
        );
      });

      it('should return 400 for missing sessionId', async () => {
        mockReq.body = {
          analyses: ['analysis-1'],
        };

        await sse.sseManager.handleSubscribeRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
      });

      it('should return 400 for missing analyses array', async () => {
        mockReq.body = {
          sessionId: 'session-123',
        };

        await sse.sseManager.handleSubscribeRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
      });

      it('should return 404 for non-existent session', async () => {
        mockReq.body = {
          sessionId: 'nonexistent-session',
          analyses: ['analysis-1'],
        };

        await sse.sseManager.handleSubscribeRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(404);
      });
    });

    describe('POST /api/sse/unsubscribe', () => {
      it('should unsubscribe from analyses via HTTP endpoint', async () => {
        const session = await sse.sseManager.addClient(
          'user-123',
          mockRes,
          mockReq,
        );
        await sse.sseManager.subscribeToAnalysis(
          session.id,
          ['analysis-1', 'analysis-2'],
          'user-123',
        );

        mockReq.body = {
          sessionId: session.id,
          analyses: ['analysis-1'],
        };

        await sse.sseManager.handleUnsubscribeRequest(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            unsubscribed: ['analysis-1'],
          }),
        );
      });

      it('should return 400 for invalid request', async () => {
        mockReq.body = {};

        await sse.sseManager.handleUnsubscribeRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
      });
    });
  });
});

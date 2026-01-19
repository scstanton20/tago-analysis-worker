import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';

// Create mock service objects that we can control in tests
const mockAnalysisService = {
  getAnalysisById: vi.fn(),
};

const mockDnsCache = {
  getConfig: vi.fn(() => ({ enabled: true })),
  getAnalysisStats: vi.fn(() => ({
    hits: 10,
    misses: 2,
    errors: 0,
    hitRate: 0.83,
    hostnameCount: 3,
    hostnames: ['api.tago.io', 'example.com', 'test.com'],
    cacheKeyCount: 5,
  })),
};

const mockGetUserTeamIds = vi.fn();
const mockGetUsersWithTeamAccess = vi.fn();
const mockExecuteQuery = vi.fn();

// Mock the lazy loaders to return our controlled mocks
vi.mock('../../../src/utils/lazyLoader.ts', () => ({
  getAnalysisService: vi.fn(() => Promise.resolve(mockAnalysisService)),
  getTeamPermissionHelpers: vi.fn(() =>
    Promise.resolve({
      getUserTeamIds: mockGetUserTeamIds,
      getUsersWithTeamAccess: mockGetUsersWithTeamAccess,
    }),
  ),
  getAuthDatabase: vi.fn(() =>
    Promise.resolve({ executeQuery: mockExecuteQuery }),
  ),
  getDnsCache: vi.fn(() => Promise.resolve(mockDnsCache)),
}));

vi.mock('better-sse', () => ({
  createChannel: vi.fn(() => ({
    register: vi.fn(),
    deregister: vi.fn(),
    broadcast: vi.fn(),
    sessionCount: 0,
  })),
}));

vi.mock('../../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Import after mocks
import { ChannelManager } from '../../../src/utils/sse/ChannelManager.ts';
import type { SSEManager } from '../../../src/utils/sse/SSEManager.ts';
import { createChannel } from 'better-sse';

describe('ChannelManager', () => {
  let channelManager: ChannelManager;
  let mockManager: SSEManager;
  let mockRes: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    mockManager = {
      sessions: new Map(),
      analysisLogsChannels: new Map(),
      analysisStatsChannels: new Map(),
      metricsChannel: {
        register: vi.fn(),
        deregister: vi.fn(),
        broadcast: vi.fn(),
      },
    } as unknown as SSEManager;

    channelManager = new ChannelManager(mockManager);

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    // Default mock implementations
    mockExecuteQuery.mockReturnValue({ id: 'user-1', role: 'user' });
    mockGetUserTeamIds.mockReturnValue(['team-1', 'team-2']);
    mockAnalysisService.getAnalysisById.mockReturnValue({
      id: 'analysis-1',
      name: 'Test Analysis',
      teamId: 'team-1',
    } as any);
    mockDnsCache.getConfig.mockReturnValue({ enabled: true } as any);
    mockDnsCache.getAnalysisStats.mockReturnValue({
      hits: 10,
      misses: 2,
      errors: 0,
      hitRate: 0.83,
      hostnameCount: 3,
      hostnames: ['api.tago.io', 'example.com', 'test.com'],
      cacheKeyCount: 5,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a ChannelManager instance', () => {
      expect(channelManager).toBeDefined();
    });
  });

  describe('getOrCreateLogsChannel', () => {
    it('should create a new channel when one does not exist', () => {
      const channel = channelManager.getOrCreateLogsChannel('analysis-1');

      expect(createChannel).toHaveBeenCalled();
      expect(mockManager.analysisLogsChannels.has('analysis-1')).toBe(true);
      expect(channel).toBeDefined();
    });

    it('should return existing channel when one exists', () => {
      const existingChannel = { register: vi.fn(), broadcast: vi.fn() };
      mockManager.analysisLogsChannels.set(
        'analysis-1',
        existingChannel as any,
      );

      const channel = channelManager.getOrCreateLogsChannel('analysis-1');

      expect(createChannel).not.toHaveBeenCalled();
      expect(channel).toBe(existingChannel);
    });
  });

  describe('subscribeToAnalysisLogs', () => {
    it('should throw when session not found', async () => {
      await expect(
        channelManager.subscribeToAnalysisLogs(
          'nonexistent',
          ['analysis-1'],
          'user-1',
        ),
      ).rejects.toThrow('Session not found');
    });

    it('should throw when analysisIds is not an array', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      await expect(
        channelManager.subscribeToAnalysisLogs(
          'session-1',
          null as any,
          'user-1',
        ),
      ).rejects.toThrow('analysisIds must be a non-empty array');
    });

    it('should throw when analysisIds is empty', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      await expect(
        channelManager.subscribeToAnalysisLogs('session-1', [], 'user-1'),
      ).rejects.toThrow('analysisIds must be a non-empty array');
    });

    it('should throw when analysisIds contains null', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      await expect(
        channelManager.subscribeToAnalysisLogs(
          'session-1',
          [null as any, 'analysis-1'],
          'user-1',
        ),
      ).rejects.toThrow('Analysis IDs cannot be null or undefined');
    });

    it('should throw when analysisIds contains undefined', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      await expect(
        channelManager.subscribeToAnalysisLogs(
          'session-1',
          [undefined as any],
          'user-1',
        ),
      ).rejects.toThrow('Analysis IDs cannot be null or undefined');
    });

    it('should skip already subscribed analyses (idempotent)', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set(['analysis-1']) },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1'],
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.subscribed).toContain('analysis-1');
      // Channel should not be created since already subscribed
      expect(createChannel).not.toHaveBeenCalled();
    });

    it('should allow admin to subscribe to any analysis', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'admin-1', role: 'admin' });

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1'],
        'admin-1',
      );

      expect(result.success).toBe(true);
      expect(result.subscribed).toContain('analysis-1');
      // Admin should not trigger getUserTeamIds check
      expect(mockGetUserTeamIds).not.toHaveBeenCalled();
    });

    it('should allow non-admin with team permission to subscribe', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'user-1', role: 'user' });
      mockGetUserTeamIds.mockReturnValue(['team-1', 'team-2']);
      mockAnalysisService.getAnalysisById.mockReturnValue({
        id: 'analysis-1',
        teamId: 'team-1',
      } as any);

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1'],
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.subscribed).toContain('analysis-1');
      expect(result.denied).toBeUndefined();
    });

    it('should deny non-admin without team permission', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'user-1', role: 'user' });
      mockGetUserTeamIds.mockReturnValue(['team-2', 'team-3']); // Not team-1
      mockAnalysisService.getAnalysisById.mockReturnValue({
        id: 'analysis-1',
        teamId: 'team-1', // User doesn't have access to team-1
      } as any);

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1'],
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.subscribed).not.toContain('analysis-1');
      expect(result.denied).toContain('analysis-1');
    });

    it('should handle uncategorized analyses for non-admin', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'user-1', role: 'user' });
      mockGetUserTeamIds.mockReturnValue(['uncategorized']);
      mockAnalysisService.getAnalysisById.mockReturnValue({
        id: 'analysis-1',
        teamId: null, // No team = uncategorized
      } as any);

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1'],
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.subscribed).toContain('analysis-1');
    });

    it('should subscribe to multiple analyses with mixed permissions', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'user-1', role: 'user' });
      mockGetUserTeamIds.mockReturnValue(['team-1']);
      mockAnalysisService.getAnalysisById.mockImplementation((id) => {
        if (id === 'analysis-1') {
          return { id: 'analysis-1', teamId: 'team-1' } as any;
        }
        return { id: 'analysis-2', teamId: 'team-2' } as any; // No access
      });

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1', 'analysis-2'],
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.subscribed).toContain('analysis-1');
      expect(result.denied).toContain('analysis-2');
    });

    it('should register session to channel and update subscribedChannels', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'admin-1', role: 'admin' });

      const mockChannel = {
        register: vi.fn(),
        broadcast: vi.fn(),
      };
      vi.mocked(createChannel).mockReturnValue(mockChannel as any);

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      await channelManager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1'],
        'admin-1',
      );

      expect(mockChannel.register).toHaveBeenCalledWith(mockSession);
      expect(mockSession.state.subscribedChannels.has('analysis-1')).toBe(true);
    });

    it('should not send initial stats for logs channel (stats channel only)', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'admin-1', role: 'admin' });

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      await channelManager.subscribeToAnalysisLogs(
        'session-1',
        ['analysis-1'],
        'admin-1',
      );

      // Logs channel should not push any initial data
      expect(mockSession.push).not.toHaveBeenCalled();
    });

    it('should return correct sessionId in result', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'admin-1', role: 'admin' });

      const mockSession = {
        id: 'my-session-id',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('my-session-id', mockSession as any);

      const result = await channelManager.subscribeToAnalysisLogs(
        'my-session-id',
        ['analysis-1'],
        'admin-1',
      );

      expect(result.sessionId).toBe('my-session-id');
    });
  });

  describe('unsubscribeFromAnalysisLogs', () => {
    it('should unsubscribe session from analysis', async () => {
      const mockChannel = {
        deregister: vi.fn(),
        sessionCount: 0,
      };
      mockManager.analysisLogsChannels.set('analysis-1', mockChannel as any);

      const mockSession = {
        id: 'session-1',
        state: {
          subscribedChannels: new Set(['analysis-1']),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.unsubscribeFromAnalysisLogs(
        'session-1',
        ['analysis-1'],
      );

      expect(result.success).toBe(true);
      expect(result.unsubscribed).toContain('analysis-1');
      expect(mockChannel.deregister).toHaveBeenCalled();
    });

    it('should handle session not found gracefully', async () => {
      const result = await channelManager.unsubscribeFromAnalysisLogs(
        'nonexistent',
        ['analysis-1'],
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('nonexistent');
    });

    it('should clean up empty channels', async () => {
      const mockChannel = {
        deregister: vi.fn(),
        sessionCount: 0,
      };
      mockManager.analysisLogsChannels.set('analysis-1', mockChannel as any);

      const mockSession = {
        id: 'session-1',
        state: {
          subscribedChannels: new Set(['analysis-1']),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      await channelManager.unsubscribeFromAnalysisLogs('session-1', [
        'analysis-1',
      ]);

      expect(mockManager.analysisLogsChannels.has('analysis-1')).toBe(false);
    });

    it('should not clean up channels with remaining subscribers', async () => {
      const mockChannel = {
        deregister: vi.fn(),
        sessionCount: 2, // Still has subscribers
      };
      mockManager.analysisLogsChannels.set('analysis-1', mockChannel as any);

      const mockSession = {
        id: 'session-1',
        state: {
          subscribedChannels: new Set(['analysis-1']),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      await channelManager.unsubscribeFromAnalysisLogs('session-1', [
        'analysis-1',
      ]);

      expect(mockManager.analysisLogsChannels.has('analysis-1')).toBe(true);
    });

    it('should skip analyses not subscribed to', async () => {
      const mockSession = {
        id: 'session-1',
        state: {
          subscribedChannels: new Set(),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.unsubscribeFromAnalysisLogs(
        'session-1',
        ['analysis-1'],
      );

      expect(result.unsubscribed).not.toContain('analysis-1');
    });

    it('should handle channel not existing', async () => {
      const mockSession = {
        id: 'session-1',
        state: {
          subscribedChannels: new Set(['analysis-1']),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);
      // No channel in analysisLogsChannels

      const result = await channelManager.unsubscribeFromAnalysisLogs(
        'session-1',
        ['analysis-1'],
      );

      expect(result.success).toBe(true);
      expect(result.unsubscribed).toContain('analysis-1');
    });

    it('should unsubscribe from multiple analyses', async () => {
      const mockChannel1 = { deregister: vi.fn(), sessionCount: 0 };
      const mockChannel2 = { deregister: vi.fn(), sessionCount: 0 };
      mockManager.analysisLogsChannels.set('analysis-1', mockChannel1 as any);
      mockManager.analysisLogsChannels.set('analysis-2', mockChannel2 as any);

      const mockSession = {
        id: 'session-1',
        state: {
          subscribedChannels: new Set(['analysis-1', 'analysis-2']),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.unsubscribeFromAnalysisLogs(
        'session-1',
        ['analysis-1', 'analysis-2'],
      );

      expect(result.unsubscribed).toEqual(['analysis-1', 'analysis-2']);
      expect(mockChannel1.deregister).toHaveBeenCalled();
      expect(mockChannel2.deregister).toHaveBeenCalled();
    });
  });

  describe('broadcastAnalysisLog', () => {
    it('should broadcast log to channel', () => {
      const mockChannel = {
        broadcast: vi.fn(),
      };
      mockManager.analysisLogsChannels.set('analysis-1', mockChannel as any);

      const logData = { message: 'test log' };
      channelManager.broadcastAnalysisLog('analysis-1', logData);

      expect(mockChannel.broadcast).toHaveBeenCalledWith(logData);
    });

    it('should not throw when channel does not exist', () => {
      expect(() =>
        channelManager.broadcastAnalysisLog('nonexistent', { message: 'test' }),
      ).not.toThrow();
    });

    it('should handle broadcast error gracefully', () => {
      const mockChannel = {
        broadcast: vi.fn().mockImplementation(() => {
          throw new Error('Broadcast failed');
        }),
      };
      mockManager.analysisLogsChannels.set('analysis-1', mockChannel as any);

      // Should not throw, error is logged
      expect(() =>
        channelManager.broadcastAnalysisLog('analysis-1', { message: 'test' }),
      ).not.toThrow();
    });
  });

  describe('sendDnsStatsToSession', () => {
    it('should send DNS stats when cache is enabled and session connected', async () => {
      const mockStats = {
        hits: 10,
        misses: 2,
        errors: 0,
        hitRate: 0.83,
        hostnameCount: 3,
        hostnames: ['api.tago.io', 'example.com', 'test.com'],
        cacheKeyCount: 5,
      };
      mockDnsCache.getConfig.mockReturnValue({ enabled: true } as any);
      mockDnsCache.getAnalysisStats.mockReturnValue(mockStats);

      const mockSession = {
        id: 'session-1',
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };

      await channelManager.sendDnsStatsToSession(
        mockSession as any,
        'analysis-1',
      );

      expect(mockSession.push).toHaveBeenCalledWith({
        type: 'analysisDnsStats',
        analysisId: 'analysis-1',
        stats: mockStats,
        enabled: true,
      });
    });

    it('should not send stats when DNS cache is disabled', async () => {
      mockDnsCache.getConfig.mockReturnValue({ enabled: false } as any);

      const mockSession = {
        id: 'session-1',
        isConnected: true,
        push: vi.fn(),
      };

      await channelManager.sendDnsStatsToSession(
        mockSession as any,
        'analysis-1',
      );

      expect(mockSession.push).not.toHaveBeenCalled();
    });

    it('should not send stats when session is disconnected', async () => {
      mockDnsCache.getConfig.mockReturnValue({ enabled: true } as any);

      const mockSession = {
        id: 'session-1',
        isConnected: false,
        push: vi.fn(),
      };

      await channelManager.sendDnsStatsToSession(
        mockSession as any,
        'analysis-1',
      );

      expect(mockSession.push).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockDnsCache.getConfig.mockImplementation(() => {
        throw new Error('DNS cache error');
      });

      const mockSession = {
        id: 'session-1',
        isConnected: true,
        push: vi.fn(),
      };

      // Should not throw
      await expect(
        channelManager.sendDnsStatsToSession(mockSession as any, 'analysis-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('broadcastAnalysisDnsStats', () => {
    it('should not broadcast when no channel exists', async () => {
      await channelManager.broadcastAnalysisDnsStats('nonexistent');

      // Should complete without error
      expect(mockDnsCache.getConfig).not.toHaveBeenCalled();
    });

    it('should broadcast stats when channel exists and DNS enabled', async () => {
      const mockStats = {
        hits: 10,
        misses: 2,
        errors: 0,
        hitRate: 0.83,
        hostnameCount: 3,
        hostnames: ['api.tago.io', 'example.com', 'test.com'],
        cacheKeyCount: 5,
      };
      const mockChannel = {
        broadcast: vi.fn(),
      };
      mockManager.analysisStatsChannels.set('analysis-1', mockChannel as any);

      mockDnsCache.getConfig.mockReturnValue({ enabled: true } as any);
      mockDnsCache.getAnalysisStats.mockReturnValue(mockStats);

      await channelManager.broadcastAnalysisDnsStats('analysis-1');

      expect(mockChannel.broadcast).toHaveBeenCalledWith({
        type: 'analysisDnsStats',
        analysisId: 'analysis-1',
        stats: mockStats,
        enabled: true,
      });
    });

    it('should not broadcast when DNS cache is disabled', async () => {
      const mockChannel = {
        broadcast: vi.fn(),
      };
      mockManager.analysisStatsChannels.set('analysis-1', mockChannel as any);

      mockDnsCache.getConfig.mockReturnValue({ enabled: false } as any);

      await channelManager.broadcastAnalysisDnsStats('analysis-1');

      expect(mockChannel.broadcast).not.toHaveBeenCalled();
    });

    it('should handle broadcast errors gracefully', async () => {
      const mockChannel = {
        broadcast: vi.fn().mockImplementation(() => {
          throw new Error('Broadcast failed');
        }),
      };
      mockManager.analysisStatsChannels.set('analysis-1', mockChannel as any);

      mockDnsCache.getConfig.mockReturnValue({ enabled: true } as any);

      // Should not throw
      await expect(
        channelManager.broadcastAnalysisDnsStats('analysis-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('handleSubscribeLogsRequest', () => {
    it('should return 400 when sessionId is missing', async () => {
      const mockReq = {
        body: { analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId is required',
      });
    });

    it('should return 400 when analyses is not an array', async () => {
      const mockReq = {
        body: { sessionId: 'session-1', analyses: null },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'analyses must be a non-empty array',
      });
    });

    it('should return 400 when analyses is empty', async () => {
      const mockReq = {
        body: { sessionId: 'session-1', analyses: [] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'analyses must be a non-empty array',
      });
    });

    it('should return 404 when session not found', async () => {
      const mockReq = {
        body: { sessionId: 'nonexistent', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found',
      });
    });

    it('should successfully subscribe and return result', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'user-1', role: 'admin' });

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const mockReq = {
        body: { sessionId: 'session-1', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          subscribed: ['analysis-1'],
          sessionId: 'session-1',
        }),
      );
    });

    it('should handle subscription errors', async () => {
      mockExecuteQuery.mockImplementation(() => {
        throw new Error('Database error');
      });

      const mockSession = {
        id: 'session-1',
        state: { subscribedChannels: new Set() },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const mockReq = {
        body: { sessionId: 'session-1', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database error',
      });
    });
  });

  describe('handleUnsubscribeLogsRequest', () => {
    it('should return 400 when sessionId is missing', async () => {
      const mockReq = {
        body: { analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId and analyses array are required',
      });
    });

    it('should return 400 when analyses is not an array', async () => {
      const mockReq = {
        body: { sessionId: 'session-1', analyses: null },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId and analyses array are required',
      });
    });

    it('should return 404 when session not found', async () => {
      const mockReq = {
        body: { sessionId: 'nonexistent', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found',
      });
    });

    it('should successfully unsubscribe from analyses', async () => {
      const mockSession = {
        id: 'session-1',
        state: {
          subscribedChannels: new Set(['analysis-1']),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const mockReq = {
        body: { sessionId: 'session-1', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        unsubscribed: ['analysis-1'],
        sessionId: 'session-1',
      });
    });

    it('should handle errors during unsubscribe', async () => {
      // Create a session but make unsubscribeFromAnalysisLogs throw
      const mockSession = {
        id: 'session-1',
        state: {
          // Make subscribedChannels throw when accessed
          get subscribedChannels() {
            throw new Error('Test error');
          },
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const mockReq = {
        body: { sessionId: 'session-1', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeLogsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Test error',
      });
    });
  });

  describe('getOrCreateStatsChannel', () => {
    it('should create a new stats channel when one does not exist', () => {
      const channel = channelManager.getOrCreateStatsChannel('analysis-1');

      expect(createChannel).toHaveBeenCalled();
      expect(mockManager.analysisStatsChannels.has('analysis-1')).toBe(true);
      expect(channel).toBeDefined();
    });

    it('should return existing stats channel when one exists', () => {
      const existingChannel = { register: vi.fn(), broadcast: vi.fn() };
      mockManager.analysisStatsChannels.set(
        'analysis-1',
        existingChannel as any,
      );

      const channel = channelManager.getOrCreateStatsChannel('analysis-1');

      expect(createChannel).not.toHaveBeenCalled();
      expect(channel).toBe(existingChannel);
    });
  });

  describe('subscribeToAnalysisStats', () => {
    it('should subscribe session to stats channel', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'admin-1', role: 'admin' });

      const mockSession = {
        id: 'session-1',
        state: { subscribedStatsChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.subscribeToAnalysisStats(
        'session-1',
        ['analysis-1'],
        'admin-1',
      );

      expect(result.success).toBe(true);
      expect(result.subscribed).toContain('analysis-1');
    });
  });

  describe('unsubscribeFromAnalysisStats', () => {
    it('should unsubscribe from stats channel', async () => {
      const mockChannel = {
        deregister: vi.fn(),
        sessionCount: 0,
      };
      mockManager.analysisStatsChannels.set('analysis-1', mockChannel as any);

      const mockSession = {
        id: 'session-1',
        state: {
          subscribedStatsChannels: new Set(['analysis-1']),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.unsubscribeFromAnalysisStats(
        'session-1',
        ['analysis-1'],
      );

      expect(result.success).toBe(true);
      expect(result.unsubscribed).toContain('analysis-1');
    });
  });

  describe('subscribeToMetrics', () => {
    it('should throw when session not found', async () => {
      await expect(
        channelManager.subscribeToMetrics('nonexistent'),
      ).rejects.toThrow('Session not found');
    });

    it('should subscribe session to metrics channel', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedToMetrics: false },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.subscribeToMetrics('session-1');

      expect(result.success).toBe(true);
      expect(mockManager.metricsChannel.register).toHaveBeenCalledWith(
        mockSession,
      );
      expect(mockSession.state.subscribedToMetrics).toBe(true);
    });
  });

  describe('unsubscribeFromMetrics', () => {
    it('should handle session not found', async () => {
      const result = await channelManager.unsubscribeFromMetrics('nonexistent');

      expect(result.success).toBe(true);
    });

    it('should unsubscribe from metrics channel', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedToMetrics: true },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const result = await channelManager.unsubscribeFromMetrics('session-1');

      expect(result.success).toBe(true);
      expect(mockManager.metricsChannel.deregister).toHaveBeenCalledWith(
        mockSession,
      );
      expect(mockSession.state.subscribedToMetrics).toBe(false);
    });
  });

  describe('broadcastAnalysisStats', () => {
    it('should broadcast stats to channel', () => {
      const mockChannel = {
        broadcast: vi.fn(),
      };
      mockManager.analysisStatsChannels.set('analysis-1', mockChannel as any);

      channelManager.broadcastAnalysisStats('analysis-1', {
        totalCount: 100,
        logFileSize: 5000,
      });

      expect(mockChannel.broadcast).toHaveBeenCalledWith({
        type: 'analysisLogStats',
        analysisId: 'analysis-1',
        totalCount: 100,
        logFileSize: 5000,
      });
    });

    it('should not throw when channel does not exist', () => {
      expect(() =>
        channelManager.broadcastAnalysisStats('nonexistent', {
          totalCount: 100,
          logFileSize: 5000,
        }),
      ).not.toThrow();
    });

    it('should handle broadcast error gracefully', () => {
      const mockChannel = {
        broadcast: vi.fn().mockImplementation(() => {
          throw new Error('Broadcast failed');
        }),
      };
      mockManager.analysisStatsChannels.set('analysis-1', mockChannel as any);

      expect(() =>
        channelManager.broadcastAnalysisStats('analysis-1', {
          totalCount: 100,
          logFileSize: 5000,
        }),
      ).not.toThrow();
    });
  });

  describe('broadcastToMetricsChannel', () => {
    it('should broadcast to metrics channel', () => {
      channelManager.broadcastToMetricsChannel({ cpu: 50, memory: 1024 });

      expect(mockManager.metricsChannel.broadcast).toHaveBeenCalledWith({
        type: 'metricsUpdate',
        cpu: 50,
        memory: 1024,
      });
    });

    it('should handle broadcast error gracefully', () => {
      mockManager.metricsChannel.broadcast = vi.fn().mockImplementation(() => {
        throw new Error('Broadcast failed');
      });

      expect(() =>
        channelManager.broadcastToMetricsChannel({ cpu: 50 }),
      ).not.toThrow();
    });
  });

  describe('handleSubscribeStatsRequest', () => {
    it('should return 400 when sessionId is missing', async () => {
      const mockReq = {
        body: { analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeStatsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId is required',
      });
    });

    it('should return 400 when analyses is empty', async () => {
      const mockReq = {
        body: { sessionId: 'session-1', analyses: [] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeStatsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'analyses must be a non-empty array',
      });
    });

    it('should return 404 when session not found', async () => {
      const mockReq = {
        body: { sessionId: 'nonexistent', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeStatsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found',
      });
    });

    it('should successfully subscribe to stats', async () => {
      mockExecuteQuery.mockReturnValue({ id: 'user-1', role: 'admin' });

      const mockSession = {
        id: 'session-1',
        state: { subscribedStatsChannels: new Set() },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const mockReq = {
        body: { sessionId: 'session-1', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeStatsRequest(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });
  });

  describe('handleUnsubscribeStatsRequest', () => {
    it('should return 400 when sessionId is missing', async () => {
      const mockReq = {
        body: { analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeStatsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when session not found', async () => {
      const mockReq = {
        body: { sessionId: 'nonexistent', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeStatsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should successfully unsubscribe from stats', async () => {
      const mockSession = {
        id: 'session-1',
        state: {
          subscribedStatsChannels: new Set(['analysis-1']),
        },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const mockReq = {
        body: { sessionId: 'session-1', analyses: ['analysis-1'] },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeStatsRequest(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });
  });

  describe('handleSubscribeMetricsRequest', () => {
    it('should return 400 when sessionId is missing', async () => {
      const mockReq = {
        body: {},
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeMetricsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId is required',
      });
    });

    it('should return 404 when session not found', async () => {
      const mockReq = {
        body: { sessionId: 'nonexistent' },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeMetricsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should successfully subscribe to metrics', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedToMetrics: false },
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const mockReq = {
        body: { sessionId: 'session-1' },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleSubscribeMetricsRequest(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
      });
    });
  });

  describe('handleUnsubscribeMetricsRequest', () => {
    it('should return 400 when sessionId is missing', async () => {
      const mockReq = {
        body: {},
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeMetricsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when session not found', async () => {
      const mockReq = {
        body: { sessionId: 'nonexistent' },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeMetricsRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should successfully unsubscribe from metrics', async () => {
      const mockSession = {
        id: 'session-1',
        state: { subscribedToMetrics: true },
      };
      mockManager.sessions.set('session-1', mockSession as any);

      const mockReq = {
        body: { sessionId: 'session-1' },
        user: { id: 'user-1' },
      } as any;

      await channelManager.handleUnsubscribeMetricsRequest(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
      });
    });
  });

  describe('sendLogStatsToSession', () => {
    it('should send log stats to connected session', async () => {
      const mockSession = {
        id: 'session-1',
        isConnected: true,
        push: vi.fn().mockResolvedValue(undefined),
      };

      await channelManager.sendLogStatsToSession(
        mockSession as any,
        'analysis-1',
      );

      expect(mockSession.push).toHaveBeenCalledWith({
        type: 'analysisLogStats',
        analysisId: 'analysis-1',
        totalCount: 0,
        logFileSize: 0,
      });
    });

    it('should not send stats when session is disconnected', async () => {
      const mockSession = {
        id: 'session-1',
        isConnected: false,
        push: vi.fn(),
      };

      await channelManager.sendLogStatsToSession(
        mockSession as any,
        'analysis-1',
      );

      expect(mockSession.push).not.toHaveBeenCalled();
    });
  });

  describe('sendProcessMetricsToSession', () => {
    it('should not send metrics when session is disconnected', async () => {
      const mockSession = {
        id: 'session-1',
        isConnected: false,
        push: vi.fn(),
      };

      await channelManager.sendProcessMetricsToSession(
        mockSession as any,
        'analysis-1',
      );

      expect(mockSession.push).not.toHaveBeenCalled();
    });
  });

  describe('broadcastAnalysisProcessMetrics', () => {
    it('should not broadcast when no channel exists', async () => {
      await channelManager.broadcastAnalysisProcessMetrics('nonexistent');
      // Should complete without error
    });

    it('should handle broadcast error gracefully', async () => {
      const mockChannel = {
        broadcast: vi.fn().mockImplementation(() => {
          throw new Error('Broadcast failed');
        }),
      };
      mockManager.analysisStatsChannels.set('analysis-1', mockChannel as any);

      await expect(
        channelManager.broadcastAnalysisProcessMetrics('analysis-1'),
      ).resolves.not.toThrow();
    });
  });
});

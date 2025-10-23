import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    getAllAnalyses: vi.fn(),
    analyses: new Map(),
  },
}));

vi.mock('../../src/middleware/betterAuthMiddleware.js', () => ({
  getUserTeamIds: vi.fn(() => ['team-1', 'uncategorized']),
}));

describe('sse', () => {
  let sse;
  let mockRes;
  let mockReq;
  let timers;

  beforeEach(async () => {
    vi.clearAllMocks();
    timers = [];

    // Mock setInterval and clearInterval
    global.setInterval = vi.fn((fn, delay) => {
      const id = Math.random();
      timers.push({ id, fn, delay });
      return id;
    });
    global.clearInterval = vi.fn((id) => {
      timers = timers.filter((t) => t.id !== id);
    });

    // Reset modules to get fresh SSEManager instance
    vi.resetModules();
    sse = await import('../../src/utils/sse.js');

    // Create mock request and response
    mockReq = {
      user: { id: 'user-123', role: 'user' },
      on: vi.fn(),
      headers: {},
    };

    mockRes = {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroyed: false,
      on: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SSEManager class initialization', () => {
    it('should initialize with empty clients map', () => {
      const stats = sse.sseManager.getStats();

      expect(stats.totalClients).toBe(0);
      expect(stats.uniqueUsers).toBe(0);
    });

    it('should initialize container state', () => {
      const state = sse.sseManager.getContainerState();

      expect(state.status).toBe('ready');
      expect(state.message).toBe('Container is ready');
      expect(state.startTime).toBeInstanceOf(Date);
    });

    it('should not have active intervals initially', () => {
      expect(sse.sseManager.metricsInterval).toBeNull();
      expect(sse.sseManager.heartbeatInterval).toBeNull();
    });
  });

  describe('addClient', () => {
    it('should add client to manager', () => {
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);

      expect(client).toBeDefined();
      expect(client.userId).toBe('user-123');
      expect(client.id).toBeDefined();
    });

    it('should initialize lastHeartbeat timestamp', () => {
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);

      expect(client.lastHeartbeat).toBeInstanceOf(Date);
    });

    it('should start heartbeat when first client connects', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      expect(global.setInterval).toHaveBeenCalled();
      const heartbeatTimer = timers.find((t) => t.delay === 30000);
      expect(heartbeatTimer).toBeDefined();
    });

    it('should start metrics broadcasting when first client connects', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      expect(global.setInterval).toHaveBeenCalled();
      const metricsTimer = timers.find((t) => t.delay === 1000);
      expect(metricsTimer).toBeDefined();
    });

    it('should register close event handler', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      expect(mockReq.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should register error event handler', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      expect(mockReq.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should support multiple clients for same user', () => {
      const mockReq2 = { ...mockReq, on: vi.fn() };
      const mockRes2 = { ...mockRes, write: vi.fn() };

      sse.sseManager.addClient('user-123', mockRes, mockReq);
      sse.sseManager.addClient('user-123', mockRes2, mockReq2);

      const stats = sse.sseManager.getStats();
      expect(stats.totalClients).toBe(2);
      expect(stats.uniqueUsers).toBe(1);
    });
  });

  describe('removeClient', () => {
    it('should remove client from manager', () => {
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);

      sse.sseManager.removeClient('user-123', client.id);

      const stats = sse.sseManager.getStats();
      expect(stats.totalClients).toBe(0);
    });

    it('should stop heartbeat when last client disconnects', () => {
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);

      sse.sseManager.removeClient('user-123', client.id);

      expect(global.clearInterval).toHaveBeenCalled();
    });

    it('should stop metrics when last client disconnects', () => {
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);

      sse.sseManager.removeClient('user-123', client.id);

      expect(global.clearInterval).toHaveBeenCalled();
    });

    it('should handle removing non-existent client', () => {
      expect(() => {
        sse.sseManager.removeClient('user-999', 'invalid-id');
      }).not.toThrow();
    });
  });

  describe('sendToUser', () => {
    it('should send message to user clients', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      const sentCount = sse.sseManager.sendToUser('user-123', {
        type: 'test',
      });

      expect(sentCount).toBe(1);
      expect(mockRes.write).toHaveBeenCalled();
    });

    it('should return 0 for non-existent user', () => {
      const sentCount = sse.sseManager.sendToUser('user-999', {
        type: 'test',
      });

      expect(sentCount).toBe(0);
    });

    it('should skip destroyed connections', () => {
      mockRes.destroyed = true;
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      const sentCount = sse.sseManager.sendToUser('user-123', {
        type: 'test',
      });

      expect(sentCount).toBe(0);
    });

    it('should send to all user connections', () => {
      const mockReq2 = { ...mockReq, on: vi.fn() };
      const mockRes2 = { ...mockRes, write: vi.fn() };

      sse.sseManager.addClient('user-123', mockRes, mockReq);
      sse.sseManager.addClient('user-123', mockRes2, mockReq2);

      const sentCount = sse.sseManager.sendToUser('user-123', {
        type: 'test',
      });

      expect(sentCount).toBe(2);
      expect(mockRes.write).toHaveBeenCalled();
      expect(mockRes2.write).toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should send message to all clients', () => {
      const mockReq2 = { ...mockReq, on: vi.fn(), user: { id: 'user-456' } };
      const mockRes2 = { ...mockRes, write: vi.fn() };

      sse.sseManager.addClient('user-123', mockRes, mockReq);
      sse.sseManager.addClient('user-456', mockRes2, mockReq2);

      const sentCount = sse.sseManager.broadcast({ type: 'global' });

      expect(sentCount).toBe(2);
      expect(mockRes.write).toHaveBeenCalled();
      expect(mockRes2.write).toHaveBeenCalled();
    });

    it('should skip destroyed connections', () => {
      mockRes.destroyed = true;
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      const sentCount = sse.sseManager.broadcast({ type: 'test' });

      expect(sentCount).toBe(0);
    });

    it('should remove failed clients', () => {
      mockRes.write.mockImplementation(() => {
        throw new Error('Write failed');
      });
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      sse.sseManager.broadcast({ type: 'test' });

      const stats = sse.sseManager.getStats();
      expect(stats.totalClients).toBe(0);
    });
  });

  describe('formatSSEMessage', () => {
    it('should format message in SSE format', () => {
      const message = sse.sseManager.formatSSEMessage({ type: 'test' });

      expect(message).toContain('data: ');
      expect(message).toContain('type');
      expect(message).toContain('timestamp');
      expect(message.endsWith('\n\n')).toBe(true);
    });

    it('should include timestamp', () => {
      const message = sse.sseManager.formatSSEMessage({ type: 'test' });
      const parsed = JSON.parse(message.replace('data: ', '').trim());

      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp)).toBeInstanceOf(Date);
    });

    it('should preserve original data', () => {
      const data = { type: 'log', message: 'test log', level: 'info' };
      const message = sse.sseManager.formatSSEMessage(data);
      const parsed = JSON.parse(message.replace('data: ', '').trim());

      expect(parsed.type).toBe('log');
      expect(parsed.message).toBe('test log');
      expect(parsed.level).toBe('info');
    });
  });

  describe('disconnectUser', () => {
    it('should close all user connections', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      const count = sse.sseManager.disconnectUser('user-123');

      expect(count).toBe(1);
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should return 0 for non-existent user', () => {
      const count = sse.sseManager.disconnectUser('user-999');

      expect(count).toBe(0);
    });

    it('should skip already destroyed connections', () => {
      mockRes.destroyed = true;
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      const count = sse.sseManager.disconnectUser('user-123');

      expect(count).toBe(0);
    });
  });

  describe('container state management', () => {
    it('should set container state', () => {
      sse.sseManager.setContainerState({ status: 'error' });

      const state = sse.sseManager.getContainerState();
      expect(state.status).toBe('error');
    });

    it('should merge container state', () => {
      sse.sseManager.setContainerState({ status: 'error' });
      sse.sseManager.setContainerState({ message: 'Test error' });

      const state = sse.sseManager.getContainerState();
      expect(state.status).toBe('error');
      expect(state.message).toBe('Test error');
    });

    it('should broadcast on state update', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      sse.sseManager.updateContainerState({ status: 'error' });

      expect(mockRes.write).toHaveBeenCalled();
    });
  });

  describe('broadcastRefresh', () => {
    it('should send refresh message to all clients', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      sse.sseManager.broadcastRefresh();

      expect(mockRes.write).toHaveBeenCalled();
      // Get the last write call (refresh message)
      const calls = mockRes.write.mock.calls;
      const message = calls[calls.length - 1][0];
      expect(message).toContain('refresh');
    });
  });

  describe('heartbeat', () => {
    it('should send heartbeat to all clients', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      sse.sseManager.sendHeartbeat();

      expect(mockRes.write).toHaveBeenCalled();
      const message = mockRes.write.mock.calls[0][0];
      expect(message).toContain('heartbeat');
    });

    it('should update lastHeartbeat on successful send', () => {
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);
      const beforeTime = new Date();

      sse.sseManager.sendHeartbeat();

      expect(client.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
    });

    it('should remove failed clients', () => {
      mockRes.write.mockImplementation(() => {
        throw new Error('Write failed');
      });
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      sse.sseManager.sendHeartbeat();

      const stats = sse.sseManager.getStats();
      expect(stats.totalClients).toBe(0);
    });
  });

  describe('stale connection cleanup', () => {
    it('should remove connections without recent heartbeat', () => {
      vi.useFakeTimers();
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);

      // Set lastHeartbeat to 65 seconds ago
      client.lastHeartbeat = new Date(Date.now() - 65000);

      sse.sseManager.cleanupStaleConnections();

      const stats = sse.sseManager.getStats();
      expect(stats.totalClients).toBe(0);

      vi.useRealTimers();
    });

    it('should keep connections with recent heartbeat', () => {
      vi.useFakeTimers();
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);

      // Set lastHeartbeat to 30 seconds ago
      client.lastHeartbeat = new Date(Date.now() - 30000);

      const removed = sse.sseManager.cleanupStaleConnections();

      expect(removed).toBe(0);
      const stats = sse.sseManager.getStats();
      expect(stats.totalClients).toBe(1);

      vi.useRealTimers();
    });
  });

  describe('authenticateSSE', () => {
    it('should authenticate valid session', async () => {
      const { auth } = await import('../../src/lib/auth.js');
      auth.api.getSession.mockResolvedValue({
        session: { id: 'session-123' },
        user: { id: 'user-123', role: 'user' },
      });

      const next = vi.fn();
      const req = { headers: {} };
      const res = {};

      await sse.authenticateSSE(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user-123');
      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid session', async () => {
      const { auth } = await import('../../src/lib/auth.js');
      auth.api.getSession.mockResolvedValue(null);

      const next = vi.fn();
      const req = { headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sse.authenticateSSE(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject session without user', async () => {
      const { auth } = await import('../../src/lib/auth.js');
      auth.api.getSession.mockResolvedValue({
        session: { id: 'session-123' },
        user: null,
      });

      const next = vi.fn();
      const req = { headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sse.authenticateSSE(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle authentication errors', async () => {
      const { auth } = await import('../../src/lib/auth.js');
      auth.api.getSession.mockRejectedValue(new Error('Auth failed'));

      const next = vi.fn();
      const req = { headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sse.authenticateSSE(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
      });
    });
  });

  describe('handleSSEConnection', () => {
    it('should set SSE headers', () => {
      sse.handleSSEConnection(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        }),
      );
    });

    it('should send connection confirmation', () => {
      sse.handleSSEConnection(mockReq, mockRes);

      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('connection'),
      );
    });

    it('should add client to manager', () => {
      sse.handleSSEConnection(mockReq, mockRes);

      const stats = sse.sseManager.getStats();
      expect(stats.totalClients).toBe(1);
    });

    it('should set CORS headers', () => {
      mockReq.headers.origin = 'http://localhost:5173';

      sse.handleSSEConnection(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Access-Control-Allow-Origin': 'http://localhost:5173',
          'Access-Control-Allow-Credentials': 'true',
        }),
      );
    });
  });

  describe('getStats', () => {
    it('should return accurate connection statistics', () => {
      const mockReq2 = { ...mockReq, on: vi.fn(), user: { id: 'user-456' } };
      const mockRes2 = { ...mockRes, write: vi.fn() };

      sse.sseManager.addClient('user-123', mockRes, mockReq);
      sse.sseManager.addClient('user-123', mockRes, mockReq);
      sse.sseManager.addClient('user-456', mockRes2, mockReq2);

      const stats = sse.sseManager.getStats();

      expect(stats.totalClients).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
      expect(stats.userConnections).toHaveLength(2);
    });

    it('should include per-user connection counts', () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      const stats = sse.sseManager.getStats();
      const userConn = stats.userConnections.find(
        (c) => c.userId === 'user-123',
      );

      expect(userConn).toBeDefined();
      expect(userConn.connectionCount).toBe(1);
    });
  });

  describe('SDK version caching', () => {
    it('should initialize SDK version on startup', () => {
      // cachedSdkVersion can be null or a string depending on implementation
      expect(sse.sseManager.cachedSdkVersion).toBeDefined();
    });

    it('should return cached SDK version', () => {
      const version = sse.sseManager.getSdkVersion();

      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
    });

    it('should cache SDK version to avoid repeated file reads', () => {
      const version1 = sse.sseManager.getSdkVersion();
      const version2 = sse.sseManager.getSdkVersion();

      expect(version1).toBe(version2);
      // Verify it's consistent
      if (sse.sseManager.cachedSdkVersion !== null) {
        expect(sse.sseManager.cachedSdkVersion).toBe(version1);
      }
    });
  });

  describe('broadcastMetricsUpdate', () => {
    beforeEach(async () => {
      const { metricsService } = await import(
        '../../src/services/metricsService.js'
      );
      const { analysisService } = await import(
        '../../src/services/analysisService.js'
      );

      // Setup default mock return values
      metricsService.getAllMetrics.mockResolvedValue({
        total: {
          backendUp: 1,
          analysisProcesses: 0,
          memoryUsage: 200,
          containerCPU: 25,
          childrenCPU: 0,
        },
        container: {
          backendUp: 1,
          memoryUsage: 200,
          cpuUsage: 25,
          dnsHitRate: 80,
        },
        children: {
          processCount: 0,
          memoryUsage: 0,
          cpuUsage: 0,
        },
        processes: [],
        timestamp: new Date().toISOString(),
      });

      analysisService.getAllAnalyses.mockReturnValue({});
      analysisService.analyses = new Map();
    });

    it('should not broadcast if no clients connected', async () => {
      const { metricsService } = await import(
        '../../src/services/metricsService.js'
      );

      await sse.sseManager.broadcastMetricsUpdate();

      expect(metricsService.getAllMetrics).not.toHaveBeenCalled();
      expect(mockRes.write).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const { metricsService } = await import(
        '../../src/services/metricsService.js'
      );

      metricsService.getAllMetrics.mockRejectedValue(
        new Error('Metrics error'),
      );

      sse.sseManager.addClient('user-123', mockRes, mockReq);

      // Should not throw
      await expect(
        sse.sseManager.broadcastMetricsUpdate(),
      ).resolves.not.toThrow();
    });
  });

  describe('sendInitialData', () => {
    let mockAuthDatabase;
    let mockAnalysisService;
    let mockTeamService;
    let mockGetUserTeamIds;

    beforeEach(async () => {
      // Mock authDatabase
      vi.doMock('../../src/utils/authDatabase.js', () => ({
        executeQuery: vi.fn(),
      }));

      // Mock services
      vi.doMock('../../src/services/analysisService.js', () => ({
        analysisService: {
          getAllAnalyses: vi.fn(),
          getConfig: vi.fn(),
        },
      }));

      vi.doMock('../../src/services/teamService.js', () => ({
        default: {
          getAllTeams: vi.fn(),
        },
      }));

      vi.doMock('../../src/middleware/betterAuthMiddleware.js', () => ({
        getUserTeamIds: vi.fn(),
      }));

      // Get mocked modules
      mockAuthDatabase = await import('../../src/utils/authDatabase.js');
      mockAnalysisService = (
        await import('../../src/services/analysisService.js')
      ).analysisService;
      mockTeamService = (await import('../../src/services/teamService.js'))
        .default;
      mockGetUserTeamIds = (
        await import('../../src/middleware/betterAuthMiddleware.js')
      ).getUserTeamIds;
    });

    it('should fetch fresh user data from database', async () => {
      const client = {
        req: { user: { id: 'user-123', role: 'user' } },
        res: { ...mockRes },
      };

      // Mock fresh user data with updated role
      mockAuthDatabase.executeQuery.mockReturnValue({
        id: 'user-123',
        role: 'admin', // User was promoted to admin
        email: 'test@test.com',
        name: 'Test User',
      });

      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        'test-analysis': { name: 'test', teamId: 'team-1' },
      });
      mockTeamService.getAllTeams.mockResolvedValue([
        { id: 'team-1', name: 'Team 1' },
      ]);
      mockAnalysisService.getConfig.mockResolvedValue({
        teamStructure: {},
      });

      await sse.sseManager.sendInitialData(client);

      // Verify fresh user data was fetched from database
      expect(mockAuthDatabase.executeQuery).toHaveBeenCalledWith(
        'SELECT id, role, email, name FROM user WHERE id = ?',
        ['user-123'],
        'fetching fresh user data for SSE init',
      );
    });

    it('should send all data to admin users', async () => {
      const client = {
        req: { user: { id: 'admin-123' } },
        res: { ...mockRes },
      };

      mockAuthDatabase.executeQuery.mockReturnValue({
        id: 'admin-123',
        role: 'admin',
        email: 'admin@test.com',
        name: 'Admin User',
      });

      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        'analysis-1': { name: 'Analysis 1', teamId: 'team-1' },
        'analysis-2': { name: 'Analysis 2', teamId: 'team-2' },
      });
      mockTeamService.getAllTeams.mockResolvedValue([
        { id: 'team-1', name: 'Team 1' },
        { id: 'team-2', name: 'Team 2' },
      ]);
      mockAnalysisService.getConfig.mockResolvedValue({
        teamStructure: {
          'team-1': { items: [] },
          'team-2': { items: [] },
        },
      });

      await sse.sseManager.sendInitialData(client);

      // Admin should receive all data
      expect(mockRes.write).toHaveBeenCalled();
      const writeCall = mockRes.write.mock.calls[0][0];
      const data = JSON.parse(writeCall.replace('data: ', '').trim());

      expect(data.type).toBe('init');
      expect(Object.keys(data.analyses)).toHaveLength(2);
      expect(Object.keys(data.teams)).toHaveLength(2);
      expect(Object.keys(data.teamStructure)).toHaveLength(2);
    });

    it('should filter data for regular users based on team access', async () => {
      const client = {
        req: { user: { id: 'user-123' } },
        res: { ...mockRes },
      };

      mockAuthDatabase.executeQuery.mockReturnValue({
        id: 'user-123',
        role: 'user',
        email: 'user@test.com',
        name: 'Regular User',
      });

      mockGetUserTeamIds.mockReturnValue(['team-1']); // User only has access to team-1

      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        'analysis-1': { name: 'Analysis 1', teamId: 'team-1' },
        'analysis-2': { name: 'Analysis 2', teamId: 'team-2' }, // Not accessible
      });
      mockTeamService.getAllTeams.mockResolvedValue([
        { id: 'team-1', name: 'Team 1' },
        { id: 'team-2', name: 'Team 2' },
      ]);
      mockAnalysisService.getConfig.mockResolvedValue({
        teamStructure: {
          'team-1': { items: [] },
          'team-2': { items: [] },
        },
      });

      await sse.sseManager.sendInitialData(client);

      // Regular user should only receive filtered data
      expect(mockRes.write).toHaveBeenCalled();
      const writeCall = mockRes.write.mock.calls[0][0];
      const data = JSON.parse(writeCall.replace('data: ', '').trim());

      expect(data.type).toBe('init');
      expect(Object.keys(data.analyses)).toHaveLength(1);
      expect(data.analyses['analysis-1']).toBeDefined();
      expect(data.analyses['analysis-2']).toBeUndefined();
      expect(Object.keys(data.teams)).toHaveLength(1);
      expect(data.teams['team-1']).toBeDefined();
      expect(data.teams['team-2']).toBeUndefined();
      expect(Object.keys(data.teamStructure)).toHaveLength(1);
      expect(data.teamStructure['team-1']).toBeDefined();
      expect(data.teamStructure['team-2']).toBeUndefined();
    });

    it('should filter teamStructure based on user permissions', async () => {
      const client = {
        req: { user: { id: 'user-123' } },
        res: { ...mockRes },
      };

      mockAuthDatabase.executeQuery.mockReturnValue({
        id: 'user-123',
        role: 'user',
        email: 'user@test.com',
        name: 'Regular User',
      });

      mockGetUserTeamIds.mockReturnValue(['team-1', 'uncategorized']);

      mockAnalysisService.getAllAnalyses.mockResolvedValue({});
      mockTeamService.getAllTeams.mockResolvedValue([
        { id: 'team-1', name: 'Team 1' },
        { id: 'team-2', name: 'Team 2' },
        { id: 'uncategorized', name: 'Uncategorized' },
      ]);
      mockAnalysisService.getConfig.mockResolvedValue({
        teamStructure: {
          'team-1': { items: [{ id: '1', type: 'analysis' }] },
          'team-2': { items: [{ id: '2', type: 'analysis' }] },
          uncategorized: { items: [] },
        },
      });

      await sse.sseManager.sendInitialData(client);

      const writeCall = mockRes.write.mock.calls[0][0];
      const data = JSON.parse(writeCall.replace('data: ', '').trim());

      // Should only include teamStructure for accessible teams
      expect(data.teamStructure['team-1']).toBeDefined();
      expect(data.teamStructure.uncategorized).toBeDefined();
      expect(data.teamStructure['team-2']).toBeUndefined();
    });

    it('should handle user not found in database', async () => {
      const client = {
        req: { user: { id: 'nonexistent-user' } },
        res: { ...mockRes },
      };

      mockAuthDatabase.executeQuery.mockReturnValue(null);

      await sse.sseManager.sendInitialData(client);

      // Should return early without sending data
      expect(mockAnalysisService.getAllAnalyses).not.toHaveBeenCalled();
      expect(mockRes.write).not.toHaveBeenCalled();
    });

    it('should call sendStatusUpdate after sending init data', async () => {
      const client = {
        req: { user: { id: 'user-123' } },
        res: { ...mockRes },
      };

      mockAuthDatabase.executeQuery.mockReturnValue({
        id: 'user-123',
        role: 'admin',
        email: 'admin@test.com',
        name: 'Admin User',
      });

      mockAnalysisService.getAllAnalyses.mockResolvedValue({});
      mockTeamService.getAllTeams.mockResolvedValue([]);
      mockAnalysisService.getConfig.mockResolvedValue({
        teamStructure: {},
      });

      // Spy on sendStatusUpdate
      const sendStatusUpdateSpy = vi.spyOn(sse.sseManager, 'sendStatusUpdate');

      await sse.sseManager.sendInitialData(client);

      expect(sendStatusUpdateSpy).toHaveBeenCalledWith(client);
    });
  });

  describe('refreshInitDataForUser', () => {
    let mockAuthDatabase;
    let mockAnalysisService;
    let mockTeamService;

    beforeEach(async () => {
      // Get mocked modules
      mockAuthDatabase = await import('../../src/utils/authDatabase.js');
      mockAnalysisService = (
        await import('../../src/services/analysisService.js')
      ).analysisService;
      mockTeamService = (await import('../../src/services/teamService.js'))
        .default;
    });

    it('should return 0 if user has no active connections', async () => {
      const refreshedCount =
        await sse.sseManager.refreshInitDataForUser('nonexistent-user');

      expect(refreshedCount).toBe(0);
    });

    it('should call sendInitialData for each user connection', async () => {
      const client = sse.sseManager.addClient('user-123', mockRes, mockReq);

      mockAuthDatabase.executeQuery.mockReturnValue({
        id: 'user-123',
        role: 'user',
        email: 'user@test.com',
        name: 'User',
      });

      mockAnalysisService.getAllAnalyses.mockResolvedValue({});
      mockTeamService.getAllTeams.mockResolvedValue([]);
      mockAnalysisService.getConfig.mockResolvedValue({
        teamStructure: {},
      });

      const sendInitialDataSpy = vi.spyOn(sse.sseManager, 'sendInitialData');

      await sse.sseManager.refreshInitDataForUser('user-123');

      expect(sendInitialDataSpy).toHaveBeenCalledWith(client);
    });

    it('should use fresh user data when refreshing after role change', async () => {
      // User connects with 'user' role
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      // User is promoted to admin (database updated)
      mockAuthDatabase.executeQuery.mockReturnValue({
        id: 'user-123',
        role: 'admin', // Updated role
        email: 'user@test.com',
        name: 'User',
      });

      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        'analysis-1': { name: 'Analysis 1', teamId: 'team-1' },
        'analysis-2': { name: 'Analysis 2', teamId: 'team-2' },
      });
      mockTeamService.getAllTeams.mockResolvedValue([
        { id: 'team-1', name: 'Team 1' },
        { id: 'team-2', name: 'Team 2' },
      ]);
      mockAnalysisService.getConfig.mockResolvedValue({
        teamStructure: {
          'team-1': { items: [] },
          'team-2': { items: [] },
        },
      });

      await sse.sseManager.refreshInitDataForUser('user-123');

      // Verify fresh user data was fetched (not using cached client.req.user)
      expect(mockAuthDatabase.executeQuery).toHaveBeenCalledWith(
        'SELECT id, role, email, name FROM user WHERE id = ?',
        ['user-123'],
        'fetching fresh user data for SSE init',
      );

      // Verify admin received all data
      // Find the init message (not the statusUpdate which comes after)
      const initWriteCall = mockRes.write.mock.calls.find((call) =>
        call[0].includes('"type":"init"'),
      );
      expect(initWriteCall).toBeDefined();
      const data = JSON.parse(initWriteCall[0].replace('data: ', '').trim());

      expect(data.type).toBe('init');
      expect(Object.keys(data.analyses)).toHaveLength(2); // Admin gets all
      expect(Object.keys(data.teams)).toHaveLength(2);
    });

    it('should skip destroyed connections', async () => {
      mockRes.destroyed = true;
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      const refreshedCount =
        await sse.sseManager.refreshInitDataForUser('user-123');

      expect(refreshedCount).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      sse.sseManager.addClient('user-123', mockRes, mockReq);

      mockAuthDatabase.executeQuery.mockImplementation(() => {
        throw new Error('Database error');
      });

      // Should not throw
      await expect(
        sse.sseManager.refreshInitDataForUser('user-123'),
      ).resolves.not.toThrow();
    });
  });
});

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
});

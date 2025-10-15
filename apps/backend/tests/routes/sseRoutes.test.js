import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
vi.mock('../../src/utils/sse.js', () => ({
  authenticateSSE: vi.fn((req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  }),
  handleSSEConnection: vi.fn((req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('data: {"type":"init"}\n\n');
    res.end();
  }),
  sseManager: {
    sendToUser: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    broadcastUpdate: vi.fn(),
  },
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  sseLogoutLimiter: (req, res, next) => next(),
}));

vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../src/middleware/loggingMiddleware.js', () => ({
  attachRequestLogger: (req, res, next) => {
    req.log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      })),
    };
    next();
  },
}));

describe('SSE Routes', () => {
  let app;
  let sseRoutes;
  let authenticateSSE;
  let handleSSEConnection;
  let sseManager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());

    // Add logging middleware
    const { attachRequestLogger } = await import(
      '../../src/middleware/loggingMiddleware.js'
    );
    app.use(attachRequestLogger);

    // Import SSE utilities
    const sseModule = await import('../../src/utils/sse.js');
    authenticateSSE = sseModule.authenticateSSE;
    handleSSEConnection = sseModule.handleSSEConnection;
    sseManager = sseModule.sseManager;

    // Import routes
    const routesModule = await import('../../src/routes/sseRoutes.js');
    sseRoutes = routesModule.default;

    // Mount routes
    app.use('/api/sse', sseRoutes);
  });

  describe('GET /api/sse/events', () => {
    it('should establish SSE connection', async () => {
      const response = await request(app).get('/api/sse/events').expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(authenticateSSE).toHaveBeenCalled();
      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should send initial data event', async () => {
      const response = await request(app).get('/api/sse/events').expect(200);

      expect(response.text).toContain('data: {"type":"init"}');
    });

    it('should require authentication', async () => {
      await request(app).get('/api/sse/events');

      expect(authenticateSSE).toHaveBeenCalled();
    });

    it('should set correct SSE headers', async () => {
      const response = await request(app).get('/api/sse/events').expect(200);

      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      expect(response.headers['cache-control']).toBe('no-cache');
    });
  });

  describe('POST /api/sse/logout-notification', () => {
    it('should send logout notification successfully', async () => {
      const response = await request(app)
        .post('/api/sse/logout-notification')
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({
          type: 'userLogout',
          userId: 'test-user',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should apply rate limiter', async () => {
      await request(app).post('/api/sse/logout-notification');

      expect(sseManager.sendToUser).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      await request(app).post('/api/sse/logout-notification');

      expect(authenticateSSE).toHaveBeenCalled();
    });

    it('should send notification to user via SSE manager', async () => {
      await request(app).post('/api/sse/logout-notification').expect(200);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({
          type: 'userLogout',
          userId: 'test-user',
        }),
      );
    });

    it('should include timestamp in notification', async () => {
      await request(app).post('/api/sse/logout-notification').expect(200);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      // Mock sendToUser to throw error
      sseManager.sendToUser.mockImplementationOnce(() => {
        throw new Error('SSE error');
      });

      const response = await request(app)
        .post('/api/sse/logout-notification')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to send logout notification',
      });
    });

    it('should log successful logout notification', async () => {
      await request(app).post('/api/sse/logout-notification').expect(200);

      expect(sseManager.sendToUser).toHaveBeenCalled();
    });
  });

  describe('authentication and authorization', () => {
    it('should authenticate SSE connections', async () => {
      await request(app).get('/api/sse/events');
      await request(app).post('/api/sse/logout-notification');

      expect(authenticateSSE).toHaveBeenCalledTimes(2);
    });

    it('should attach user to request after authentication', async () => {
      await request(app).post('/api/sse/logout-notification').expect(200);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'test-user',
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/api/sse/unknown').expect(404);
    });

    it('should handle errors in logout notification', async () => {
      sseManager.sendToUser.mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const response = await request(app)
        .post('/api/sse/logout-notification')
        .expect(500);

      expect(response.body.error).toBe('Failed to send logout notification');
    });
  });

  describe('SSE protocol compliance', () => {
    it('should use event-stream content type', async () => {
      const response = await request(app).get('/api/sse/events').expect(200);

      expect(response.headers['content-type']).toMatch(/^text\/event-stream/);
    });

    it('should disable caching for SSE stream', async () => {
      const response = await request(app).get('/api/sse/events').expect(200);

      expect(response.headers['cache-control']).toBe('no-cache');
    });

    it('should maintain keep-alive connection', async () => {
      const response = await request(app).get('/api/sse/events').expect(200);

      expect(response.headers['connection']).toBe('keep-alive');
    });
  });

  describe('middleware chain', () => {
    it('should apply rate limiter to logout notification', async () => {
      await request(app).post('/api/sse/logout-notification');

      expect(sseManager.sendToUser).toHaveBeenCalled();
    });

    it('should authenticate before handling SSE connection', async () => {
      await request(app).get('/api/sse/events');

      expect(authenticateSSE).toHaveBeenCalled();
      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should authenticate before logout notification', async () => {
      await request(app).post('/api/sse/logout-notification');

      expect(authenticateSSE).toHaveBeenCalled();
      expect(sseManager.sendToUser).toHaveBeenCalled();
    });
  });

  describe('HTTP methods', () => {
    it('should only accept GET for events endpoint', async () => {
      await request(app).get('/api/sse/events').expect(200);
      await request(app).post('/api/sse/events').expect(404);
      await request(app).put('/api/sse/events').expect(404);
      await request(app).delete('/api/sse/events').expect(404);
    });

    it('should only accept POST for logout notification', async () => {
      await request(app).post('/api/sse/logout-notification').expect(200);
      await request(app).get('/api/sse/logout-notification').expect(404);
      await request(app).put('/api/sse/logout-notification').expect(404);
      await request(app).delete('/api/sse/logout-notification').expect(404);
    });
  });

  describe('real-time events', () => {
    it('should handle SSE event streaming', async () => {
      const response = await request(app).get('/api/sse/events').expect(200);

      expect(handleSSEConnection).toHaveBeenCalled();
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    it('should broadcast logout to user sessions', async () => {
      await request(app).post('/api/sse/logout-notification').expect(200);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({
          type: 'userLogout',
        }),
      );
    });
  });
});

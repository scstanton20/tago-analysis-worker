/**
 * SSE Routes Integration Tests
 *
 * - Uses REAL better-auth authentication (no mocks)
 * - Tests multiple user roles can access SSE
 * - Includes negative test cases (401)
 * - SSE accessible to all authenticated users
 * - Uses real database sessions
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  type Mock,
} from 'vitest';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import request from 'supertest';
import {
  setupTestAuth,
  cleanupTestAuth,
  getSessionCookie,
} from '../utils/authHelpers.ts';

type SSEManager = {
  sendToUser: Mock;
  addClient: Mock;
  removeClient: Mock;
  broadcastUpdate: Mock;
  updateContainerState: Mock;
};

// Mock only SSE connection handler - NOT authentication!
vi.mock('../../src/utils/sse/index.ts', async () => {
  const actual = await vi.importActual('../../src/utils/sse/index.ts');
  return {
    ...actual,
    handleSSEConnection: vi.fn((_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      // Flush headers first to establish connection properly
      res.flushHeaders();
      res.write('data: {"type":"init"}\n\n');
      // Use setImmediate to ensure response is fully written before ending
      setImmediate(() => res.end());
    }),
    sseManager: {
      sendToUser: vi.fn(),
      addClient: vi.fn(),
      removeClient: vi.fn(),
      broadcastUpdate: vi.fn(),
      updateContainerState: vi.fn(),
    },
  };
});

vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

type RequestWithLog = {
  log: {
    info: Mock;
    error: Mock;
    warn: Mock;
    debug: Mock;
    child: Mock;
  };
};

// Logging middleware mock - provides req.log
const attachRequestLogger = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  (req as unknown as RequestWithLog).log = {
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
};

vi.mock('../../src/middleware/loggingMiddleware.ts', () => ({
  attachRequestLogger,
}));

vi.mock('../../src/middleware/compression.ts', () => ({
  sseCompression: () => (_req: Request, _res: Response, next: NextFunction) =>
    next(),
}));

describe('SSE Routes - WITH REAL AUTH', () => {
  let app: Express;
  let handleSSEConnection: Mock;
  let sseManager: SSEManager;

  beforeAll(async () => {
    // Setup test infrastructure (creates test org, teams, users)
    await setupTestAuth();
  });

  afterAll(async () => {
    // Cleanup all test data
    await cleanupTestAuth();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create fresh Express app with REAL middleware
    app = express();
    app.use(express.json());
    app.use(attachRequestLogger); // Use mocked logging middleware

    // Import SSE utilities
    const sseModule = await import('../../src/utils/sse/index.ts');
    handleSSEConnection = sseModule.handleSSEConnection as Mock;
    sseManager = sseModule.sseManager as unknown as SSEManager;
    // Prevent unused variable warning - sseManager is imported for test setup
    void sseManager;

    // Import routes with REAL auth middleware
    const { sseRouter } = await import('../../src/routes/sseRoutes.ts');
    app.use('/api/sse', sseRouter);
  });

  describe('Authentication Requirements', () => {
    it('should reject unauthenticated requests to SSE events', async () => {
      await request(app).get('/api/sse/events').expect(401);

      expect(handleSSEConnection).not.toHaveBeenCalled();
    });

    it('should allow authenticated users to connect to SSE', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(handleSSEConnection).toHaveBeenCalled();
    });
  });

  describe('GET /api/sse/events - All Authenticated Users', () => {
    it('should allow admin to establish SSE connection', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should allow team owner to connect to SSE', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should allow team editor to connect to SSE', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .get('/api/sse/events')
        .set('Cookie', editorCookie)
        .expect(200);

      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should allow team viewer to connect to SSE', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .get('/api/sse/events')
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should allow team runner to connect to SSE', async () => {
      const runnerCookie = await getSessionCookie('teamRunner');

      await request(app)
        .get('/api/sse/events')
        .set('Cookie', runnerCookie)
        .expect(200);

      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should allow user with no team access to connect to SSE', async () => {
      const noAccessCookie = await getSessionCookie('noAccess');

      await request(app)
        .get('/api/sse/events')
        .set('Cookie', noAccessCookie)
        .expect(200);

      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should allow multi-team user to connect to SSE', async () => {
      const multiTeamCookie = await getSessionCookie('multiTeamUser');

      await request(app)
        .get('/api/sse/events')
        .set('Cookie', multiTeamCookie)
        .expect(200);

      expect(handleSSEConnection).toHaveBeenCalled();
    });

    it('should send initial data event', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.text).toContain('data: {"type":"init"}');
    });
  });

  describe('SSE Protocol Compliance', () => {
    it('should use event-stream content type', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/^text\/event-stream/);
    });

    it('should disable caching for SSE stream', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', editorCookie)
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-cache');
    });

    it('should maintain keep-alive connection', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(response.headers['connection']).toBe('keep-alive');
    });

    it('should set correct SSE headers', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/sse/unknown')
        .set('Cookie', adminCookie)
        .expect(404);
    });
  });

  describe('HTTP Methods', () => {
    it('should only accept GET for events endpoint', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app)
        .post('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(404);

      await request(app)
        .put('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(404);

      await request(app)
        .delete('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(404);
    });
  });

  describe('Multiple User Roles - Comprehensive Coverage', () => {
    it('should verify all authenticated users can connect to SSE', async () => {
      const userRoles = [
        'admin',
        'teamOwner',
        'teamEditor',
        'teamViewer',
        'teamRunner',
        'noAccess',
        'multiTeamUser',
      ] as const;

      for (const role of userRoles) {
        vi.clearAllMocks();
        const cookie = await getSessionCookie(role);

        await request(app)
          .get('/api/sse/events')
          .set('Cookie', cookie)
          .expect(200);

        expect(handleSSEConnection).toHaveBeenCalled();
      }
    });
  });

  describe('Real-time Events', () => {
    it('should handle SSE event streaming for admin', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(handleSSEConnection).toHaveBeenCalled();
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    it('should handle SSE event streaming for regular users', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      const response = await request(app)
        .get('/api/sse/events')
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(handleSSEConnection).toHaveBeenCalled();
      expect(response.headers['content-type']).toContain('text/event-stream');
    });
  });
});

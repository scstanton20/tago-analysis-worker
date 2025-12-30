/**
 * Analysis Routes Integration Tests
 *
 * - Uses REAL better-auth authentication (no mocks)
 * - Uses REAL rate limiting (with test-friendly limits via env vars)
 * - Tests multiple user roles and permissions
 * - Includes negative test cases (401, 403)
 * - Tests permission boundaries
 * - Uses real database sessions
 *
 */

// Set test-friendly rate limits BEFORE importing modules
// The rate limiters are created at module load time
// Note: These limits must accommodate ALL tests in this file since rate limiters are shared
process.env.TEST_RATE_LIMIT_FILE_OPS = '50'; // Instead of 200 (must handle ~30 tests)
process.env.TEST_RATE_LIMIT_UPLOADS = '20'; // Instead of 50
process.env.TEST_RATE_LIMIT_ANALYSIS_RUN = '30'; // Instead of 100
process.env.TEST_RATE_LIMIT_DELETIONS = '20'; // Instead of 50
process.env.TEST_RATE_LIMIT_VERSION_OPS = '50'; // Instead of 500

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
  createTestSession,
  getSessionCookie,
} from '../utils/authHelpers.ts';

// Mock only external dependencies and file system operations
// DO NOT mock authentication/authorization middleware or rate limiting
vi.mock('../../src/utils/storage.ts', () => ({
  ensureAnalysisDir: vi.fn().mockResolvedValue(undefined),
  getAnalysisPath: vi.fn(
    (name: string) => `/tmp/test-analyses-storage/${name}`,
  ),
  analysisExists: vi.fn().mockResolvedValue(true),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('console.log("test");'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock SSE for testing (external service)
vi.mock('../../src/utils/sse/index.ts', () => ({
  sseManager: {
    broadcastUpdate: vi.fn(),
    broadcastAnalysisUpdate: vi.fn(),
    broadcastStatusUpdate: vi.fn(),
    broadcastRefresh: vi.fn(),
    broadcastTeamUpdate: vi.fn(),
    updateContainerState: vi.fn(),
  },
}));

const TEST_ANALYSIS_IDS = {
  team1Analysis: 'aaaaaaaa-1111-4000-8000-000000000001',
  team2Analysis: 'aaaaaaaa-2222-4000-8000-000000000002',
};

type AnalysisMetadata = {
  analysisId: string;
  analysisName: string;
  teamId?: string;
};

// Mock analysis service (we're testing routes, not service logic)
const mockAnalysisService = {
  getAllAnalyses: vi.fn().mockResolvedValue({}),
  getConfig: vi.fn().mockResolvedValue({ analyses: {} }),
  getAnalysisById: vi.fn((analysisId: string): AnalysisMetadata | null => {
    if (analysisId === TEST_ANALYSIS_IDS.team1Analysis) {
      return {
        analysisId: TEST_ANALYSIS_IDS.team1Analysis,
        analysisName: 'team1-analysis',
        teamId: 'team-1',
      };
    }
    if (analysisId === TEST_ANALYSIS_IDS.team2Analysis) {
      return {
        analysisId: TEST_ANALYSIS_IDS.team2Analysis,
        analysisName: 'team2-analysis',
        teamId: 'team-2',
      };
    }
    return null;
  }),
};

vi.mock('../../src/services/analysisService.ts', () => ({
  analysisService: mockAnalysisService,
}));

// Mock the analysis controller
const AnalysisController = {
  getAllAnalyses: vi.fn((_req: Request, res: Response) => res.json({})),
  getAnalyses: vi.fn((_req: Request, res: Response) =>
    res.json({ analyses: [], departments: {} }),
  ),
  runAnalysis: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
  stopAnalysis: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
  deleteAnalysis: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
  getAnalysisContent: vi.fn((_req: Request, res: Response) =>
    res.json({ content: 'console.log("test");' }),
  ),
  updateAnalysis: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
  renameAnalysis: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
  downloadAnalysis: vi.fn((_req: Request, res: Response) =>
    res.send('console.log("test");'),
  ),
  getEnvironment: vi.fn((_req: Request, res: Response) =>
    res.json({ variables: [] }),
  ),
  updateEnvironment: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
  getLogs: vi.fn((_req: Request, res: Response) => res.json({ logs: [] })),
  downloadLogs: vi.fn((_req: Request, res: Response) => res.send('logs')),
  clearLogs: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
  getVersions: vi.fn((_req: Request, res: Response) =>
    res.json({ versions: [] }),
  ),
  rollbackToVersion: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
  uploadAnalysis: vi.fn((_req: Request, res: Response) =>
    res.json({ success: true }),
  ),
};

vi.mock('../../src/controllers/analysisController.ts', () => ({
  AnalysisController: AnalysisController,
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

describe('Analysis Routes - WITH REAL AUTH', () => {
  let app: Express;

  // Setup auth infrastructure before all tests
  beforeAll(async () => {
    await setupTestAuth();
  });

  // Cleanup after all tests
  afterAll(async () => {
    await cleanupTestAuth();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh Express app with REAL middleware
    app = express();
    app.use(express.json());
    app.use(attachRequestLogger); // Use mocked logging middleware

    // Import routes
    const { analysisRouter } = await import(
      '../../src/routes/analysisRoutes.ts'
    );
    app.use('/api/analyses', analysisRouter);
  });

  describe('Authentication Requirements', () => {
    it('should reject unauthenticated requests with 401', async () => {
      // No auth cookie = should be rejected
      const response = await request(app).get('/api/analyses').expect(401);

      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should reject requests with invalid session token', async () => {
      const response = await request(app)
        .get('/api/analyses')
        .set('Cookie', 'better-auth.session_token=invalid-token-12345')
        .expect(401);

      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should allow authenticated admin requests', async () => {
      const adminCookie = await getSessionCookie('admin');

      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        'test.js': { name: 'test.js', teamId: 'team-1' },
      });

      await request(app)
        .get('/api/analyses')
        .set('Cookie', adminCookie)
        .expect(200);
    });

    it('should allow authenticated regular user requests', async () => {
      const userCookie = await getSessionCookie('teamViewer');

      mockAnalysisService.getAllAnalyses.mockResolvedValue({});

      await request(app)
        .get('/api/analyses')
        .set('Cookie', userCookie)
        .expect(200);
    });
  });

  describe('Permission Boundaries - Team-Based Access', () => {
    beforeEach(() => {
      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        [TEST_ANALYSIS_IDS.team1Analysis]: {
          analysisId: TEST_ANALYSIS_IDS.team1Analysis,
          analysisName: 'team1-analysis',
          teamId: 'team-1',
        },
        [TEST_ANALYSIS_IDS.team2Analysis]: {
          analysisId: TEST_ANALYSIS_IDS.team2Analysis,
          analysisName: 'team2-analysis',
          teamId: 'team-2',
        },
      });
    });

    describe('View Permission (view_analyses)', () => {
      it('should allow admin to view all analyses', async () => {
        const adminCookie = await getSessionCookie('admin');

        await request(app)
          .get('/api/analyses')
          .set('Cookie', adminCookie)
          .expect(200);
      });

      it('should allow team viewer to view team analyses', async () => {
        const viewerCookie = await getSessionCookie('teamViewer');

        await request(app)
          .get(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/content`)
          .set('Cookie', viewerCookie)
          .expect(200);
      });

      it('should deny user with no team access', async () => {
        const noAccessCookie = await getSessionCookie('noAccess');

        await request(app)
          .get(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/content`)
          .set('Cookie', noAccessCookie)
          .expect(403);
      });

      it('should deny cross-team access attempts', async () => {
        const team2Cookie = await getSessionCookie('team2User');

        // team2User has access to team-2 but NOT team-1
        await request(app)
          .get(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/content`)
          .set('Cookie', team2Cookie)
          .expect(403);
      });
    });

    describe('Run Permission (run_analyses)', () => {
      it('should allow team owner to run analyses', async () => {
        const ownerCookie = await getSessionCookie('teamOwner');

        await request(app)
          .post(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/run`)
          .set('Cookie', ownerCookie)
          .send({ type: 'listener' })
          .expect(200);
      });

      it('should allow team runner to run analyses', async () => {
        const runnerCookie = await getSessionCookie('teamRunner');

        await request(app)
          .post(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/run`)
          .set('Cookie', runnerCookie)
          .send({ type: 'listener' })
          .expect(200);
      });

      it('should deny team viewer from running analyses', async () => {
        const viewerCookie = await getSessionCookie('teamViewer');

        await request(app)
          .post(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/run`)
          .set('Cookie', viewerCookie)
          .send({ type: 'listener' })
          .expect(403);
      });

      it('should deny users with no permissions', async () => {
        const noAccessCookie = await getSessionCookie('noAccess');

        await request(app)
          .post(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/run`)
          .set('Cookie', noAccessCookie)
          .send({ type: 'listener' })
          .expect(403);
      });
    });

    describe('Edit Permission (edit_analyses)', () => {
      it('should allow team editor to update analyses', async () => {
        const editorCookie = await getSessionCookie('teamEditor');

        await request(app)
          .put(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
          .set('Cookie', editorCookie)
          .send({ content: 'console.log("updated");' })
          .expect(200);
      });

      it('should allow team owner to update analyses', async () => {
        const ownerCookie = await getSessionCookie('teamOwner');

        await request(app)
          .put(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
          .set('Cookie', ownerCookie)
          .send({ content: 'console.log("updated");' })
          .expect(200);
      });

      it('should deny team viewer from editing', async () => {
        const viewerCookie = await getSessionCookie('teamViewer');

        await request(app)
          .put(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
          .set('Cookie', viewerCookie)
          .send({ content: 'console.log("hacked");' })
          .expect(403);
      });

      it('should deny team runner from editing', async () => {
        const runnerCookie = await getSessionCookie('teamRunner');

        await request(app)
          .put(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
          .set('Cookie', runnerCookie)
          .send({ content: 'console.log("hacked");' })
          .expect(403);
      });
    });

    describe('Delete Permission (delete_analyses)', () => {
      it('should allow team owner to delete analyses', async () => {
        const ownerCookie = await getSessionCookie('teamOwner');

        await request(app)
          .delete(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
          .set('Cookie', ownerCookie)
          .expect(200);
      });

      it('should deny team editor from deleting', async () => {
        const editorCookie = await getSessionCookie('teamEditor');

        await request(app)
          .delete(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
          .set('Cookie', editorCookie)
          .expect(403);
      });

      it('should deny team viewer from deleting', async () => {
        const viewerCookie = await getSessionCookie('teamViewer');

        await request(app)
          .delete(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
          .set('Cookie', viewerCookie)
          .expect(403);
      });

      it('should deny team runner from deleting', async () => {
        const runnerCookie = await getSessionCookie('teamRunner');

        await request(app)
          .delete(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
          .set('Cookie', runnerCookie)
          .expect(403);
      });
    });
  });

  describe('Multi-Team User Scenarios', () => {
    beforeEach(() => {
      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        [TEST_ANALYSIS_IDS.team1Analysis]: {
          analysisId: TEST_ANALYSIS_IDS.team1Analysis,
          analysisName: 'team1-analysis',
          teamId: 'team-1',
        },
        [TEST_ANALYSIS_IDS.team2Analysis]: {
          analysisId: TEST_ANALYSIS_IDS.team2Analysis,
          analysisName: 'team2-analysis',
          teamId: 'team-2',
        },
      });
    });

    it('should allow user to access analyses from multiple teams', async () => {
      const multiTeamCookie = await getSessionCookie('multiTeamUser');

      // Has view+edit on team-1
      await request(app)
        .get(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/content`)
        .set('Cookie', multiTeamCookie)
        .expect(200);

      // Has view+run on team-2
      await request(app)
        .get(`/api/analyses/${TEST_ANALYSIS_IDS.team2Analysis}/content`)
        .set('Cookie', multiTeamCookie)
        .expect(200);
    });

    it('should respect different permissions across teams', async () => {
      const multiTeamCookie = await getSessionCookie('multiTeamUser');

      // Can edit team-1 analyses
      await request(app)
        .put(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
        .set('Cookie', multiTeamCookie)
        .send({ content: 'console.log("updated");' })
        .expect(200);

      // Cannot edit team-2 analyses (only has view+run)
      await request(app)
        .put(`/api/analyses/${TEST_ANALYSIS_IDS.team2Analysis}`)
        .set('Cookie', multiTeamCookie)
        .send({ content: 'console.log("updated");' })
        .expect(403);
    });
  });

  describe('Admin Bypass', () => {
    beforeEach(() => {
      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        [TEST_ANALYSIS_IDS.team1Analysis]: {
          analysisId: TEST_ANALYSIS_IDS.team1Analysis,
          analysisName: 'team1-analysis',
          teamId: 'team-1',
        },
        [TEST_ANALYSIS_IDS.team2Analysis]: {
          analysisId: TEST_ANALYSIS_IDS.team2Analysis,
          analysisName: 'team2-analysis',
          teamId: 'team-2',
        },
      });
    });

    it('should allow admin to access any team analysis', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/content`)
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app)
        .get(`/api/analyses/${TEST_ANALYSIS_IDS.team2Analysis}/content`)
        .set('Cookie', adminCookie)
        .expect(200);
    });

    it('should allow admin to perform any operation', async () => {
      const adminCookie = await getSessionCookie('admin');

      // View
      await request(app)
        .get(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}/content`)
        .set('Cookie', adminCookie)
        .expect(200);

      // Edit
      await request(app)
        .put(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
        .set('Cookie', adminCookie)
        .send({ content: 'console.log("admin");' })
        .expect(200);

      // Delete
      await request(app)
        .delete(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
        .set('Cookie', adminCookie)
        .expect(200);
    });
  });

  describe('Edge Cases and Security', () => {
    const orphanAnalysisId = 'aaaaaaaa-3333-4000-8000-000000000003';

    it('should handle missing teamId in analysis metadata', async () => {
      mockAnalysisService.getAnalysisById.mockImplementation(
        (id: string): AnalysisMetadata | null => {
          if (id === orphanAnalysisId) {
            return {
              analysisId: orphanAnalysisId,
              analysisName: 'orphan-analysis',
              // No teamId
            };
          }
          if (id === TEST_ANALYSIS_IDS.team1Analysis) {
            return {
              analysisId: TEST_ANALYSIS_IDS.team1Analysis,
              analysisName: 'team1-analysis',
              teamId: 'team-1',
            };
          }
          return null;
        },
      );

      const viewerCookie = await getSessionCookie('teamViewer');

      // Should default to 'uncategorized' team
      await request(app)
        .get(`/api/analyses/${orphanAnalysisId}/content`)
        .set('Cookie', viewerCookie)
        .expect(403); // viewer doesn't have access to uncategorized
    });

    it('should prevent tampering with cookie content', async () => {
      const session = await createTestSession('teamViewer');

      // Try to tamper with the cookie (won't work - session token is cryptographically signed)
      // Even if cookie text is modified, the signature won't match
      const tamperedCookie = session.cookie.replace('team_viewer', 'admin');

      // Should fail auth (401) or permissions (403) depending on how badly the cookie is broken
      const response = await request(app)
        .delete(`/api/analyses/${TEST_ANALYSIS_IDS.team1Analysis}`)
        .set('Cookie', tamperedCookie);

      expect([401, 403]).toContain(response.status);
    });

    it('should handle concurrent requests from different users', async () => {
      const adminCookie = await getSessionCookie('admin');
      const viewerCookie = await getSessionCookie('teamViewer');

      const testAnalysisId = 'aaaaaaaa-4444-4000-8000-000000000004';

      mockAnalysisService.getAnalysisById.mockImplementation(
        (id: string): AnalysisMetadata | null => {
          if (id === testAnalysisId) {
            return {
              analysisId: testAnalysisId,
              analysisName: 'test',
              teamId: 'team-1',
            };
          }
          if (id === TEST_ANALYSIS_IDS.team1Analysis) {
            return {
              analysisId: TEST_ANALYSIS_IDS.team1Analysis,
              analysisName: 'team1-analysis',
              teamId: 'team-1',
            };
          }
          return null;
        },
      );

      // Admin can delete
      const adminRequest = request(app)
        .delete(`/api/analyses/${testAnalysisId}`)
        .set('Cookie', adminCookie);

      // Viewer cannot delete
      const viewerRequest = request(app)
        .delete(`/api/analyses/${testAnalysisId}`)
        .set('Cookie', viewerCookie);

      const [adminResult, viewerResult] = await Promise.all([
        adminRequest,
        viewerRequest,
      ]);

      expect(adminResult.status).toBe(200);
      expect(viewerResult.status).toBe(403);
    });
  });

  describe('Rate Limiting (Real Middleware)', () => {
    it('should apply rate limits to authenticated users', async () => {
      // Using real rate limiters with test-friendly limits
      // fileOperationLimiter has max: 50 for tests (instead of 200 in production)
      // NOTE: This test runs LAST to avoid interfering with other tests
      const viewerCookie = await getSessionCookie('teamViewer');

      mockAnalysisService.getAllAnalyses.mockResolvedValue({});

      // Make 60 rapid requests (exceeds the test limit of 50)
      const requests = Array(60)
        .fill(null)
        .map(() =>
          request(app).get('/api/analyses').set('Cookie', viewerCookie),
        );

      const results = await Promise.all(requests);

      // Some requests should be rate limited (429)
      const rateLimited = results.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // At least some requests should succeed (200)
      const successful = results.filter((r) => r.status === 200);
      expect(successful.length).toBeGreaterThan(0);
    }, 20000); // 20 second timeout for rate limiting test with 60 requests
  });
});

/**
 * KEY DIFFERENCES FROM OLD VERSION:
 *
 * 1. NO AUTH MOCKS - Uses real better-auth middleware
 * 2. REAL RATE LIMITING - Uses actual rate limiter implementation with test-friendly limits via env vars
 * 3. MULTIPLE USER ROLES - Tests admin, owner, editor, viewer, runner, no-access
 * 4. NEGATIVE TESTS - Tests 401, 403 responses
 * 5. PERMISSION BOUNDARIES - Tests who can and can't do what
 * 6. CROSS-TEAM ISOLATION - Verifies users can't access other teams
 * 7. REAL SESSION MANAGEMENT - Uses actual DB sessions
 * 8. SECURITY EDGE CASES - Tests session tampering, etc.
 *
 * This test suite would FAIL if:
 * - Auth middleware was broken
 * - Permission checks were removed
 * - Session validation was bypassed
 * - Team isolation was compromised
 *
 * The old test suite would PASS in all these failure scenarios!
 */

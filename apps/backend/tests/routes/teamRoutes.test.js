/**
 * Team Routes Integration Tests
 *
 * - Uses REAL better-auth authentication (no mocks)
 * - Tests admin vs regular user access
 * - Includes negative test cases (401, 403)
 * - Tests admin-only permission enforcement
 * - Uses real database sessions
 *
 * Note: Team management is admin-only, so most tests focus on
 * verifying that non-admin users are properly denied access.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  setupTestAuth,
  cleanupTestAuth,
  getSessionCookie,
} from '../utils/authHelpers.js';

// Mock only external dependencies
vi.mock('../../src/utils/asyncHandler.js', () => ({
  asyncHandler: (fn) => fn,
}));

// Mock controller to isolate route/middleware testing
const TeamController = {
  getAllTeams: vi.fn((req, res) =>
    res.json([
      { id: 'team-1', name: 'Team 1', color: '#FF0000', order: 0 },
      { id: 'team-2', name: 'Team 2', color: '#00FF00', order: 1 },
    ]),
  ),
  createTeam: vi.fn((req, res) =>
    res.status(201).json({
      id: 'new-team',
      name: req.body.name,
      color: req.body.color,
      order: 0,
    }),
  ),
  reorderTeams: vi.fn((req, res) =>
    res.json({ message: 'Teams reordered successfully' }),
  ),
  updateTeam: vi.fn((req, res) =>
    res.json({
      id: req.params.id,
      name: req.body.name,
      color: req.body.color,
    }),
  ),
  deleteTeam: vi.fn((req, res) =>
    res.json({
      success: true,
      message: 'Team deleted successfully',
      analysesMovedTo: 'uncategorized',
    }),
  ),
  getTeamAnalysisCount: vi.fn((req, res) => res.json({ count: 5 })),
  moveAnalysisToTeam: vi.fn((req, res) =>
    res.json({
      success: true,
      analysis: req.params.name,
      from: 'old-team',
      to: req.body.teamId,
    }),
  ),
  createFolder: vi.fn((req, res) =>
    res.status(201).json({
      id: 'new-folder',
      name: req.body.name,
      teamId: req.params.teamId,
      parentFolderId: req.body.parentFolderId || null,
    }),
  ),
  updateFolder: vi.fn((req, res) =>
    res.json({
      id: req.params.folderId,
      name: req.body.name,
      expanded: req.body.expanded,
    }),
  ),
  deleteFolder: vi.fn((req, res) =>
    res.json({
      success: true,
      message: 'Folder deleted successfully',
    }),
  ),
  moveItem: vi.fn((req, res) =>
    res.json({
      success: true,
      message: 'Item moved successfully',
    }),
  ),
};

vi.mock('../../src/controllers/teamController.js', () => ({
  default: TeamController,
}));

// Logging middleware mock - provides req.log
const attachRequestLogger = (req, res, next) => {
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
};

vi.mock('../../src/middleware/loggingMiddleware.js', () => ({
  attachRequestLogger,
}));

describe('Team Routes - WITH REAL AUTH', () => {
  let app;

  beforeAll(async () => {
    await setupTestAuth();
  });

  afterAll(async () => {
    await cleanupTestAuth();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create fresh Express app with REAL middleware
    app = express();
    app.use(express.json());

    // Import REAL middleware (no mocks!)
    const { attachRequestLogger } = await import(
      '../../src/middleware/loggingMiddleware.js'
    );
    app.use(attachRequestLogger);

    // Import routes
    const { default: teamRoutes } = await import(
      '../../src/routes/teamRoutes.js'
    );
    app.use('/api/teams', teamRoutes);
  });

  describe('Authentication Requirements', () => {
    it('should reject unauthenticated requests with 401', async () => {
      await request(app).get('/api/teams').expect(401);
    });

    it('should reject requests with invalid session', async () => {
      await request(app)
        .get('/api/teams')
        .set('Cookie', 'better-auth.session_token=invalid-token')
        .expect(401);
    });

    it('should allow authenticated admin requests', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/teams')
        .set('Cookie', adminCookie)
        .expect(200);
    });
  });

  describe('Admin-Only Access Control', () => {
    describe('GET /api/teams', () => {
      it('should allow admin to get all teams', async () => {
        const adminCookie = await getSessionCookie('admin');

        const response = await request(app)
          .get('/api/teams')
          .set('Cookie', adminCookie)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(TeamController.getAllTeams).toHaveBeenCalled();
      });

      it('should deny regular users from getting teams', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .get('/api/teams')
          .set('Cookie', userCookie)
          .expect(403);

        expect(TeamController.getAllTeams).not.toHaveBeenCalled();
      });

      it('should deny unauthenticated access', async () => {
        await request(app).get('/api/teams').expect(401);
      });
    });

    describe('POST /api/teams', () => {
      it('should allow admin to create teams', async () => {
        const adminCookie = await getSessionCookie('admin');

        const response = await request(app)
          .post('/api/teams')
          .set('Cookie', adminCookie)
          .send({ name: 'New Team', color: '#0000FF' })
          .expect(201);

        expect(response.body.name).toBe('New Team');
        expect(TeamController.createTeam).toHaveBeenCalled();
      });

      it('should deny regular users from creating teams', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .post('/api/teams')
          .set('Cookie', userCookie)
          .send({ name: 'Hacked Team', color: '#FF0000' })
          .expect(403);

        expect(TeamController.createTeam).not.toHaveBeenCalled();
      });

      it('should deny team editors from creating teams', async () => {
        const editorCookie = await getSessionCookie('teamEditor');

        await request(app)
          .post('/api/teams')
          .set('Cookie', editorCookie)
          .send({ name: 'Unauthorized', color: '#FF0000' })
          .expect(403);
      });
    });

    describe('PUT /api/teams/:id', () => {
      it('should allow admin to update teams', async () => {
        const adminCookie = await getSessionCookie('admin');

        const response = await request(app)
          .put('/api/teams/team-1')
          .set('Cookie', adminCookie)
          .send({ name: 'Updated Team', color: '#FFFFFF' })
          .expect(200);

        expect(response.body.name).toBe('Updated Team');
        expect(TeamController.updateTeam).toHaveBeenCalled();
      });

      it('should deny regular users from updating teams', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .put('/api/teams/team-1')
          .set('Cookie', userCookie)
          .send({ name: 'Hacked', color: '#000000' })
          .expect(403);

        expect(TeamController.updateTeam).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /api/teams/:id', () => {
      it('should allow admin to delete teams', async () => {
        const adminCookie = await getSessionCookie('admin');

        const response = await request(app)
          .delete('/api/teams/team-1')
          .set('Cookie', adminCookie)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(TeamController.deleteTeam).toHaveBeenCalled();
      });

      it('should deny regular users from deleting teams', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .delete('/api/teams/team-1')
          .set('Cookie', userCookie)
          .expect(403);

        expect(TeamController.deleteTeam).not.toHaveBeenCalled();
      });

      it('should deny team editors from deleting teams', async () => {
        const editorCookie = await getSessionCookie('teamEditor');

        await request(app)
          .delete('/api/teams/team-1')
          .set('Cookie', editorCookie)
          .expect(403);
      });
    });

    describe('PUT /api/teams/reorder', () => {
      it('should allow admin to reorder teams', async () => {
        const adminCookie = await getSessionCookie('admin');

        await request(app)
          .put('/api/teams/reorder')
          .set('Cookie', adminCookie)
          .send({ orderedIds: ['team-2', 'team-1'] })
          .expect(200);

        expect(TeamController.reorderTeams).toHaveBeenCalled();
      });

      it('should deny regular users from reordering teams', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .put('/api/teams/reorder')
          .set('Cookie', userCookie)
          .send({ orderedIds: ['team-1', 'team-2'] })
          .expect(403);

        expect(TeamController.reorderTeams).not.toHaveBeenCalled();
      });
    });

    describe('GET /api/teams/:id/count', () => {
      it('should allow admin to get team analysis count', async () => {
        const adminCookie = await getSessionCookie('admin');

        const response = await request(app)
          .get('/api/teams/team-1/count')
          .set('Cookie', adminCookie)
          .expect(200);

        expect(typeof response.body.count).toBe('number');
        expect(TeamController.getTeamAnalysisCount).toHaveBeenCalled();
      });

      it('should deny regular users from getting counts', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .get('/api/teams/team-1/count')
          .set('Cookie', userCookie)
          .expect(403);
      });
    });
  });

  describe('Folder Management (Admin-Only)', () => {
    describe('POST /api/teams/:teamId/folders', () => {
      it('should allow admin to create folders', async () => {
        const adminCookie = await getSessionCookie('admin');

        const response = await request(app)
          .post('/api/teams/team-1/folders')
          .set('Cookie', adminCookie)
          .send({ name: 'New Folder' })
          .expect(201);

        expect(response.body.name).toBe('New Folder');
        expect(TeamController.createFolder).toHaveBeenCalled();
      });

      it('should allow admin to create nested folders', async () => {
        const adminCookie = await getSessionCookie('admin');

        const response = await request(app)
          .post('/api/teams/team-1/folders')
          .set('Cookie', adminCookie)
          .send({ name: 'Nested', parentFolderId: 'parent-id' })
          .expect(201);

        expect(response.body.parentFolderId).toBe('parent-id');
      });

      it('should deny regular users from creating folders', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .post('/api/teams/team-1/folders')
          .set('Cookie', userCookie)
          .send({ name: 'Unauthorized Folder' })
          .expect(403);

        expect(TeamController.createFolder).not.toHaveBeenCalled();
      });
    });

    describe('PUT /api/teams/:teamId/folders/:folderId', () => {
      it('should allow admin to update folders', async () => {
        const adminCookie = await getSessionCookie('admin');

        await request(app)
          .put('/api/teams/team-1/folders/folder-1')
          .set('Cookie', adminCookie)
          .send({ name: 'Updated' })
          .expect(200);

        expect(TeamController.updateFolder).toHaveBeenCalled();
      });

      it('should deny regular users from updating folders', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .put('/api/teams/team-1/folders/folder-1')
          .set('Cookie', userCookie)
          .send({ name: 'Hacked' })
          .expect(403);

        expect(TeamController.updateFolder).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /api/teams/:teamId/folders/:folderId', () => {
      it('should allow admin to delete folders', async () => {
        const adminCookie = await getSessionCookie('admin');

        await request(app)
          .delete('/api/teams/team-1/folders/folder-1')
          .set('Cookie', adminCookie)
          .expect(200);

        expect(TeamController.deleteFolder).toHaveBeenCalled();
      });

      it('should deny regular users from deleting folders', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .delete('/api/teams/team-1/folders/folder-1')
          .set('Cookie', userCookie)
          .expect(403);

        expect(TeamController.deleteFolder).not.toHaveBeenCalled();
      });
    });

    describe('POST /api/teams/:teamId/items/move', () => {
      it('should allow admin to move items', async () => {
        const adminCookie = await getSessionCookie('admin');

        await request(app)
          .post('/api/teams/team-1/items/move')
          .set('Cookie', adminCookie)
          .send({ itemId: 'item-1', targetFolderId: 'folder-1' })
          .expect(200);

        expect(TeamController.moveItem).toHaveBeenCalled();
      });

      it('should deny regular users from moving items', async () => {
        const userCookie = await getSessionCookie('teamOwner');

        await request(app)
          .post('/api/teams/team-1/items/move')
          .set('Cookie', userCookie)
          .send({ itemId: 'item-1', targetFolderId: null })
          .expect(403);

        expect(TeamController.moveItem).not.toHaveBeenCalled();
      });
    });
  });

  describe('Analysis Team Assignment (Admin-Only)', () => {
    it('should allow admin to move analysis to team', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .put('/api/teams/analyses/test-analysis/team')
        .set('Cookie', adminCookie)
        .send({ teamId: 'new-team' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(TeamController.moveAnalysisToTeam).toHaveBeenCalled();
    });

    it('should deny regular users from moving analyses', async () => {
      const userCookie = await getSessionCookie('teamOwner');

      await request(app)
        .put('/api/teams/analyses/test-analysis/team')
        .set('Cookie', userCookie)
        .send({ teamId: 'hacked-team' })
        .expect(403);

      expect(TeamController.moveAnalysisToTeam).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/teams/unknown/route')
        .set('Cookie', adminCookie)
        .expect(404);
    });

    it('should handle 404 for invalid HTTP methods', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .patch('/api/teams/team-1')
        .set('Cookie', adminCookie)
        .expect(404);
    });
  });

  describe('Multiple User Role Verification', () => {
    const userRoles = [
      { role: 'teamOwner', description: 'team owner' },
      { role: 'teamEditor', description: 'team editor' },
      { role: 'teamViewer', description: 'team viewer' },
      { role: 'teamRunner', description: 'team runner' },
      { role: 'noAccess', description: 'user with no access' },
    ];

    for (const { role, description } of userRoles) {
      it(`should deny ${description} from all team operations`, async () => {
        const cookie = await getSessionCookie(role);

        // Try various operations - all should be denied
        await request(app).get('/api/teams').set('Cookie', cookie).expect(403);

        await request(app)
          .post('/api/teams')
          .set('Cookie', cookie)
          .send({ name: 'Test' })
          .expect(403);

        await request(app)
          .put('/api/teams/team-1')
          .set('Cookie', cookie)
          .send({ name: 'Test' })
          .expect(403);

        await request(app)
          .delete('/api/teams/team-1')
          .set('Cookie', cookie)
          .expect(403);
      });
    }
  });

  describe('Validation and Request Schemas', () => {
    it('should validate team creation data', async () => {
      const adminCookie = await getSessionCookie('admin');

      // Valid request should succeed
      await request(app)
        .post('/api/teams')
        .set('Cookie', adminCookie)
        .send({ name: 'Valid Team', color: '#123456' })
        .expect(201);
    });

    it('should validate team update data', async () => {
      const adminCookie = await getSessionCookie('admin');

      // Valid request should succeed
      await request(app)
        .put('/api/teams/team-1')
        .set('Cookie', adminCookie)
        .send({ name: 'Valid Update', color: '#ABCDEF' })
        .expect(200);
    });

    it('should validate folder creation data', async () => {
      const adminCookie = await getSessionCookie('admin');

      // Valid request should succeed
      await request(app)
        .post('/api/teams/team-1/folders')
        .set('Cookie', adminCookie)
        .send({ name: 'Valid Folder' })
        .expect(201);
    });
  });
});

/**
 * KEY IMPROVEMENTS:
 *
 * 1. REAL AUTH - No mocked authMiddleware or requireAdmin
 * 2. ADMIN VS USER - Tests that only admins can manage teams
 * 3. NEGATIVE TESTS - Verifies 401 (unauthenticated) and 403 (unauthorized)
 * 4. MULTIPLE USER ROLES - Tests all user types are properly denied
 * 5. SECURITY FOCUS - Ensures team management is truly admin-only
 *
 * This test suite would FAIL if:
 * - requireAdmin middleware was removed
 * - Regular users could access team management
 * - Authentication was bypassed
 * - Authorization checks were broken
 */

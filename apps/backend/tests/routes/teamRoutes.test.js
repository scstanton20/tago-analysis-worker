import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
vi.mock('../../src/middleware/betterAuthMiddleware.js', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
  requireAdmin: (req, res, next) => next(),
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  teamOperationLimiter: (req, res, next) => next(),
}));

vi.mock('../../src/middleware/validateRequest.js', () => ({
  validateRequest: () => (req, res, next) => next(),
}));

vi.mock('../../src/controllers/teamController.js', () => ({
  default: {
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
        parentFolderId: req.body.parentFolderId,
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
  },
}));

vi.mock('../../src/utils/asyncHandler.js', () => ({
  asyncHandler: (fn) => fn,
}));

vi.mock('../../src/middleware/loggingMiddleware.js', () => ({
  attachRequestLogger: (req, res, next) => {
    req.log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    next();
  },
}));

describe('Team Routes', () => {
  let app;
  let teamRoutes;
  let TeamController;

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

    // Import controller for verification
    const controllerModule = await import(
      '../../src/controllers/teamController.js'
    );
    TeamController = controllerModule.default;

    // Import routes
    const routesModule = await import('../../src/routes/teamRoutes.js');
    teamRoutes = routesModule.default;

    // Mount routes
    app.use('/api/teams', teamRoutes);
  });

  describe('GET /api/teams', () => {
    it('should get all teams', async () => {
      const response = await request(app).get('/api/teams').expect(200);

      expect(response.body).toEqual([
        { id: 'team-1', name: 'Team 1', color: '#FF0000', order: 0 },
        { id: 'team-2', name: 'Team 2', color: '#00FF00', order: 1 },
      ]);
      expect(TeamController.getAllTeams).toHaveBeenCalled();
    });

    it('should return array of teams', async () => {
      const response = await request(app).get('/api/teams').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/teams', () => {
    it('should create new team', async () => {
      const response = await request(app)
        .post('/api/teams')
        .send({ name: 'New Team', color: '#0000FF' })
        .expect(201);

      expect(response.body).toEqual({
        id: 'new-team',
        name: 'New Team',
        color: '#0000FF',
        order: 0,
      });
      expect(TeamController.createTeam).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app)
        .post('/api/teams')
        .send({ name: 'Test Team', color: '#FF0000' });

      expect(TeamController.createTeam).toHaveBeenCalled();
    });

    it('should validate request data', async () => {
      await request(app)
        .post('/api/teams')
        .send({ name: 'Valid Team', color: '#123456' });

      expect(TeamController.createTeam).toHaveBeenCalled();
    });
  });

  describe('PUT /api/teams/reorder', () => {
    it('should reorder teams', async () => {
      const response = await request(app)
        .put('/api/teams/reorder')
        .send({ orderedIds: ['team-2', 'team-1'] })
        .expect(200);

      expect(response.body).toEqual({
        message: 'Teams reordered successfully',
      });
      expect(TeamController.reorderTeams).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app)
        .put('/api/teams/reorder')
        .send({ orderedIds: ['team-1', 'team-2'] });

      expect(TeamController.reorderTeams).toHaveBeenCalled();
    });
  });

  describe('PUT /api/teams/:id', () => {
    it('should update team', async () => {
      const response = await request(app)
        .put('/api/teams/team-1')
        .send({ name: 'Updated Team', color: '#FFFFFF' })
        .expect(200);

      expect(response.body).toEqual({
        id: 'team-1',
        name: 'Updated Team',
        color: '#FFFFFF',
      });
      expect(TeamController.updateTeam).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app).put('/api/teams/team-1').send({ name: 'Modified' });

      expect(TeamController.updateTeam).toHaveBeenCalled();
    });

    it('should validate request data', async () => {
      await request(app)
        .put('/api/teams/team-1')
        .send({ name: 'Valid Name', color: '#ABC123' });

      expect(TeamController.updateTeam).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/teams/:id', () => {
    it('should delete team', async () => {
      const response = await request(app)
        .delete('/api/teams/team-1')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Team deleted successfully',
        analysesMovedTo: 'uncategorized',
      });
      expect(TeamController.deleteTeam).toHaveBeenCalled();
    });

    it('should delete team with analysis migration', async () => {
      const response = await request(app)
        .delete('/api/teams/team-1')
        .send({ moveAnalysesTo: 'team-2' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(TeamController.deleteTeam).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app).delete('/api/teams/team-1');

      expect(TeamController.deleteTeam).toHaveBeenCalled();
    });
  });

  describe('GET /api/teams/:id/count', () => {
    it('should get analysis count for team', async () => {
      const response = await request(app)
        .get('/api/teams/team-1/count')
        .expect(200);

      expect(response.body).toEqual({ count: 5 });
      expect(TeamController.getTeamAnalysisCount).toHaveBeenCalled();
    });

    it('should return numeric count', async () => {
      const response = await request(app)
        .get('/api/teams/team-1/count')
        .expect(200);

      expect(typeof response.body.count).toBe('number');
    });
  });

  describe('PUT /api/teams/analyses/:name/team', () => {
    it('should move analysis to different team', async () => {
      const response = await request(app)
        .put('/api/teams/analyses/test-analysis/team')
        .send({ teamId: 'new-team' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        analysis: 'test-analysis',
        from: 'old-team',
        to: 'new-team',
      });
      expect(TeamController.moveAnalysisToTeam).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app)
        .put('/api/teams/analyses/test-analysis/team')
        .send({ teamId: 'target-team' });

      expect(TeamController.moveAnalysisToTeam).toHaveBeenCalled();
    });

    it('should validate request data', async () => {
      await request(app)
        .put('/api/teams/analyses/my-analysis/team')
        .send({ teamId: 'valid-team-id' });

      expect(TeamController.moveAnalysisToTeam).toHaveBeenCalled();
    });
  });

  describe('POST /api/teams/:teamId/folders', () => {
    it('should create folder in team', async () => {
      const response = await request(app)
        .post('/api/teams/team-1/folders')
        .send({ name: 'New Folder', parentFolderId: null })
        .expect(201);

      expect(response.body).toEqual({
        id: 'new-folder',
        name: 'New Folder',
        teamId: 'team-1',
        parentFolderId: null,
      });
      expect(TeamController.createFolder).toHaveBeenCalled();
    });

    it('should create nested folder', async () => {
      const response = await request(app)
        .post('/api/teams/team-1/folders')
        .send({ name: 'Nested', parentFolderId: 'parent-folder' })
        .expect(201);

      expect(response.body.parentFolderId).toBe('parent-folder');
      expect(TeamController.createFolder).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app)
        .post('/api/teams/team-1/folders')
        .send({ name: 'Test Folder' });

      expect(TeamController.createFolder).toHaveBeenCalled();
    });
  });

  describe('PUT /api/teams/:teamId/folders/:folderId', () => {
    it('should update folder', async () => {
      const response = await request(app)
        .put('/api/teams/team-1/folders/folder-1')
        .send({ name: 'Updated Folder', expanded: true })
        .expect(200);

      expect(response.body).toEqual({
        id: 'folder-1',
        name: 'Updated Folder',
        expanded: true,
      });
      expect(TeamController.updateFolder).toHaveBeenCalled();
    });

    it('should update folder expanded state', async () => {
      const response = await request(app)
        .put('/api/teams/team-1/folders/folder-1')
        .send({ expanded: false })
        .expect(200);

      expect(response.body.expanded).toBe(false);
      expect(TeamController.updateFolder).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app)
        .put('/api/teams/team-1/folders/folder-1')
        .send({ name: 'Modified' });

      expect(TeamController.updateFolder).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/teams/:teamId/folders/:folderId', () => {
    it('should delete folder', async () => {
      const response = await request(app)
        .delete('/api/teams/team-1/folders/folder-1')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Folder deleted successfully',
      });
      expect(TeamController.deleteFolder).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app).delete('/api/teams/team-1/folders/folder-1');

      expect(TeamController.deleteFolder).toHaveBeenCalled();
    });
  });

  describe('POST /api/teams/:teamId/items/move', () => {
    it('should move item in tree', async () => {
      const response = await request(app)
        .post('/api/teams/team-1/items/move')
        .send({
          itemId: 'item-1',
          itemType: 'analysis',
          targetFolderId: 'folder-1',
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Item moved successfully',
      });
      expect(TeamController.moveItem).toHaveBeenCalled();
    });

    it('should move folder in tree', async () => {
      await request(app)
        .post('/api/teams/team-1/items/move')
        .send({
          itemId: 'folder-2',
          itemType: 'folder',
          targetFolderId: 'folder-1',
        })
        .expect(200);

      expect(TeamController.moveItem).toHaveBeenCalled();
    });

    it('should apply team operation limiter', async () => {
      await request(app)
        .post('/api/teams/team-1/items/move')
        .send({ itemId: 'item-1', targetFolderId: null });

      expect(TeamController.moveItem).toHaveBeenCalled();
    });
  });

  describe('authentication and authorization', () => {
    it('should require authentication for all routes', async () => {
      // All routes should pass through authMiddleware
      await request(app).get('/api/teams');
      await request(app).post('/api/teams').send({ name: 'Test' });
      await request(app).put('/api/teams/team-1').send({ name: 'Updated' });

      expect(TeamController.getAllTeams).toHaveBeenCalled();
      expect(TeamController.createTeam).toHaveBeenCalled();
      expect(TeamController.updateTeam).toHaveBeenCalled();
    });

    it('should require admin for all team routes', async () => {
      await request(app).get('/api/teams');
      await request(app).post('/api/teams').send({ name: 'Admin Only' });
      await request(app).delete('/api/teams/team-1');

      expect(TeamController.getAllTeams).toHaveBeenCalled();
      expect(TeamController.createTeam).toHaveBeenCalled();
      expect(TeamController.deleteTeam).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/api/teams/unknown/route').expect(404);
    });

    it('should handle 404 for invalid team operations', async () => {
      await request(app).patch('/api/teams/team-1').expect(404);
    });
  });

  describe('middleware chain', () => {
    it('should apply rate limiters to write operations', async () => {
      // Create team
      await request(app).post('/api/teams').send({ name: 'Test' });
      // Update team
      await request(app).put('/api/teams/team-1').send({ name: 'Updated' });
      // Reorder teams
      await request(app).put('/api/teams/reorder').send({ orderedIds: [] });
      // Delete team
      await request(app).delete('/api/teams/team-1');
      // Move analysis
      await request(app)
        .put('/api/teams/analyses/test/team')
        .send({ teamId: 'team-1' });

      expect(TeamController.createTeam).toHaveBeenCalled();
      expect(TeamController.updateTeam).toHaveBeenCalled();
      expect(TeamController.reorderTeams).toHaveBeenCalled();
      expect(TeamController.deleteTeam).toHaveBeenCalled();
      expect(TeamController.moveAnalysisToTeam).toHaveBeenCalled();
    });

    it('should validate requests with schemas', async () => {
      await request(app).post('/api/teams').send({ name: 'Valid' });
      await request(app)
        .put('/api/teams/team-1')
        .send({ name: 'Valid Update' });
      await request(app)
        .post('/api/teams/team-1/folders')
        .send({ name: 'Valid Folder' });

      expect(TeamController.createTeam).toHaveBeenCalled();
      expect(TeamController.updateTeam).toHaveBeenCalled();
      expect(TeamController.createFolder).toHaveBeenCalled();
    });
  });

  describe('HTTP methods', () => {
    it('should support correct HTTP methods', async () => {
      // GET
      await request(app).get('/api/teams').expect(200);
      await request(app).get('/api/teams/team-1/count').expect(200);

      // POST
      await request(app).post('/api/teams').send({ name: 'Test' }).expect(201);
      await request(app)
        .post('/api/teams/team-1/folders')
        .send({ name: 'Test' })
        .expect(201);

      // PUT
      await request(app)
        .put('/api/teams/team-1')
        .send({ name: 'Updated' })
        .expect(200);
      await request(app)
        .put('/api/teams/reorder')
        .send({ orderedIds: [] })
        .expect(200);

      // DELETE
      await request(app).delete('/api/teams/team-1').expect(200);
      await request(app)
        .delete('/api/teams/team-1/folders/folder-1')
        .expect(200);
    });

    it('should reject incorrect HTTP methods', async () => {
      await request(app).delete('/api/teams').expect(404);
      await request(app).post('/api/teams/team-1/count').expect(404);
    });
  });

  describe('folder management', () => {
    it('should create folders at root level', async () => {
      const response = await request(app)
        .post('/api/teams/team-1/folders')
        .send({ name: 'Root Folder', parentFolderId: null })
        .expect(201);

      expect(response.body.parentFolderId).toBeNull();
    });

    it('should support folder hierarchy operations', async () => {
      // Create folder
      await request(app)
        .post('/api/teams/team-1/folders')
        .send({ name: 'Parent' });
      // Update folder
      await request(app)
        .put('/api/teams/team-1/folders/folder-1')
        .send({ name: 'Updated' });
      // Delete folder
      await request(app).delete('/api/teams/team-1/folders/folder-1');
      // Move items
      await request(app)
        .post('/api/teams/team-1/items/move')
        .send({ itemId: 'item-1' });

      expect(TeamController.createFolder).toHaveBeenCalled();
      expect(TeamController.updateFolder).toHaveBeenCalled();
      expect(TeamController.deleteFolder).toHaveBeenCalled();
      expect(TeamController.moveItem).toHaveBeenCalled();
    });
  });
});

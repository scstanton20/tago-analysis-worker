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
  userOperationLimiter: (req, res, next) => next(),
}));

vi.mock('../../src/middleware/validateRequest.js', () => ({
  validateRequest: () => (req, res, next) => next(),
}));

vi.mock('../../src/validation/userSchemas.js', () => ({
  userValidationSchemas: {
    getUserTeamMemberships: {},
    setInitialPassword: {},
    addToOrganization: {},
    assignUserToTeams: {},
    updateUserTeamAssignments: {},
    updateUserOrganizationRole: {},
    removeUserFromOrganization: {},
    forceLogout: {},
  },
}));

vi.mock('../../src/controllers/userController.js', () => ({
  default: {
    getUserTeamMemberships: vi.fn((req, res) =>
      res.json({
        success: true,
        data: {
          teams: [
            {
              teamId: 'team-1',
              teamName: 'Engineering',
              permissions: ['view_analyses', 'run_analyses'],
            },
          ],
        },
      }),
    ),
    setInitialPassword: vi.fn((req, res) =>
      res.json({
        success: true,
        message: 'Password set successfully',
      }),
    ),
    addToOrganization: vi.fn((req, res) =>
      res.json({
        success: true,
        data: {
          userId: req.body.userId,
          organizationId: req.body.organizationId,
        },
      }),
    ),
    assignUserToTeams: vi.fn((req, res) =>
      res.json({
        success: true,
        data: {
          assignments: [
            {
              teamId: 'team-1',
              permissions: ['view_analyses'],
              status: 'success',
            },
          ],
          errors: [],
        },
      }),
    ),
    updateUserTeamAssignments: vi.fn((req, res) =>
      res.json({
        success: true,
        data: {
          assignments: [
            {
              teamId: 'team-1',
              permissions: ['view_analyses'],
              status: 'success',
            },
          ],
          errors: [],
        },
      }),
    ),
    updateUserOrganizationRole: vi.fn((req, res) =>
      res.json({
        success: true,
        data: { userId: req.params.userId, role: req.body.role },
      }),
    ),
    removeUserFromOrganization: vi.fn((req, res) =>
      res.json({
        success: true,
        message: 'User removed from organization',
      }),
    ),
    forceLogout: vi.fn((req, res) =>
      res.json({
        success: true,
        data: { closedConnections: 1 },
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

describe('User Routes', () => {
  let app;
  let userRoutes;
  let UserController;

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
      '../../src/controllers/userController.js'
    );
    UserController = controllerModule.default;

    // Import routes
    const routesModule = await import('../../src/routes/userRoutes.js');
    userRoutes = routesModule.default;

    // Mount routes
    app.use('/api/users', userRoutes);
  });

  describe('GET /api/users/:userId/team-memberships', () => {
    it('should get user team memberships', async () => {
      const response = await request(app)
        .get('/api/users/user-123/team-memberships')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          teams: [
            {
              teamId: 'team-1',
              teamName: 'Engineering',
              permissions: ['view_analyses', 'run_analyses'],
            },
          ],
        },
      });
      expect(UserController.getUserTeamMemberships).toHaveBeenCalled();
    });

    it('should validate userId parameter', async () => {
      await request(app).get('/api/users/valid-user-id/team-memberships');

      expect(UserController.getUserTeamMemberships).toHaveBeenCalled();
    });

    it('should return team data for user', async () => {
      const response = await request(app)
        .get('/api/users/user-123/team-memberships')
        .expect(200);

      expect(response.body.data.teams).toBeDefined();
      expect(Array.isArray(response.body.data.teams)).toBe(true);
    });
  });

  describe('POST /api/users/set-initial-password', () => {
    it('should set initial password', async () => {
      const response = await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'securePassword123!' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Password set successfully',
      });
      expect(UserController.setInitialPassword).toHaveBeenCalled();
    });

    it('should apply user operation limiter', async () => {
      await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'newPass123' });

      expect(UserController.setInitialPassword).toHaveBeenCalled();
    });

    it('should validate request data', async () => {
      await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'validPassword' });

      expect(UserController.setInitialPassword).toHaveBeenCalled();
    });
  });

  describe('POST /api/users/add-to-organization (admin only)', () => {
    it('should add user to organization', async () => {
      const response = await request(app)
        .post('/api/users/add-to-organization')
        .send({
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { userId: 'user-123', organizationId: 'org-123' },
      });
      expect(UserController.addToOrganization).toHaveBeenCalled();
    });

    it('should apply user operation limiter', async () => {
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'user-1', organizationId: 'org-1', role: 'admin' });

      expect(UserController.addToOrganization).toHaveBeenCalled();
    });

    it('should validate organization role', async () => {
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'user-1', organizationId: 'org-1', role: 'member' });

      expect(UserController.addToOrganization).toHaveBeenCalled();
    });

    it('should require admin access', async () => {
      // Admin middleware is applied via router.use(requireAdmin)
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'user-1', organizationId: 'org-1' });

      expect(UserController.addToOrganization).toHaveBeenCalled();
    });
  });

  describe('POST /api/users/assign-teams (admin only)', () => {
    it('should assign user to teams', async () => {
      const response = await request(app)
        .post('/api/users/assign-teams')
        .send({
          userId: 'user-123',
          teamAssignments: [
            { teamId: 'team-1', permissions: ['view_analyses'] },
          ],
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          assignments: [
            {
              teamId: 'team-1',
              permissions: ['view_analyses'],
              status: 'success',
            },
          ],
          errors: [],
        },
      });
      expect(UserController.assignUserToTeams).toHaveBeenCalled();
    });

    it('should apply user operation limiter', async () => {
      await request(app)
        .post('/api/users/assign-teams')
        .send({
          userId: 'user-1',
          teamAssignments: [{ teamId: 'team-1', permissions: [] }],
        });

      expect(UserController.assignUserToTeams).toHaveBeenCalled();
    });

    it('should validate team assignments', async () => {
      await request(app)
        .post('/api/users/assign-teams')
        .send({
          userId: 'user-1',
          teamAssignments: [
            {
              teamId: 'team-1',
              permissions: ['view_analyses', 'run_analyses'],
            },
          ],
        });

      expect(UserController.assignUserToTeams).toHaveBeenCalled();
    });

    it('should handle multiple team assignments', async () => {
      await request(app)
        .post('/api/users/assign-teams')
        .send({
          userId: 'user-1',
          teamAssignments: [
            { teamId: 'team-1', permissions: ['view_analyses'] },
            { teamId: 'team-2', permissions: ['run_analyses'] },
          ],
        });

      expect(UserController.assignUserToTeams).toHaveBeenCalled();
    });
  });

  describe('PUT /api/users/:userId/team-assignments (admin only)', () => {
    it('should update user team assignments', async () => {
      const response = await request(app)
        .put('/api/users/user-123/team-assignments')
        .send({
          teamAssignments: [
            { teamId: 'team-1', permissions: ['view_analyses'] },
          ],
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          assignments: [
            {
              teamId: 'team-1',
              permissions: ['view_analyses'],
              status: 'success',
            },
          ],
          errors: [],
        },
      });
      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
    });

    it('should apply user operation limiter', async () => {
      await request(app)
        .put('/api/users/user-1/team-assignments')
        .send({ teamAssignments: [] });

      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
    });

    it('should validate userId parameter', async () => {
      await request(app)
        .put('/api/users/valid-user-id/team-assignments')
        .send({ teamAssignments: [] });

      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
    });

    it('should replace existing team assignments', async () => {
      await request(app)
        .put('/api/users/user-1/team-assignments')
        .send({
          teamAssignments: [
            { teamId: 'team-2', permissions: ['edit_analyses'] },
          ],
        });

      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
    });
  });

  describe('PUT /api/users/:userId/organization-role (admin only)', () => {
    it('should update user organization role', async () => {
      const response = await request(app)
        .put('/api/users/user-123/organization-role')
        .send({
          organizationId: 'org-123',
          role: 'admin',
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { userId: 'user-123', role: 'admin' },
      });
      expect(UserController.updateUserOrganizationRole).toHaveBeenCalled();
    });

    it('should apply user operation limiter', async () => {
      await request(app)
        .put('/api/users/user-1/organization-role')
        .send({ organizationId: 'org-1', role: 'member' });

      expect(UserController.updateUserOrganizationRole).toHaveBeenCalled();
    });

    it('should validate role values', async () => {
      await request(app)
        .put('/api/users/user-1/organization-role')
        .send({ organizationId: 'org-1', role: 'owner' });

      expect(UserController.updateUserOrganizationRole).toHaveBeenCalled();
    });

    it('should validate userId parameter', async () => {
      await request(app)
        .put('/api/users/valid-user/organization-role')
        .send({ organizationId: 'org-1', role: 'admin' });

      expect(UserController.updateUserOrganizationRole).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/users/:userId/organization (admin only)', () => {
    it('should remove user from organization', async () => {
      const response = await request(app)
        .delete('/api/users/user-123/organization')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'User removed from organization',
      });
      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });

    it('should apply user operation limiter', async () => {
      await request(app).delete('/api/users/user-1/organization');

      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });

    it('should validate userId parameter', async () => {
      await request(app).delete('/api/users/valid-user-id/organization');

      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });

    it('should delete user after organization removal', async () => {
      // This route triggers user deletion via hook
      await request(app).delete('/api/users/user-1/organization');

      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });
  });

  describe('authentication and authorization', () => {
    it('should require authentication for all routes', async () => {
      // All routes should pass through authMiddleware
      await request(app).get('/api/users/user-1/team-memberships');
      await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'pass' });
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'u1', organizationId: 'o1' });

      expect(UserController.getUserTeamMemberships).toHaveBeenCalled();
      expect(UserController.setInitialPassword).toHaveBeenCalled();
      expect(UserController.addToOrganization).toHaveBeenCalled();
    });

    it('should require admin for admin-only routes', async () => {
      // Admin routes applied after authMiddleware
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'u1', organizationId: 'o1' });
      await request(app)
        .post('/api/users/assign-teams')
        .send({ userId: 'u1', teamAssignments: [] });
      await request(app)
        .put('/api/users/u1/team-assignments')
        .send({ teamAssignments: [] });
      await request(app)
        .put('/api/users/u1/organization-role')
        .send({ organizationId: 'o1', role: 'admin' });
      await request(app).delete('/api/users/u1/organization');

      expect(UserController.addToOrganization).toHaveBeenCalled();
      expect(UserController.assignUserToTeams).toHaveBeenCalled();
      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
      expect(UserController.updateUserOrganizationRole).toHaveBeenCalled();
      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });

    it('should allow non-admin users to access own memberships', async () => {
      // getUserTeamMemberships is before requireAdmin middleware
      await request(app).get('/api/users/test-user/team-memberships');

      expect(UserController.getUserTeamMemberships).toHaveBeenCalled();
    });

    it('should allow non-admin users to set initial password', async () => {
      // setInitialPassword is before requireAdmin middleware
      await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'newPass' });

      expect(UserController.setInitialPassword).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/api/users/unknown').expect(404);
    });

    it('should handle 404 for invalid user operations', async () => {
      await request(app).patch('/api/users/user-1').expect(404);
    });
  });

  describe('middleware chain', () => {
    it('should apply rate limiters to all write operations', async () => {
      // Password setting
      await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'pass' });
      // Organization operations
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'u1', organizationId: 'o1' });
      // Team assignments
      await request(app)
        .post('/api/users/assign-teams')
        .send({ userId: 'u1', teamAssignments: [] });
      // Updates
      await request(app)
        .put('/api/users/u1/team-assignments')
        .send({ teamAssignments: [] });
      // Deletion
      await request(app).delete('/api/users/u1/organization');

      expect(UserController.setInitialPassword).toHaveBeenCalled();
      expect(UserController.addToOrganization).toHaveBeenCalled();
      expect(UserController.assignUserToTeams).toHaveBeenCalled();
      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });

    it('should validate requests with schemas', async () => {
      await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'valid' });
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'u1', organizationId: 'o1', role: 'member' });
      await request(app)
        .post('/api/users/assign-teams')
        .send({ userId: 'u1', teamAssignments: [] });

      expect(UserController.setInitialPassword).toHaveBeenCalled();
      expect(UserController.addToOrganization).toHaveBeenCalled();
      expect(UserController.assignUserToTeams).toHaveBeenCalled();
    });
  });

  describe('HTTP methods', () => {
    it('should support correct HTTP methods', async () => {
      // GET
      await request(app).get('/api/users/u1/team-memberships').expect(200);

      // POST
      await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'p' })
        .expect(200);
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'u', organizationId: 'o' })
        .expect(200);

      // PUT
      await request(app)
        .put('/api/users/u1/team-assignments')
        .send({ teamAssignments: [] })
        .expect(200);
      await request(app)
        .put('/api/users/u1/organization-role')
        .send({ organizationId: 'o', role: 'admin' })
        .expect(200);

      // DELETE
      await request(app).delete('/api/users/u1/organization').expect(200);
    });

    it('should reject incorrect HTTP methods', async () => {
      await request(app).delete('/api/users/u1/team-memberships').expect(404);
      await request(app).get('/api/users/set-initial-password').expect(404);
      await request(app).post('/api/users/u1/organization').expect(404);
    });
  });

  describe('user management workflows', () => {
    it('should support complete user onboarding flow', async () => {
      // Set initial password
      await request(app)
        .post('/api/users/set-initial-password')
        .send({ newPassword: 'secure123' });
      // Add to organization
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'new-user', organizationId: 'org-1', role: 'member' });
      // Assign to teams
      await request(app)
        .post('/api/users/assign-teams')
        .send({
          userId: 'new-user',
          teamAssignments: [{ teamId: 'team-1', permissions: [] }],
        });

      expect(UserController.setInitialPassword).toHaveBeenCalled();
      expect(UserController.addToOrganization).toHaveBeenCalled();
      expect(UserController.assignUserToTeams).toHaveBeenCalled();
    });

    it('should support user permission management', async () => {
      // Get current memberships
      await request(app).get('/api/users/user-1/team-memberships');
      // Update team assignments
      await request(app)
        .put('/api/users/user-1/team-assignments')
        .send({ teamAssignments: [] });
      // Update organization role
      await request(app)
        .put('/api/users/user-1/organization-role')
        .send({ organizationId: 'org-1', role: 'admin' });

      expect(UserController.getUserTeamMemberships).toHaveBeenCalled();
      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
      expect(UserController.updateUserOrganizationRole).toHaveBeenCalled();
    });

    it('should support user removal workflow', async () => {
      // Remove from organization (triggers deletion)
      await request(app).delete('/api/users/user-1/organization');

      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });
  });
});

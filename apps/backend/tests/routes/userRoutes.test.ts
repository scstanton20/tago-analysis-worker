/**
 * User Routes Integration Tests
 *
 * - Uses REAL better-auth authentication (no mocks)
 * - Tests multiple user roles and permissions
 * - Includes negative test cases (401, 403)
 * - Tests admin-only and self-service permissions
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
  createTestUser,
  type CreatedUser,
} from '../utils/authHelpers.ts';

type UserControllerType = {
  getUserTeamsForEdit: Mock;
  addToOrganization: Mock;
  assignUserToTeams: Mock;
  updateUserTeamAssignments: Mock;
  updateUserOrganizationRole: Mock;
  removeUserFromOrganization: Mock;
  forceLogout: Mock;
};

// Mock only external dependencies - NO AUTH MOCKS!
vi.mock('../../src/middleware/rateLimiter.ts', () => ({
  userOperationLimiter: (
    _req: Request,
    _res: Response,
    next: NextFunction,
  ): void => {
    next();
  },
}));

vi.mock('../../src/middleware/validateRequest.ts', () => ({
  validateRequest:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
}));

vi.mock('../../src/validation/userSchemas.ts', () => ({
  userValidationSchemas: {
    addToOrganization: {},
    assignUserToTeams: {},
    updateUserTeamAssignments: {},
    updateUserOrganizationRole: {},
    removeUserFromOrganization: {},
    forceLogout: {},
  },
}));

vi.mock('../../src/controllers/userController.ts', () => ({
  UserController: {
    getUserTeamsForEdit: vi.fn((req: Request, res: Response) => {
      // Handle non-existent user case
      if (req.params.userId === 'non-existent-user-id') {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({
        success: true,
        data: {
          teams: [
            {
              id: 'team-1',
              name: 'Team 1',
              permissions: ['view_analyses'],
            },
          ],
        },
      });
    }),
    addToOrganization: vi.fn((req: Request, res: Response) =>
      res.json({
        success: true,
        data: {
          userId: req.body.userId,
          organizationId: req.body.organizationId,
        },
      }),
    ),
    assignUserToTeams: vi.fn((_req: Request, res: Response) =>
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
    updateUserTeamAssignments: vi.fn((_req: Request, res: Response) =>
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
    updateUserOrganizationRole: vi.fn((req: Request, res: Response) =>
      res.json({
        success: true,
        data: { userId: req.params.userId, role: req.body.role },
      }),
    ),
    removeUserFromOrganization: vi.fn((_req: Request, res: Response) =>
      res.json({
        success: true,
        message: 'User removed from organization',
      }),
    ),
    forceLogout: vi.fn((_req: Request, res: Response) =>
      res.json({
        success: true,
        data: { closedConnections: 1 },
      }),
    ),
  },
}));

vi.mock('../../src/utils/asyncHandler.ts', () => ({
  asyncHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
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

describe('User Routes - WITH REAL AUTH', () => {
  let app: Express;
  let UserController: UserControllerType;
  let adminUser: CreatedUser;
  let teamOwnerUser: CreatedUser;
  let teamViewerUser: CreatedUser;

  beforeAll(async () => {
    // Setup test infrastructure (creates test org, teams, users)
    await setupTestAuth();

    // Create test users in the database
    adminUser = await createTestUser('admin');
    teamOwnerUser = await createTestUser('teamOwner');
    teamViewerUser = await createTestUser('teamViewer');
    // Prevent unused variable warnings - users needed for test setup
    void adminUser;
    void teamViewerUser;
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

    // Import controller for verification
    const controllerModule = await import(
      '../../src/controllers/userController.ts'
    );
    UserController =
      controllerModule.UserController as unknown as UserControllerType;

    // Import routes with REAL auth middleware
    const { userRouter } = await import('../../src/routes/userRoutes.ts');
    app.use('/api/users', userRouter);
  });

  describe('Authentication Requirements', () => {
    it('should reject unauthenticated requests to admin routes', async () => {
      await request(app)
        .post('/api/users/add-to-organization')
        .send({ userId: 'user-123', organizationId: 'org-123' })
        .expect(401);

      await request(app)
        .post('/api/users/assign-teams')
        .send({ userId: 'user-123', teamAssignments: [] })
        .expect(401);

      await request(app)
        .put('/api/users/user-123/team-assignments')
        .send({ teamAssignments: [] })
        .expect(401);

      await request(app)
        .put('/api/users/user-123/organization-role')
        .send({ organizationId: 'org-123', role: 'admin' })
        .expect(401);

      await request(app).delete('/api/users/user-123/organization').expect(401);

      await request(app)
        .post('/api/users/force-logout/user-123')
        .send({ reason: 'test' })
        .expect(401);

      expect(UserController.addToOrganization).not.toHaveBeenCalled();
      expect(UserController.assignUserToTeams).not.toHaveBeenCalled();
      expect(UserController.updateUserTeamAssignments).not.toHaveBeenCalled();
      expect(UserController.updateUserOrganizationRole).not.toHaveBeenCalled();
      expect(UserController.removeUserFromOrganization).not.toHaveBeenCalled();
      expect(UserController.forceLogout).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/users/:userId/teams/edit - Admin Only', () => {
    it('should allow admin to get user teams for editing', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get(`/api/users/${teamOwnerUser.id}/teams/edit`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.teams).toBeDefined();
      expect(Array.isArray(response.body.data.teams)).toBe(true);
    });

    it('should deny non-admin from getting user teams for editing', async () => {
      const userCookie = await getSessionCookie('teamOwner');

      await request(app)
        .get(`/api/users/${teamOwnerUser.id}/teams/edit`)
        .set('Cookie', userCookie)
        .expect(403);
    });

    it('should return 404 for non-existent user', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .get('/api/users/non-existent-user-id/teams/edit')
        .set('Cookie', adminCookie)
        .expect(404);

      expect(response.body.error).toContain('User not found');
    });
  });

  describe('POST /api/users/add-to-organization - Admin Only', () => {
    it('should allow admin to add user to organization', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .post('/api/users/add-to-organization')
        .set('Cookie', adminCookie)
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

    it('should deny team owner from adding user to organization', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .post('/api/users/add-to-organization')
        .set('Cookie', ownerCookie)
        .send({
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        })
        .expect(403);

      expect(UserController.addToOrganization).not.toHaveBeenCalled();
    });

    it('should deny team viewer from adding user to organization', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .post('/api/users/add-to-organization')
        .set('Cookie', viewerCookie)
        .send({
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        })
        .expect(403);

      expect(UserController.addToOrganization).not.toHaveBeenCalled();
    });

    it('should deny user with no team access from adding user to organization', async () => {
      const noAccessCookie = await getSessionCookie('noAccess');

      await request(app)
        .post('/api/users/add-to-organization')
        .set('Cookie', noAccessCookie)
        .send({
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        })
        .expect(403);

      expect(UserController.addToOrganization).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/users/assign-teams - Admin Only', () => {
    it('should allow admin to assign user to teams', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .post('/api/users/assign-teams')
        .set('Cookie', adminCookie)
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

    it('should deny team owner from assigning users to teams', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .post('/api/users/assign-teams')
        .set('Cookie', ownerCookie)
        .send({
          userId: 'user-123',
          teamAssignments: [{ teamId: 'team-1', permissions: [] }],
        })
        .expect(403);

      expect(UserController.assignUserToTeams).not.toHaveBeenCalled();
    });

    it('should deny team editor from assigning users to teams', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .post('/api/users/assign-teams')
        .set('Cookie', editorCookie)
        .send({
          userId: 'user-123',
          teamAssignments: [{ teamId: 'team-1', permissions: [] }],
        })
        .expect(403);

      expect(UserController.assignUserToTeams).not.toHaveBeenCalled();
    });

    it('should deny team viewer from assigning users to teams', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .post('/api/users/assign-teams')
        .set('Cookie', viewerCookie)
        .send({
          userId: 'user-123',
          teamAssignments: [{ teamId: 'team-1', permissions: [] }],
        })
        .expect(403);

      expect(UserController.assignUserToTeams).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/users/:userId/team-assignments - Admin Only', () => {
    it('should allow admin to update user team assignments', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .put('/api/users/user-123/team-assignments')
        .set('Cookie', adminCookie)
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

    it('should deny team owner from updating user team assignments', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .put('/api/users/user-1/team-assignments')
        .set('Cookie', ownerCookie)
        .send({ teamAssignments: [] })
        .expect(403);

      expect(UserController.updateUserTeamAssignments).not.toHaveBeenCalled();
    });

    it('should deny team viewer from updating user team assignments', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .put('/api/users/user-1/team-assignments')
        .set('Cookie', viewerCookie)
        .send({ teamAssignments: [] })
        .expect(403);

      expect(UserController.updateUserTeamAssignments).not.toHaveBeenCalled();
    });

    it('should deny regular users from updating their own team assignments', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      // Even trying to update their own assignments should be denied
      await request(app)
        .put(`/api/users/${teamOwnerUser.id}/team-assignments`)
        .set('Cookie', ownerCookie)
        .send({ teamAssignments: [] })
        .expect(403);

      expect(UserController.updateUserTeamAssignments).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/users/:userId/organization-role - Admin Only', () => {
    it('should allow admin to update user organization role', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .put('/api/users/user-123/organization-role')
        .set('Cookie', adminCookie)
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

    it('should deny team owner from updating user organization role', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .put('/api/users/user-1/organization-role')
        .set('Cookie', ownerCookie)
        .send({ organizationId: 'org-1', role: 'member' })
        .expect(403);

      expect(UserController.updateUserOrganizationRole).not.toHaveBeenCalled();
    });

    it('should deny team viewer from updating user organization role', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .put('/api/users/user-1/organization-role')
        .set('Cookie', viewerCookie)
        .send({ organizationId: 'org-1', role: 'member' })
        .expect(403);

      expect(UserController.updateUserOrganizationRole).not.toHaveBeenCalled();
    });

    it('should deny users from updating their own organization role', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .put(`/api/users/${teamOwnerUser.id}/organization-role`)
        .set('Cookie', ownerCookie)
        .send({ organizationId: 'org-1', role: 'admin' })
        .expect(403);

      expect(UserController.updateUserOrganizationRole).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/users/:userId/organization - Admin Only', () => {
    it('should allow admin to remove user from organization', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .delete('/api/users/user-123/organization')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'User removed from organization',
      });
      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });

    it('should deny team owner from removing users from organization', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .delete('/api/users/user-1/organization')
        .set('Cookie', ownerCookie)
        .expect(403);

      expect(UserController.removeUserFromOrganization).not.toHaveBeenCalled();
    });

    it('should deny team viewer from removing users from organization', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .delete('/api/users/user-1/organization')
        .set('Cookie', viewerCookie)
        .expect(403);

      expect(UserController.removeUserFromOrganization).not.toHaveBeenCalled();
    });

    it('should deny users from removing themselves from organization', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .delete(`/api/users/${teamOwnerUser.id}/organization`)
        .set('Cookie', ownerCookie)
        .expect(403);

      expect(UserController.removeUserFromOrganization).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/users/force-logout/:userId - Admin Only', () => {
    it('should allow admin to force logout a user', async () => {
      const adminCookie = await getSessionCookie('admin');

      const response = await request(app)
        .post('/api/users/force-logout/user-123')
        .set('Cookie', adminCookie)
        .send({ reason: 'Security concern' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { closedConnections: 1 },
      });
      expect(UserController.forceLogout).toHaveBeenCalled();
    });

    it('should deny team owner from forcing logout', async () => {
      const ownerCookie = await getSessionCookie('teamOwner');

      await request(app)
        .post('/api/users/force-logout/user-123')
        .set('Cookie', ownerCookie)
        .send({ reason: 'test' })
        .expect(403);

      expect(UserController.forceLogout).not.toHaveBeenCalled();
    });

    it('should deny team viewer from forcing logout', async () => {
      const viewerCookie = await getSessionCookie('teamViewer');

      await request(app)
        .post('/api/users/force-logout/user-123')
        .set('Cookie', viewerCookie)
        .send({ reason: 'test' })
        .expect(403);

      expect(UserController.forceLogout).not.toHaveBeenCalled();
    });
  });

  describe('Admin-Only Routes - Comprehensive Coverage', () => {
    it('should verify all admin-only routes reject team editor', async () => {
      const editorCookie = await getSessionCookie('teamEditor');

      await request(app)
        .post('/api/users/add-to-organization')
        .set('Cookie', editorCookie)
        .send({ userId: 'u1', organizationId: 'o1' })
        .expect(403);

      await request(app)
        .post('/api/users/assign-teams')
        .set('Cookie', editorCookie)
        .send({ userId: 'u1', teamAssignments: [] })
        .expect(403);

      await request(app)
        .put('/api/users/u1/team-assignments')
        .set('Cookie', editorCookie)
        .send({ teamAssignments: [] })
        .expect(403);

      await request(app)
        .put('/api/users/u1/organization-role')
        .set('Cookie', editorCookie)
        .send({ organizationId: 'o1', role: 'admin' })
        .expect(403);

      await request(app)
        .delete('/api/users/u1/organization')
        .set('Cookie', editorCookie)
        .expect(403);

      await request(app)
        .post('/api/users/force-logout/u1')
        .set('Cookie', editorCookie)
        .send({ reason: 'test' })
        .expect(403);

      // Verify NO admin-only controllers were called
      expect(UserController.addToOrganization).not.toHaveBeenCalled();
      expect(UserController.assignUserToTeams).not.toHaveBeenCalled();
      expect(UserController.updateUserTeamAssignments).not.toHaveBeenCalled();
      expect(UserController.updateUserOrganizationRole).not.toHaveBeenCalled();
      expect(UserController.removeUserFromOrganization).not.toHaveBeenCalled();
      expect(UserController.forceLogout).not.toHaveBeenCalled();
    });

    it('should verify all admin-only routes reject team runner', async () => {
      const runnerCookie = await getSessionCookie('teamRunner');

      await request(app)
        .post('/api/users/add-to-organization')
        .set('Cookie', runnerCookie)
        .send({ userId: 'u1', organizationId: 'o1' })
        .expect(403);

      await request(app)
        .post('/api/users/assign-teams')
        .set('Cookie', runnerCookie)
        .send({ userId: 'u1', teamAssignments: [] })
        .expect(403);

      await request(app)
        .put('/api/users/u1/team-assignments')
        .set('Cookie', runnerCookie)
        .send({ teamAssignments: [] })
        .expect(403);

      await request(app)
        .put('/api/users/u1/organization-role')
        .set('Cookie', runnerCookie)
        .send({ organizationId: 'o1', role: 'admin' })
        .expect(403);

      await request(app)
        .delete('/api/users/u1/organization')
        .set('Cookie', runnerCookie)
        .expect(403);

      await request(app)
        .post('/api/users/force-logout/u1')
        .set('Cookie', runnerCookie)
        .send({ reason: 'test' })
        .expect(403);

      expect(UserController.addToOrganization).not.toHaveBeenCalled();
      expect(UserController.assignUserToTeams).not.toHaveBeenCalled();
      expect(UserController.updateUserTeamAssignments).not.toHaveBeenCalled();
      expect(UserController.updateUserOrganizationRole).not.toHaveBeenCalled();
      expect(UserController.removeUserFromOrganization).not.toHaveBeenCalled();
      expect(UserController.forceLogout).not.toHaveBeenCalled();
    });

    it('should verify all admin-only routes accept admin', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .post('/api/users/add-to-organization')
        .set('Cookie', adminCookie)
        .send({ userId: 'u1', organizationId: 'o1' })
        .expect(200);

      await request(app)
        .post('/api/users/assign-teams')
        .set('Cookie', adminCookie)
        .send({ userId: 'u1', teamAssignments: [] })
        .expect(200);

      await request(app)
        .put('/api/users/u1/team-assignments')
        .set('Cookie', adminCookie)
        .send({ teamAssignments: [] })
        .expect(200);

      await request(app)
        .put('/api/users/u1/organization-role')
        .set('Cookie', adminCookie)
        .send({ organizationId: 'o1', role: 'admin' })
        .expect(200);

      await request(app)
        .delete('/api/users/u1/organization')
        .set('Cookie', adminCookie)
        .expect(200);

      await request(app)
        .post('/api/users/force-logout/u1')
        .set('Cookie', adminCookie)
        .send({ reason: 'test' })
        .expect(200);

      // Verify all admin-only controllers were called
      expect(UserController.addToOrganization).toHaveBeenCalled();
      expect(UserController.assignUserToTeams).toHaveBeenCalled();
      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
      expect(UserController.updateUserOrganizationRole).toHaveBeenCalled();
      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
      expect(UserController.forceLogout).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .get('/api/users/unknown')
        .set('Cookie', adminCookie)
        .expect(404);
    });

    it('should handle 404 for invalid HTTP methods', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .post('/api/users/u1/organization')
        .set('Cookie', adminCookie)
        .expect(404);
    });
  });

  describe('User Management Workflows', () => {
    it('should support admin complete user onboarding flow', async () => {
      const adminCookie = await getSessionCookie('admin');

      // Add to organization
      await request(app)
        .post('/api/users/add-to-organization')
        .set('Cookie', adminCookie)
        .send({ userId: 'new-user', organizationId: 'org-1', role: 'member' })
        .expect(200);

      // Assign to teams
      await request(app)
        .post('/api/users/assign-teams')
        .set('Cookie', adminCookie)
        .send({
          userId: 'new-user',
          teamAssignments: [{ teamId: 'team-1', permissions: [] }],
        })
        .expect(200);

      expect(UserController.addToOrganization).toHaveBeenCalled();
      expect(UserController.assignUserToTeams).toHaveBeenCalled();
    });

    it('should support admin user permission management', async () => {
      const adminCookie = await getSessionCookie('admin');

      // Get teams for editing (new admin-only endpoint)
      await request(app)
        .get('/api/users/user-1/teams/edit')
        .set('Cookie', adminCookie)
        .expect(200);

      // Update team assignments
      await request(app)
        .put('/api/users/user-1/team-assignments')
        .set('Cookie', adminCookie)
        .send({ teamAssignments: [] })
        .expect(200);

      // Update organization role
      await request(app)
        .put('/api/users/user-1/organization-role')
        .set('Cookie', adminCookie)
        .send({ organizationId: 'org-1', role: 'admin' })
        .expect(200);

      expect(UserController.updateUserTeamAssignments).toHaveBeenCalled();
      expect(UserController.updateUserOrganizationRole).toHaveBeenCalled();
    });

    it('should support admin user removal workflow', async () => {
      const adminCookie = await getSessionCookie('admin');

      await request(app)
        .delete('/api/users/user-1/organization')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(UserController.removeUserFromOrganization).toHaveBeenCalled();
    });
  });
});

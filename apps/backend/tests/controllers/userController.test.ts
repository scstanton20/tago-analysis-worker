import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { AssignmentResult } from '@tago-analysis-worker/types';
import {
  createControllerRequest,
  createControllerResponse,
  type MockResponse,
} from '../utils/testHelpers.ts';

// Mock dependencies before importing the controller
vi.mock('../../src/lib/auth.ts', () => ({
  auth: {
    api: {
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      removeUser: vi.fn(),
      banUser: vi.fn(),
      unbanUser: vi.fn(),
      getUser: vi.fn(),
    },
    $context: Promise.resolve({
      password: {
        hash: vi.fn(),
      },
      internalAdapter: {
        updatePassword: vi.fn(),
      },
    }),
  },
}));

vi.mock('../../src/utils/authDatabase.ts', () => ({
  executeQuery: vi.fn(),
  executeQueryAll: vi.fn(),
  executeUpdate: vi.fn(),
}));

vi.mock('../../src/utils/sse/index.ts', () => ({
  sseManager: {
    sendToUser: vi.fn(),
    refreshInitDataForUser: vi.fn(),
    broadcastToAdminUsers: vi.fn(),
    forceUserLogout: vi.fn(),
  },
}));

vi.mock('../../src/utils/responseHelpers.ts', () => ({
  handleError: vi.fn((res: MockResponse, error: Error) => {
    res.status(500).json({ error: error.message });
  }),
}));

// Type definitions for mocked services
type MockAuthApi = {
  addMember: Mock;
  updateMemberRole: Mock;
  removeMember: Mock;
  removeUser: Mock;
  banUser: Mock;
  unbanUser: Mock;
  getUser: Mock;
};

type MockAuth = {
  api: MockAuthApi;
  $context: Promise<{
    password: { hash: Mock };
    internalAdapter: { updatePassword: Mock };
  }>;
};

type MockSSEManager = {
  sendToUser: Mock;
  refreshInitDataForUser: Mock;
  broadcastToAdminUsers: Mock;
  forceUserLogout: Mock;
};

// Import after mocks
const { auth } = (await import('../../src/lib/auth.ts')) as unknown as {
  auth: MockAuth;
};
const { executeQuery, executeQueryAll, executeUpdate } = (await import(
  '../../src/utils/authDatabase.ts'
)) as unknown as {
  executeQuery: Mock;
  executeQueryAll: Mock;
  executeUpdate: Mock;
};
const { sseManager } = (await import(
  '../../src/utils/sse/index.ts'
)) as unknown as {
  sseManager: MockSSEManager;
};
const { UserController, getUserTeams } = await import(
  '../../src/controllers/userController.ts'
);

describe('UserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addToOrganization', () => {
    it('should add user to organization successfully', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        },
      });
      const res = createControllerResponse();

      const mockResult = {
        data: { id: 'member-123', userId: 'user-123', role: 'member' },
        error: null,
      };

      auth.api.addMember.mockResolvedValue(mockResult);

      await UserController.addToOrganization(req, res);

      expect(auth.api.addMember).toHaveBeenCalledWith({
        body: {
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult.data,
      });
    });

    it('should use default role when not specified', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          organizationId: 'org-123',
        },
      });
      const res = createControllerResponse();

      auth.api.addMember.mockResolvedValue({
        data: {},
        error: null,
      });

      await UserController.addToOrganization(req, res);

      expect(auth.api.addMember).toHaveBeenCalledWith({
        body: {
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        },
      });
    });
  });

  describe('assignUserToTeams', () => {
    it('should assign user to teams successfully', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          teamAssignments: [
            {
              teamId: 'team-1',
              permissions: ['analysis.view', 'analysis.run'],
            },
            { teamId: 'team-2', permissions: ['analysis.view'] },
          ],
        },
      });
      const res = createControllerResponse();

      executeQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM organization')) {
          return { id: 'org-123' };
        }
        if (query.includes('SELECT id FROM member')) {
          return { id: 'member-123' };
        }
        return null;
      });

      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.assignUserToTeams(req, res);

      expect(executeUpdate).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            assignments: expect.arrayContaining([
              expect.objectContaining({ teamId: 'team-1', status: 'success' }),
              expect.objectContaining({ teamId: 'team-2', status: 'success' }),
            ]),
          }),
        }),
      );
      expect(sseManager.sendToUser).toHaveBeenCalledWith('user-123', {
        type: 'userTeamsUpdated',
        data: expect.objectContaining({
          userId: 'user-123',
          showNotification: true,
        }),
      });
      expect(sseManager.refreshInitDataForUser).toHaveBeenCalledWith(
        'user-123',
      );
    });

    it('should skip assignment when no teams provided', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          teamAssignments: [],
        },
      });
      const res = createControllerResponse();

      await UserController.assignUserToTeams(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          assignments: [],
          message: 'No teams to assign',
        },
      });
      expect(executeUpdate).not.toHaveBeenCalled();
    });

    it('should update existing team memberships', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          teamAssignments: [
            { teamId: 'team-1', permissions: ['analysis.view'] },
          ],
        },
      });
      const res = createControllerResponse();

      executeQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM organization')) {
          return { id: 'org-123' };
        }
        if (query.includes('SELECT id FROM member')) {
          return { id: 'member-123' };
        }
        if (query.includes('SELECT * FROM teamMember')) {
          return { id: 'existing-member' };
        }
        return null;
      });

      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.assignUserToTeams(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            assignments: expect.arrayContaining([
              expect.objectContaining({
                teamId: 'team-1',
                permissions: ['analysis.view'],
                status: expect.stringMatching(
                  /^(success|updated_permissions)$/,
                ),
              }),
            ]),
            errors: null,
          }),
        }),
      );
    });

    it('should add user to organization if not member', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          teamAssignments: [{ teamId: 'team-1' }],
        },
      });
      const res = createControllerResponse();

      executeQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM organization')) {
          return { id: 'org-123' };
        }
        return null; // User is not a member
      });

      auth.api.addMember.mockResolvedValue({ data: {}, error: null });
      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.assignUserToTeams(req, res);

      expect(auth.api.addMember).toHaveBeenCalled();
    });

    it('should handle team assignment errors gracefully', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          teamAssignments: [
            { teamId: 'team-1' },
            { teamId: null }, // Invalid
          ],
        },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue({ id: 'org-123' });
      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.assignUserToTeams(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            errors: expect.arrayContaining([
              expect.stringContaining('teamId is required'),
            ]),
          }),
        }),
      );
    });

    it('should use default permissions when not specified', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          teamAssignments: [{ teamId: 'team-1' }],
        },
      });
      const res = createControllerResponse();

      executeQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM organization')) {
          return { id: 'org-123' };
        }
        if (query.includes('SELECT id FROM member')) {
          return { id: 'member-123' };
        }
        // User is not a team member yet (should insert)
        if (query.includes('SELECT * FROM teamMember')) {
          return null;
        }
        return null;
      });

      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.assignUserToTeams(req, res);

      expect(executeUpdate).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO teamMember'),
        expect.arrayContaining([
          expect.any(String),
          'user-123',
          'team-1',
          JSON.stringify(['analysis.view', 'analysis.run']),
          expect.any(String),
        ]),
        expect.any(String),
      );
    });
  });

  describe('updateUserTeamAssignments', () => {
    it('should update team assignments successfully', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          teamAssignments: [
            { teamId: 'team-1', permissions: ['analysis.view'] },
            { teamId: 'team-2', permissions: ['analysis.run'] },
          ],
        },
      });
      const res = createControllerResponse();

      executeQueryAll.mockReturnValue([
        { teamId: 'team-1' },
        { teamId: 'team-3' }, // Will be removed
      ]);

      executeQuery.mockReturnValue({ id: 'org-123' });
      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.updateUserTeamAssignments(req, res);

      expect(executeUpdate).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM teamMember'),
        expect.arrayContaining(['user-123', 'team-3']),
        expect.any(String),
      );
      expect(sseManager.sendToUser).toHaveBeenCalledWith('user-123', {
        type: 'userTeamsUpdated',
        data: expect.objectContaining({
          userId: 'user-123',
        }),
      });
    });

    it('should handle removing all team assignments', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          teamAssignments: [],
        },
      });
      const res = createControllerResponse();

      executeQueryAll.mockReturnValue([{ teamId: 'team-1' }]);
      executeQuery.mockReturnValue({ id: 'org-123' });
      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.updateUserTeamAssignments(req, res);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          type: 'userTeamsUpdated',
          data: expect.objectContaining({
            message: 'Your team access has been removed',
          }),
        }),
      );
    });
  });

  describe('updateUserOrganizationRole', () => {
    it('should update user role successfully', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'admin',
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      });

      // Mock getUser API to return user details
      auth.api.getUser.mockResolvedValue({
        data: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        },
        error: null,
      });

      await UserController.updateUserOrganizationRole(req, res);

      expect(auth.api.updateMemberRole).toHaveBeenCalledWith({
        headers: req.headers,
        body: {
          memberId: 'user-123',
          organizationId: 'org-123',
          role: 'admin',
        },
      });
      expect(sseManager.sendToUser).toHaveBeenCalledWith('user-123', {
        type: 'userRoleUpdated',
        data: expect.objectContaining({
          userId: 'user-123',
          role: 'admin',
          message: 'Your role has been updated to Administrator',
        }),
      });
      expect(sseManager.refreshInitDataForUser).toHaveBeenCalledWith(
        'user-123',
      );
    });

    it('should broadcast role update to all admin users', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'admin',
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      });

      // Mock getUser API to return user details (returns user object directly, not wrapped in .data)
      auth.api.getUser.mockResolvedValue({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
      });

      await UserController.updateUserOrganizationRole(req, res);

      // Verify the admin broadcast was called
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'adminUserRoleUpdated',
        data: {
          userId: 'user-123',
          role: 'admin',
          userName: 'Test User',
          message: "Test User's role has been updated to Administrator",
          action: 'refresh_user_list',
        },
      });
    });

    it('should use email as userName when name is not available', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'user',
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue({
        data: { role: 'user' },
        error: null,
      });

      // Mock getUser API with no name, only email (returns user object directly)
      auth.api.getUser.mockResolvedValue({
        id: 'user-123',
        name: null,
        email: 'test@example.com',
      });

      await UserController.updateUserOrganizationRole(req, res);

      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'adminUserRoleUpdated',
        data: expect.objectContaining({
          userName: 'test@example.com',
          message: "test@example.com's role has been updated to User",
        }),
      });
    });

    it('should skip team assignments when not provided', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'member',
          // teamAssignments not provided
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue({
        data: { role: 'member' },
        error: null,
      });

      auth.api.getUser.mockResolvedValue({
        data: {
          id: 'user-123',
          name: 'Test User',
        },
        error: null,
      });

      await UserController.updateUserOrganizationRole(req, res);

      // Should update role
      expect(auth.api.updateMemberRole).toHaveBeenCalled();

      // Should NOT attempt team operations when teamAssignments not provided
      expect(executeQueryAll).not.toHaveBeenCalled();
    });

    it('should use main organization when organizationId is null', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: null,
          role: 'member',
        },
      });
      const res = createControllerResponse();

      // Mock getting the main organization
      executeQuery.mockReturnValue({ id: 'main-org-123' });

      auth.api.updateMemberRole.mockResolvedValue({
        data: { role: 'member' },
        error: null,
      });

      auth.api.getUser.mockResolvedValue({
        data: {
          id: 'user-123',
          name: 'Test User',
        },
        error: null,
      });

      await UserController.updateUserOrganizationRole(req, res);

      // Should query for main organization
      expect(executeQuery).toHaveBeenCalledWith(
        'SELECT id FROM organization WHERE slug = ?',
        ['main'],
        expect.any(String),
      );

      // Should update role with main organization ID
      expect(auth.api.updateMemberRole).toHaveBeenCalledWith({
        headers: req.headers,
        body: {
          memberId: 'user-123',
          organizationId: 'main-org-123',
          role: 'member',
        },
      });
    });

    it('should return error when main organization not found', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: null,
          role: 'member',
        },
      });
      const res = createControllerResponse();

      // Mock main organization not found
      executeQuery.mockReturnValue(null);

      await UserController.updateUserOrganizationRole(req, res);

      expect(res.status).toHaveBeenCalledWith(404); // 404 is more appropriate for "not found"
      expect(res.json).toHaveBeenCalledWith({
        error: 'Main organization not found',
      });
    });
  });

  describe('removeUserFromOrganization', () => {
    it('should remove user from organization successfully', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { organizationId: 'org-123' },
      });
      const res = createControllerResponse();

      // Mock the database query to find the member record (synchronous function)
      executeQuery.mockReturnValue({ id: 'member-456' });

      auth.api.removeMember.mockResolvedValue({
        member: {},
        error: null,
      });

      await UserController.removeUserFromOrganization(req, res);

      // Verify that executeQuery was called to find the member
      expect(executeQuery).toHaveBeenCalledWith(
        'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
        ['user-123', 'org-123'],
        'finding member for user user-123 in org org-123',
      );

      // Verify that removeMember was called with the member.id
      expect(auth.api.removeMember).toHaveBeenCalledWith({
        headers: req.headers,
        body: {
          memberIdOrEmail: 'member-456',
          organizationId: 'org-123',
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'User removed from organization',
      });

      // Verify SSE broadcast to admin users
      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'userDeleted',
        data: {
          userId: 'user-123',
          message: 'user-123 has been remvoed from the Organization.',
          action: 'refresh_user_list',
        },
      });
    });

    it('should delete user account when no organizationId', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { organizationId: null },
      });
      const res = createControllerResponse();

      // Controller expects { success: true } from removeUser
      auth.api.removeUser.mockResolvedValue({
        success: true,
        error: null,
      });

      await UserController.removeUserFromOrganization(req, res);

      expect(auth.api.removeUser).toHaveBeenCalledWith({
        headers: req.headers,
        body: {
          userId: 'user-123',
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'User deleted successfully',
      });
    });

    it('should return 404 when member not found in database', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { organizationId: 'org-123' },
      });
      const res = createControllerResponse();

      // Mock the database query to return undefined (member not found) - synchronous function
      executeQuery.mockReturnValue(undefined);

      await UserController.removeUserFromOrganization(req, res);

      // Verify that executeQuery was called to find the member
      expect(executeQuery).toHaveBeenCalledWith(
        'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
        ['user-123', 'org-123'],
        'finding member for user user-123 in org org-123',
      );

      // Verify that removeMember was NOT called
      expect(auth.api.removeMember).not.toHaveBeenCalled();

      // Verify that a 404 error was returned
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Member not found' });
    });

    it('should return 400 error when removeMember fails', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { organizationId: 'org-123' },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue({ id: 'member-456' });

      auth.api.removeMember.mockResolvedValue({
        error: { status: 'BAD_REQUEST', message: 'Cannot remove last admin' },
      });

      await UserController.removeUserFromOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cannot remove last admin',
      });
    });

    it('should return 401 error when removeMember returns UNAUTHORIZED', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { organizationId: 'org-123' },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue({ id: 'member-456' });

      auth.api.removeMember.mockResolvedValue({
        error: { status: 'UNAUTHORIZED', message: 'Not authorized' },
      });

      await UserController.removeUserFromOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not authorized',
      });
    });

    it('should return 400 error when removeUser fails', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { organizationId: null },
      });
      const res = createControllerResponse();

      auth.api.removeUser.mockResolvedValue({
        error: { status: 'BAD_REQUEST', message: 'User deletion failed' },
      });

      await UserController.removeUserFromOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User deletion failed',
      });
    });

    it('should return 401 error when removeUser returns UNAUTHORIZED', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { organizationId: null },
      });
      const res = createControllerResponse();

      auth.api.removeUser.mockResolvedValue({
        error: { status: 'UNAUTHORIZED', message: 'Not authorized' },
      });

      await UserController.removeUserFromOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not authorized',
      });
    });

    it('should handle null result from removeMember', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { organizationId: 'org-123' },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue({ id: 'member-456' });
      auth.api.removeMember.mockResolvedValue(null);

      await UserController.removeUserFromOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to remove member',
      });
    });
  });

  describe('forceLogout', () => {
    it('should force logout user successfully', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { reason: 'Suspicious activity detected' },
      });
      const res = createControllerResponse();

      sseManager.forceUserLogout.mockResolvedValue(2);

      await UserController.forceLogout(req, res);

      expect(sseManager.forceUserLogout).toHaveBeenCalledWith(
        'user-123',
        'Suspicious activity detected',
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          closedConnections: 2,
        },
      });
    });

    it('should use default reason when not specified', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {},
      });
      const res = createControllerResponse();

      sseManager.forceUserLogout.mockResolvedValue(1);

      await UserController.forceLogout(req, res);

      expect(sseManager.forceUserLogout).toHaveBeenCalledWith(
        'user-123',
        'Your session has been terminated',
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          closedConnections: 1,
        },
      });
    });

    it('should handle zero closed connections', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: { reason: 'Account locked' },
      });
      const res = createControllerResponse();

      sseManager.forceUserLogout.mockResolvedValue(0);

      await UserController.forceLogout(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          closedConnections: 0,
        },
      });
    });
  });

  describe('getUserTeamsForEdit', () => {
    it('should get user teams for admin user', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue({ role: 'admin' });
      executeQueryAll.mockReturnValue([
        { id: 'team-1', name: 'Team 1' },
        { id: 'team-2', name: 'Team 2' },
      ]);

      await UserController.getUserTeamsForEdit(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          teams: expect.arrayContaining([
            expect.objectContaining({
              id: 'team-1',
              name: 'Team 1',
              permissions: expect.arrayContaining([
                'view_analyses',
                'run_analyses',
                'upload_analyses',
              ]),
            }),
            expect.objectContaining({
              id: 'team-2',
              name: 'Team 2',
            }),
          ]),
        },
      });
    });

    it('should get user teams for regular user', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue({ role: 'user' });
      executeQueryAll.mockReturnValue([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: JSON.stringify(['analysis.view', 'analysis.run']),
        },
      ]);

      await UserController.getUserTeamsForEdit(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          teams: expect.arrayContaining([
            expect.objectContaining({
              id: 'team-1',
              name: 'Team 1',
              permissions: ['analysis.view', 'analysis.run'],
            }),
          ]),
        },
      });
    });

    it('should return 404 when user not found', async () => {
      const req = createControllerRequest({
        params: { userId: 'nonexistent-user' },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue(undefined);

      await UserController.getUserTeamsForEdit(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User not found',
      });
    });

    it('should handle user with no role specified', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValueOnce({}); // User without role
      executeQueryAll.mockReturnValue([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: JSON.stringify(['analysis.view']),
        },
      ]);

      await UserController.getUserTeamsForEdit(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            teams: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('addToOrganization', () => {
    it('should return error when addMember fails', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        },
      });
      const res = createControllerResponse();

      auth.api.addMember.mockResolvedValue({
        error: { message: 'Member already exists' },
      });

      await UserController.addToOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Member already exists',
      });
    });

    it('should handle null result from addMember', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        },
      });
      const res = createControllerResponse();

      auth.api.addMember.mockResolvedValue(null);

      await UserController.addToOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to add member',
      });
    });

    it('should handle addMember error with no message', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'admin',
        },
      });
      const res = createControllerResponse();

      auth.api.addMember.mockResolvedValue({
        error: {},
      });

      await UserController.addToOrganization(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to add member',
      });
    });
  });

  describe('updateUserOrganizationRole', () => {
    it('should return 401 error when updateMemberRole returns UNAUTHORIZED', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'admin',
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue({
        error: { status: 'UNAUTHORIZED', message: 'Not authorized' },
      });

      await UserController.updateUserOrganizationRole(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not authorized',
      });
    });

    it('should handle null result from updateMemberRole', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'admin',
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue(null);

      await UserController.updateUserOrganizationRole(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to update role',
      });
    });

    it('should handle user not found in getUser response', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'admin',
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      });

      auth.api.getUser.mockResolvedValue(null);

      await UserController.updateUserOrganizationRole(req, res);

      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'adminUserRoleUpdated',
        data: {
          userId: 'user-123',
          role: 'admin',
          userName: 'User',
          message: "User's role has been updated to Administrator",
          action: 'refresh_user_list',
        },
      });
    });

    it('should use fallback User when name and email are undefined', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'user',
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue({
        data: { role: 'user' },
        error: null,
      });

      auth.api.getUser.mockResolvedValue({
        id: 'user-123',
        name: undefined,
        email: undefined,
      });

      await UserController.updateUserOrganizationRole(req, res);

      expect(sseManager.broadcastToAdminUsers).toHaveBeenCalledWith({
        type: 'adminUserRoleUpdated',
        data: expect.objectContaining({
          userName: 'User',
        }),
      });
    });

    it('should send role updated message to user', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: 'org-123',
          role: 'admin',
        },
      });
      const res = createControllerResponse();

      auth.api.updateMemberRole.mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      });

      auth.api.getUser.mockResolvedValue({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
      });

      await UserController.updateUserOrganizationRole(req, res);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          type: 'userRoleUpdated',
          data: expect.objectContaining({
            userId: 'user-123',
            role: 'admin',
            message: 'Your role has been updated to Administrator',
            showNotification: true,
          }),
        }),
      );
    });
  });

  describe('assignUserToTeams', () => {
    it('should return error when all team assignments fail', async () => {
      const req = createControllerRequest({
        body: {
          userId: 'user-123',
          teamAssignments: [{ teamId: null }, { teamId: '' }],
        },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue({ id: 'org-123' });

      await UserController.assignUserToTeams(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to assign user to any teams',
        details: expect.arrayContaining([
          expect.stringContaining('teamId is required'),
          expect.stringContaining('teamId is required'),
        ]),
      });
    });
  });

  describe('updateUserOrganizationRole', () => {
    it('should handle error when main organization not found on null organizationId', async () => {
      const req = createControllerRequest({
        params: { userId: 'user-123' },
        body: {
          organizationId: undefined,
          role: 'member',
        },
      });
      const res = createControllerResponse();

      executeQuery.mockReturnValue(null);

      await UserController.updateUserOrganizationRole(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Main organization not found',
      });
    });
  });

  describe('getUserTeams function', () => {
    it('should return all teams with full permissions for admin user', () => {
      executeQueryAll.mockReturnValue([
        { id: 'team-1', name: 'Team 1' },
        { id: 'team-2', name: 'Team 2' },
      ]);

      const teams = getUserTeams('admin-user-123', 'admin');

      expect(teams).toEqual([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: [
            'view_analyses',
            'run_analyses',
            'upload_analyses',
            'download_analyses',
            'edit_analyses',
            'delete_analyses',
          ],
        },
        {
          id: 'team-2',
          name: 'Team 2',
          permissions: [
            'view_analyses',
            'run_analyses',
            'upload_analyses',
            'download_analyses',
            'edit_analyses',
            'delete_analyses',
          ],
        },
      ]);
    });

    it('should return user specific teams for regular user', () => {
      executeQueryAll.mockReturnValue([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: JSON.stringify(['analysis.view', 'analysis.run']),
        },
        {
          id: 'team-2',
          name: 'Team 2',
          permissions: JSON.stringify(['analysis.view']),
        },
      ]);

      const teams = getUserTeams('user-123', 'user');

      expect(teams).toEqual([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: ['analysis.view', 'analysis.run'],
        },
        {
          id: 'team-2',
          name: 'Team 2',
          permissions: ['analysis.view'],
        },
      ]);
    });

    it('should handle empty permissions string for regular user', () => {
      executeQueryAll.mockReturnValue([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: '',
        },
      ]);

      const teams = getUserTeams('user-123', 'user');

      expect(teams).toEqual([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: [],
        },
      ]);
    });

    it('should handle null permissions for regular user', () => {
      executeQueryAll.mockReturnValue([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: null,
        },
      ]);

      const teams = getUserTeams('user-123', 'user');

      expect(teams).toEqual([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: [],
        },
      ]);
    });

    it('should handle invalid JSON permissions gracefully', () => {
      executeQueryAll.mockReturnValue([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: 'invalid-json-permissions',
        },
      ]);

      const teams = getUserTeams('user-123', 'user');

      expect(teams).toEqual([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: [],
        },
      ]);
    });

    it('should handle no user teams for regular user', () => {
      executeQueryAll.mockReturnValue([]);

      const teams = getUserTeams('user-123', 'user');

      expect(teams).toEqual([]);
    });

    it('should query all teams for admin user', () => {
      executeQueryAll.mockReturnValue([{ id: 'team-1', name: 'Team 1' }]);

      getUserTeams('admin-user-123', 'admin');

      expect(executeQueryAll).toHaveBeenCalledWith(
        'SELECT id, name FROM team ORDER BY name',
        [],
        expect.stringContaining('getting all teams for admin user'),
      );
    });

    it('should query user memberships for regular user', () => {
      executeQueryAll.mockReturnValue([]);

      getUserTeams('user-123', 'user');

      expect(executeQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT t.id, t.name, m.permissions'),
        ['user-123'],
        expect.stringContaining('getting team memberships for user'),
      );
    });

    it('should handle role as anything other than admin', () => {
      executeQueryAll.mockReturnValue([
        {
          id: 'team-1',
          name: 'Team 1',
          permissions: JSON.stringify(['analysis.view']),
        },
      ]);

      const teams = getUserTeams('user-456', 'member');

      expect(teams).toHaveLength(1);
      expect(teams[0].permissions).toEqual(['analysis.view']);
    });
  });

  describe('processTeamAssignments', () => {
    it('should process team assignments with currentTeamIds provided', async () => {
      const assignments: {
        teamId: string;
        permissions: ('view_analyses' | 'run_analyses')[];
      }[] = [
        { teamId: 'team-1', permissions: ['view_analyses'] },
        { teamId: 'team-2', permissions: ['run_analyses'] },
      ];

      executeUpdate.mockReturnValue({ changes: 1 });
      const req = createControllerRequest();

      const { results, errors } = await UserController.processTeamAssignments(
        'user-123',
        assignments,
        req.log,
        ['team-1'], // User is already member of team-1
      );

      expect(results).toHaveLength(2);
      expect(errors).toHaveLength(0);
      expect(results[0].status).toBe('updated_permissions');
      expect(results[1].status).toBe('success');
    });

    it('should skip assignments with missing teamId', async () => {
      // Testing edge case with null teamId - need to bypass type checking
      const assignments = [
        { teamId: 'team-1', permissions: ['view_analyses'] },
        { teamId: null, permissions: [] },
      ] as unknown as {
        teamId: string;
        permissions: ('view_analyses' | 'run_analyses')[];
      }[];

      const req = createControllerRequest();

      const { errors } = await UserController.processTeamAssignments(
        'user-123',
        assignments,
        req.log,
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('teamId is required');
    });

    it('should handle empty team assignments array', async () => {
      const req = createControllerRequest();

      const { results, errors } = await UserController.processTeamAssignments(
        'user-123',
        [],
        req.log,
      );

      expect(results).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });
  });

  describe('calculateTeamChanges', () => {
    it('should identify teams to remove', () => {
      executeQueryAll.mockReturnValue([
        { teamId: 'team-1' },
        { teamId: 'team-2' },
        { teamId: 'team-3' },
      ]);

      const assignments = [
        { teamId: 'team-1', permissions: [] },
        { teamId: 'team-2', permissions: [] },
      ];

      const { currentTeamIds, teamsToRemove } =
        UserController.calculateTeamChanges('user-123', assignments);

      expect(currentTeamIds).toEqual(['team-1', 'team-2', 'team-3']);
      expect(teamsToRemove).toEqual(['team-3']);
    });

    it('should return empty teamsToRemove when no teams are removed', () => {
      executeQueryAll.mockReturnValue([{ teamId: 'team-1' }]);

      const assignments = [
        { teamId: 'team-1', permissions: [] },
        { teamId: 'team-2', permissions: [] },
      ];

      const { currentTeamIds, teamsToRemove } =
        UserController.calculateTeamChanges('user-123', assignments);

      expect(currentTeamIds).toEqual(['team-1']);
      expect(teamsToRemove).toEqual([]);
    });

    it('should return all teams as toRemove when assignments is empty', () => {
      executeQueryAll.mockReturnValue([
        { teamId: 'team-1' },
        { teamId: 'team-2' },
      ]);

      const { teamsToRemove } = UserController.calculateTeamChanges(
        'user-123',
        [],
      );

      expect(teamsToRemove).toEqual(['team-1', 'team-2']);
    });
  });

  describe('sendTeamUpdateNotifications', () => {
    it('should send message for multiple team assignments', async () => {
      await UserController.sendTeamUpdateNotifications('user-123', 3);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          type: 'userTeamsUpdated',
          data: expect.objectContaining({
            message: 'You have been assigned to 3 teams',
          }),
        }),
      );
    });

    it('should send message for single team assignment', async () => {
      await UserController.sendTeamUpdateNotifications('user-123', 1);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          type: 'userTeamsUpdated',
          data: expect.objectContaining({
            message: 'You have been assigned to 1 team',
          }),
        }),
      );
    });

    it('should send removal message for zero teams', async () => {
      await UserController.sendTeamUpdateNotifications('user-123', 0);

      expect(sseManager.sendToUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          type: 'userTeamsUpdated',
          data: expect.objectContaining({
            message: 'Your team access has been removed',
          }),
        }),
      );
    });

    it('should refresh init data for user', async () => {
      await UserController.sendTeamUpdateNotifications('user-123', 2);

      expect(sseManager.refreshInitDataForUser).toHaveBeenCalledWith(
        'user-123',
      );
    });
  });

  describe('removeUserFromTeams', () => {
    it('should remove user from multiple teams', async () => {
      const req = createControllerRequest();

      await UserController.removeUserFromTeams(
        'user-123',
        ['team-1', 'team-2', 'team-3'],
        req.log,
      );

      expect(executeUpdate).toHaveBeenCalledTimes(3);
      expect(executeUpdate).toHaveBeenCalledWith(
        'DELETE FROM teamMember WHERE userId = ? AND teamId = ?',
        ['user-123', 'team-1'],
        expect.any(String),
      );
      expect(executeUpdate).toHaveBeenCalledWith(
        'DELETE FROM teamMember WHERE userId = ? AND teamId = ?',
        ['user-123', 'team-2'],
        expect.any(String),
      );
      expect(executeUpdate).toHaveBeenCalledWith(
        'DELETE FROM teamMember WHERE userId = ? AND teamId = ?',
        ['user-123', 'team-3'],
        expect.any(String),
      );
    });

    it('should handle empty teams list', async () => {
      const req = createControllerRequest();

      await UserController.removeUserFromTeams('user-123', [], req.log);

      expect(executeUpdate).not.toHaveBeenCalled();
    });
  });

  describe('addOrUpdateTeamMembership', () => {
    it('should update permissions when user is already member', async () => {
      const results: AssignmentResult[] = [];
      const req = createControllerRequest();

      executeQuery.mockReturnValue({ id: 'existing-member' });
      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.addOrUpdateTeamMembership(
        'user-123',
        'team-1',
        ['analysis.view', 'analysis.run'],
        req.log,
        results,
      );

      expect(executeUpdate).toHaveBeenCalledWith(
        'UPDATE teamMember SET permissions = ? WHERE userId = ? AND teamId = ?',
        [
          JSON.stringify(['analysis.view', 'analysis.run']),
          'user-123',
          'team-1',
        ],
        expect.any(String),
      );
      expect(results[0].status).toBe('updated_permissions');
    });

    it('should insert new membership when user is not member', async () => {
      const results: AssignmentResult[] = [];
      const req = createControllerRequest();

      executeQuery.mockReturnValue(null);
      executeUpdate.mockReturnValue({ changes: 1 });

      await UserController.addOrUpdateTeamMembership(
        'user-123',
        'team-1',
        ['analysis.edit'],
        req.log,
        results,
      );

      expect(executeUpdate).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO teamMember'),
        expect.arrayContaining([
          expect.any(String),
          'user-123',
          'team-1',
          JSON.stringify(['analysis.edit']),
          expect.any(String),
        ]),
        expect.any(String),
      );
      expect(results[0].status).toBe('success');
    });

    it('should use default update permissions when none provided', async () => {
      const results: AssignmentResult[] = [];
      const req = createControllerRequest();

      executeQuery.mockReturnValue({ id: 'existing-member' });

      await UserController.addOrUpdateTeamMembership(
        'user-123',
        'team-1',
        [],
        req.log,
        results,
      );

      expect(executeUpdate).toHaveBeenCalledWith(
        'UPDATE teamMember SET permissions = ? WHERE userId = ? AND teamId = ?',
        [JSON.stringify(['analysis.view']), 'user-123', 'team-1'],
        expect.any(String),
      );
    });

    it('should use default insert permissions when none provided', async () => {
      const results: AssignmentResult[] = [];
      const req = createControllerRequest();

      executeQuery.mockReturnValue(null);

      await UserController.addOrUpdateTeamMembership(
        'user-123',
        'team-1',
        [],
        req.log,
        results,
      );

      expect(executeUpdate).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO teamMember'),
        expect.arrayContaining([
          expect.any(String),
          'user-123',
          'team-1',
          JSON.stringify(['analysis.view', 'analysis.run']),
          expect.any(String),
        ]),
        expect.any(String),
      );
    });

    it('should use alreadyMember parameter when provided', async () => {
      const results: AssignmentResult[] = [];
      const req = createControllerRequest();

      executeUpdate.mockReturnValue({ changes: 1 });

      // Pass alreadyMember as true - should UPDATE
      await UserController.addOrUpdateTeamMembership(
        'user-123',
        'team-1',
        ['analysis.view'],
        req.log,
        results,
        true,
      );

      expect(executeUpdate).toHaveBeenCalledWith(
        'UPDATE teamMember SET permissions = ? WHERE userId = ? AND teamId = ?',
        expect.any(Array),
        expect.any(String),
      );

      // Reset and pass alreadyMember as false - should INSERT
      vi.clearAllMocks();
      const results2: AssignmentResult[] = [];

      await UserController.addOrUpdateTeamMembership(
        'user-123',
        'team-1',
        ['analysis.view'],
        req.log,
        results2,
        false,
      );

      expect(executeUpdate).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO teamMember'),
        expect.any(Array),
        expect.any(String),
      );
    });
  });

  describe('ensureUserIsOrgMember', () => {
    it('should not add user if already organization member', async () => {
      const req = createControllerRequest();

      executeQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM organization')) {
          return { id: 'org-123' };
        }
        if (query.includes('SELECT id FROM member')) {
          return { id: 'member-456' }; // Already a member
        }
        return null;
      });

      await UserController.ensureUserIsOrgMember('user-123', req.log);

      expect(auth.api.addMember).not.toHaveBeenCalled();
    });

    it('should add user to organization if not member', async () => {
      const req = createControllerRequest();

      executeQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM organization')) {
          return { id: 'org-123' };
        }
        return null; // Not a member
      });

      auth.api.addMember.mockResolvedValue({ data: {}, error: null });

      await UserController.ensureUserIsOrgMember('user-123', req.log);

      expect(auth.api.addMember).toHaveBeenCalledWith({
        body: {
          userId: 'user-123',
          organizationId: 'org-123',
          role: 'member',
        },
      });
    });

    it('should throw error when main organization not found', async () => {
      const req = createControllerRequest();

      executeQuery.mockReturnValue(null); // Organization not found

      await expect(
        UserController.ensureUserIsOrgMember('user-123', req.log),
      ).rejects.toThrow('Main organization not found');
    });

    it('should throw error when addMember fails', async () => {
      const req = createControllerRequest();

      executeQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM organization')) {
          return { id: 'org-123' };
        }
        return null;
      });

      auth.api.addMember.mockResolvedValue({
        error: { message: 'Failed to add member' },
      });

      await expect(
        UserController.ensureUserIsOrgMember('user-123', req.log),
      ).rejects.toThrow('Failed to add user to organization');
    });

    it('should throw error when addMember returns null', async () => {
      const req = createControllerRequest();

      executeQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM organization')) {
          return { id: 'org-123' };
        }
        return null;
      });

      auth.api.addMember.mockResolvedValue(null);

      await expect(
        UserController.ensureUserIsOrgMember('user-123', req.log),
      ).rejects.toThrow('Failed to add user to organization: Unknown error');
    });
  });
});

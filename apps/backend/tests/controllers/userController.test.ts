import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
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
  },
}));

vi.mock('../../src/utils/responseHelpers.ts', () => ({
  handleError: vi.fn((res: MockResponse, error: Error) => {
    res.status(500).json({ error: error.message });
  }),
}));

// Type definitions for mocked services
interface MockAuthApi {
  addMember: Mock;
  updateMemberRole: Mock;
  removeMember: Mock;
  removeUser: Mock;
  banUser: Mock;
  unbanUser: Mock;
  getUser: Mock;
}

interface MockAuth {
  api: MockAuthApi;
  $context: Promise<{
    password: { hash: Mock };
    internalAdapter: { updatePassword: Mock };
  }>;
}

interface MockSSEManager {
  sendToUser: Mock;
  refreshInitDataForUser: Mock;
  broadcastToAdminUsers: Mock;
}

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
const { UserController } = await import(
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
  });
});

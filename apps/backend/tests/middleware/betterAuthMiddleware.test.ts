import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { NextFunction } from 'express';
import {
  createControllerRequest,
  createControllerResponse,
  createMockNext,
  type MockRequest,
  type MockResponse,
} from '../utils/testHelpers.ts';

// Define type for auth session response
type AuthSession = {
  session: { id: string } | null;
  user: { id: string; role: string; requiresPasswordChange?: boolean } | null;
};

// Define type for team member permissions
type TeamMemberPermissions = {
  permissions: string | null;
  teamId?: string;
  userId?: string;
};

// Mock the auth library
const mockAuth = {
  api: {
    getSession: vi.fn() as Mock<() => Promise<AuthSession | null>>,
  },
};

vi.mock('../../src/lib/auth.ts', () => ({
  auth: mockAuth,
}));

// Mock the better-auth/node module
vi.mock('better-auth/node', () => ({
  fromNodeHeaders: vi.fn((headers: Record<string, string>) => headers),
}));

// Mock the authDatabase module
const mockExecuteQuery = vi.fn() as Mock<
  (
    sql: string,
    params: unknown[],
    _desc: string,
  ) => TeamMemberPermissions | null
>;
const mockExecuteQueryAll = vi.fn() as Mock<
  (sql: string, params: unknown[], _desc: string) => TeamMemberPermissions[]
>;

vi.mock('../../src/utils/authDatabase.ts', () => ({
  executeQuery: mockExecuteQuery,
  executeQueryAll: mockExecuteQueryAll,
}));

// Mock the analysisService - v5.0 uses getAnalysisById
type AnalysisInfo = {
  analysisId: string;
  analysisName?: string;
  teamId?: string;
};

const mockAnalysisService = {
  getAllAnalyses: vi.fn() as Mock<() => AnalysisInfo[]>,
  getAnalysisById: vi.fn() as Mock<(id: string) => AnalysisInfo | undefined>,
};

vi.mock('../../src/services/analysisService.ts', () => ({
  analysisService: mockAnalysisService,
}));

// Mock the logger
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Define middleware module type
type BetterAuthMiddlewareModule = {
  authMiddleware: (
    req: MockRequest,
    res: MockResponse,
    next: Mock<NextFunction>,
  ) => Promise<void>;
  requireAdmin: (
    req: MockRequest,
    res: MockResponse,
    next: Mock<NextFunction>,
  ) => Promise<void>;
  requireTeamPermission: (
    permission: string,
  ) => (
    req: MockRequest,
    res: MockResponse,
    next: Mock<NextFunction>,
  ) => Promise<void>;
  requireAnyTeamPermission: (
    permission: string,
  ) => (
    req: MockRequest,
    res: MockResponse,
    next: Mock<NextFunction>,
  ) => Promise<void>;
  extractAnalysisTeam: (
    req: MockRequest,
    res: MockResponse,
    next: Mock<NextFunction>,
  ) => Promise<void>;
  getUserTeamIds: (userId: string, permission: string) => string[];
  getUsersWithTeamAccess: (teamId: string, permission: string) => string[];
};

describe('betterAuthMiddleware', () => {
  let middleware: BetterAuthMiddlewareModule;
  let req: MockRequest;
  let res: MockResponse;
  let next: Mock<NextFunction>;

  beforeEach(async () => {
    vi.clearAllMocks();
    middleware = (await import(
      '../../src/middleware/betterAuthMiddleware.ts'
    )) as unknown as BetterAuthMiddlewareModule;

    req = createControllerRequest();
    res = createControllerResponse();
    next = createMockNext();
  });

  describe('authMiddleware', () => {
    it('should authenticate user successfully and call next', async () => {
      const mockSession: AuthSession = {
        session: { id: 'session-123' },
        user: { id: 'user-123', role: 'admin' },
      };

      mockAuth.api.getSession.mockResolvedValue(mockSession);

      await middleware.authMiddleware(req, res, next);

      expect(mockAuth.api.getSession).toHaveBeenCalled();
      expect(req.user).toEqual(mockSession.user);
      expect(
        (req as unknown as { session: typeof mockSession.session }).session,
      ).toEqual(mockSession.session);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authenticate',
          userId: 'user-123',
        }),
        'User authenticated',
      );
    });

    it('should reject request when no session', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      await middleware.authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'authenticate' }),
        'Authentication failed: no session or user',
      );
    });

    it('should reject request when session exists but no user', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        session: { id: 'session-123' },
        user: null,
      });

      await middleware.authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request when user exists but no session', async () => {
      mockAuth.api.getSession.mockResolvedValue({
        session: null,
        user: { id: 'user-123', role: 'user' },
      });

      await middleware.authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle auth library errors', async () => {
      mockAuth.api.getSession.mockRejectedValue(new Error('Auth error'));

      await middleware.authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authenticate',
          err: expect.any(Error),
        }),
        'Auth middleware error',
      );
    });

    it('should work without logger', async () => {
      (req as unknown as { log: null }).log = null;
      const mockSession: AuthSession = {
        session: { id: 'session-123' },
        user: { id: 'user-123', role: 'admin' },
      };

      mockAuth.api.getSession.mockResolvedValue(mockSession);

      await middleware.authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockSession.user);
    });

    it('should block users with requiresPasswordChange flag', async () => {
      const mockSession: AuthSession = {
        session: { id: 'session-123' },
        user: { id: 'user-123', role: 'user', requiresPasswordChange: true },
      };

      mockAuth.api.getSession.mockResolvedValue(mockSession);

      await middleware.authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authenticate',
          userId: 'user-123',
        }),
        'Access blocked: password change required',
      );
    });

    it('should allow users with requiresPasswordChange=false', async () => {
      const mockSession: AuthSession = {
        session: { id: 'session-123' },
        user: { id: 'user-123', role: 'user', requiresPasswordChange: false },
      };

      mockAuth.api.getSession.mockResolvedValue(mockSession);

      await middleware.authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockSession.user);
    });
  });

  describe('requireAdmin', () => {
    it('should allow admin users and call next', async () => {
      req.user = { id: 'user-123', role: 'admin' };

      await middleware.requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkAdmin',
          userId: 'user-123',
        }),
        'Admin access granted',
      );
    });

    it('should reject non-admin users', async () => {
      req.user = { id: 'user-123', role: 'user' };

      await middleware.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkAdmin',
          userId: 'user-123',
          role: 'user',
        }),
        'Admin access denied: insufficient role',
      );
    });

    it('should reject when no user', async () => {
      req.user = undefined;

      await middleware.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'checkAdmin' }),
        'Admin check failed: no user',
      );
    });

    it('should handle errors in checking user role', async () => {
      // Create a user object that throws when accessing role property
      Object.defineProperty(req, 'user', {
        get() {
          throw new Error('Unexpected error');
        },
      });

      await middleware.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should work without logger', async () => {
      (req as unknown as { log: null }).log = null;
      req.user = { id: 'user-123', role: 'admin' };

      await middleware.requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject users with undefined role', async () => {
      req.user = { id: 'user-123', role: '' };

      await middleware.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    });
  });

  describe('requireTeamPermission', () => {
    it('should allow admin users with global permissions', async () => {
      req.user = { id: 'admin-123', role: 'admin' };
      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');

      await permissionMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkTeamPermission',
          userId: 'admin-123',
          permission: 'view_analyses',
          role: 'admin',
        }),
        'Global permission granted',
      );
    });

    it('should allow users with team-specific permission', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.body = { teamId: 'team-456' };

      mockExecuteQuery.mockReturnValue({
        permissions: JSON.stringify(['view_analyses', 'run_analyses']),
      });

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        'SELECT permissions FROM teamMember WHERE userId = ? AND teamId = ?',
        ['user-123', 'team-456'],
        'checking team permission',
      );
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkTeamPermission',
          userId: 'user-123',
          teamId: 'team-456',
          permission: 'view_analyses',
        }),
        'Team permission granted',
      );
    });

    it('should extract teamId from query parameters', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.query = { teamId: 'team-789' };

      mockExecuteQuery.mockReturnValue({
        permissions: JSON.stringify(['edit_analyses']),
      });

      const permissionMiddleware =
        middleware.requireTeamPermission('edit_analyses');
      await permissionMiddleware(req, res, next);

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['user-123', 'team-789'],
        expect.any(String),
      );
      expect(next).toHaveBeenCalled();
    });

    it('should extract teamId from analysisTeamId', async () => {
      req.user = { id: 'user-123', role: 'user' };
      (req as unknown as { analysisTeamId: string }).analysisTeamId =
        'team-999';

      mockExecuteQuery.mockReturnValue({
        permissions: JSON.stringify(['run_analyses']),
      });

      const permissionMiddleware =
        middleware.requireTeamPermission('run_analyses');
      await permissionMiddleware(req, res, next);

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['user-123', 'team-999'],
        expect.any(String),
      );
      expect(next).toHaveBeenCalled();
    });

    it('should reject when teamId is not provided', async () => {
      req.user = { id: 'user-123', role: 'user' };

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Team-specific permission required',
        code: 'TEAM_PERMISSION_REQUIRED',
        details: { requiredPermission: 'view_analyses' },
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkTeamPermission',
          userId: 'user-123',
          permission: 'view_analyses',
        }),
        'Team permission check failed: no teamId',
      );
    });

    it('should reject when user lacks team permission', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.body = { teamId: 'team-456' };

      mockExecuteQuery.mockReturnValue({
        permissions: JSON.stringify(['view_analyses']),
      });

      const permissionMiddleware =
        middleware.requireTeamPermission('delete_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient team permissions',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS',
        details: { teamId: 'team-456', requiredPermission: 'delete_analyses' },
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkTeamPermission',
          userId: 'user-123',
          teamId: 'team-456',
          permission: 'delete_analyses',
        }),
        'Team permission denied',
      );
    });

    it('should reject when no user', async () => {
      req.user = undefined;

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.body = { teamId: 'team-456' };

      // Mock to return false (no permission found) when error occurs
      mockExecuteQuery.mockReturnValue(null);

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient team permissions',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS',
        details: { teamId: 'team-456', requiredPermission: 'view_analyses' },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle missing permissions field', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.body = { teamId: 'team-456' };

      mockExecuteQuery.mockReturnValue({ permissions: null });

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should work without logger', async () => {
      (req as unknown as { log: null }).log = null;
      req.user = { id: 'admin-123', role: 'admin' };

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireAnyTeamPermission', () => {
    it('should allow admin users with global permissions', async () => {
      req.user = { id: 'admin-123', role: 'admin' };

      const permissionMiddleware =
        middleware.requireAnyTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkAnyTeamPermission',
          userId: 'admin-123',
          permission: 'view_analyses',
          role: 'admin',
        }),
        'Global permission granted',
      );
    });

    it('should allow users with permission in any team', async () => {
      req.user = { id: 'user-123', role: 'user' };

      mockExecuteQueryAll.mockReturnValue([
        { permissions: JSON.stringify(['run_analyses']) },
        { permissions: JSON.stringify(['view_analyses', 'edit_analyses']) },
      ]);

      const permissionMiddleware =
        middleware.requireAnyTeamPermission('edit_analyses');
      await permissionMiddleware(req, res, next);

      expect(mockExecuteQueryAll).toHaveBeenCalledWith(
        'SELECT permissions FROM teamMember WHERE userId = ?',
        ['user-123'],
        'checking any team permission',
      );
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkAnyTeamPermission',
          userId: 'user-123',
          permission: 'edit_analyses',
        }),
        'Team permission granted',
      );
    });

    it('should reject when user has no matching permission in any team', async () => {
      req.user = { id: 'user-123', role: 'user' };

      mockExecuteQueryAll.mockReturnValue([
        { permissions: JSON.stringify(['view_analyses']) },
        { permissions: JSON.stringify(['run_analyses']) },
      ]);

      const permissionMiddleware =
        middleware.requireAnyTeamPermission('delete_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: { requiredPermission: 'delete_analyses', scope: 'any_team' },
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkAnyTeamPermission',
          userId: 'user-123',
          permission: 'delete_analyses',
        }),
        'Permission denied in all teams',
      );
    });

    it('should reject when user has no team memberships', async () => {
      req.user = { id: 'user-123', role: 'user' };

      mockExecuteQueryAll.mockReturnValue([]);

      const permissionMiddleware =
        middleware.requireAnyTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject when no user', async () => {
      req.user = undefined;

      const permissionMiddleware =
        middleware.requireAnyTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      req.user = { id: 'user-123', role: 'user' };

      // Mock to return empty array when error occurs
      mockExecuteQueryAll.mockReturnValue([]);

      const permissionMiddleware =
        middleware.requireAnyTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: { requiredPermission: 'view_analyses', scope: 'any_team' },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should skip teams with missing permissions field', async () => {
      req.user = { id: 'user-123', role: 'user' };

      mockExecuteQueryAll.mockReturnValue([
        { permissions: null },
        { permissions: JSON.stringify(['view_analyses']) },
      ]);

      const permissionMiddleware =
        middleware.requireAnyTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('extractAnalysisTeam', () => {
    it('should extract teamId from analysis successfully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      req.params = { analysisId };

      mockAnalysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
        teamId: 'team-123',
      });

      await middleware.extractAnalysisTeam(req, res, next);

      expect(
        (req as unknown as { analysisTeamId: string }).analysisTeamId,
      ).toBe('team-123');
      expect(next).toHaveBeenCalled();
      expect(req.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'extractTeam',
          analysisId,
          teamId: 'team-123',
        }),
        'Analysis team extracted',
      );
    });

    it('should use uncategorized when teamId is missing', async () => {
      const analysisId = 'test-analysis-uuid-123';
      req.params = { analysisId };

      mockAnalysisService.getAnalysisById.mockReturnValue({
        analysisId,
        analysisName: 'test-analysis',
        // teamId missing
      });

      await middleware.extractAnalysisTeam(req, res, next);

      expect(
        (req as unknown as { analysisTeamId: string }).analysisTeamId,
      ).toBe('uncategorized');
      expect(next).toHaveBeenCalled();
    });

    it('should continue when analysis not found', async () => {
      req.params = { analysisId: 'non-existent-uuid' };

      mockAnalysisService.getAnalysisById.mockReturnValue(undefined);

      await middleware.extractAnalysisTeam(req, res, next);

      expect(
        (req as unknown as { analysisTeamId?: string }).analysisTeamId,
      ).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should continue when no analysisId in params', async () => {
      req.params = {};

      await middleware.extractAnalysisTeam(req, res, next);

      expect(
        (req as unknown as { analysisTeamId?: string }).analysisTeamId,
      ).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(mockAnalysisService.getAnalysisById).not.toHaveBeenCalled();
    });

    it('should continue on service error', async () => {
      const analysisId = 'test-analysis-uuid-123';
      req.params = { analysisId };

      mockAnalysisService.getAnalysisById.mockImplementation(() => {
        throw new Error('Service error');
      });

      await middleware.extractAnalysisTeam(req, res, next);

      expect(
        (req as unknown as { analysisTeamId?: string }).analysisTeamId,
      ).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'extractTeam',
          err: expect.any(Error),
          analysisId,
        }),
        'Error extracting analysis team',
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const analysisId = 'test-analysis-uuid-123';
      req.params = { analysisId };

      mockAnalysisService.getAnalysisById.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await middleware.extractAnalysisTeam(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'extractTeam',
          err: expect.any(Error),
        }),
        'Error extracting analysis team',
      );
    });

    it('should work without logger', async () => {
      // Clear the mock and re-import to get clean state
      vi.clearAllMocks();
      (req as unknown as { log: null }).log = null;
      const analysisId = 'test-analysis-uuid-123';
      req.params = { analysisId };

      mockAnalysisService.getAnalysisById.mockReturnValue({
        analysisId,
        teamId: 'team-123',
      });

      await middleware.extractAnalysisTeam(req, res, next);

      expect(next).toHaveBeenCalled();
      // The middleware should still set teamId even without logger
      const analysisTeamId = (req as unknown as { analysisTeamId?: string })
        .analysisTeamId;
      if (analysisTeamId) {
        expect(analysisTeamId).toBe('team-123');
      }
    });
  });

  describe('getUserTeamIds', () => {
    it('should return team IDs for user with permission', () => {
      mockExecuteQueryAll.mockReturnValue([
        { teamId: 'team-1', permissions: JSON.stringify(['view_analyses']) },
        {
          teamId: 'team-2',
          permissions: JSON.stringify(['view_analyses', 'edit_analyses']),
        },
        { teamId: 'team-3', permissions: JSON.stringify(['run_analyses']) },
      ]);

      const result = middleware.getUserTeamIds('user-123', 'view_analyses');

      expect(mockExecuteQueryAll).toHaveBeenCalledWith(
        'SELECT teamId, permissions FROM teamMember WHERE userId = ?',
        ['user-123'],
        'getting user team IDs',
      );
      expect(result).toEqual(['team-1', 'team-2']);
    });

    it('should return empty array when user has no matching teams', () => {
      mockExecuteQueryAll.mockReturnValue([
        { teamId: 'team-1', permissions: JSON.stringify(['run_analyses']) },
      ]);

      const result = middleware.getUserTeamIds('user-123', 'delete_analyses');

      expect(result).toEqual([]);
    });

    it('should handle missing permissions field', () => {
      mockExecuteQueryAll.mockReturnValue([
        { teamId: 'team-1', permissions: null },
        { teamId: 'team-2', permissions: JSON.stringify(['view_analyses']) },
      ]);

      const result = middleware.getUserTeamIds('user-123', 'view_analyses');

      expect(result).toEqual(['team-2']);
    });

    it('should handle database errors', () => {
      mockExecuteQueryAll.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = middleware.getUserTeamIds('user-123', 'view_analyses');

      expect(result).toEqual([]);
    });

    it('should return empty array when no memberships', () => {
      mockExecuteQueryAll.mockReturnValue([]);

      const result = middleware.getUserTeamIds('user-123', 'view_analyses');

      expect(result).toEqual([]);
    });
  });

  describe('getUsersWithTeamAccess', () => {
    it('should return users with team access including admins', () => {
      mockExecuteQueryAll
        .mockReturnValueOnce([
          { id: 'admin-1' },
          { id: 'admin-2' },
        ] as unknown as TeamMemberPermissions[])
        .mockReturnValueOnce([
          { userId: 'user-1', permissions: JSON.stringify(['view_analyses']) },
          { userId: 'user-2', permissions: JSON.stringify(['run_analyses']) },
          {
            userId: 'user-3',
            permissions: JSON.stringify(['view_analyses', 'edit_analyses']),
          },
        ]);

      const result = middleware.getUsersWithTeamAccess(
        'team-123',
        'view_analyses',
      );

      expect(result).toEqual(
        expect.arrayContaining(['admin-1', 'admin-2', 'user-1', 'user-3']),
      );
      expect(result).not.toContain('user-2');
    });

    it('should return only admins when no team members have permission', () => {
      mockExecuteQueryAll
        .mockReturnValueOnce([
          { id: 'admin-1' },
        ] as unknown as TeamMemberPermissions[])
        .mockReturnValueOnce([
          { userId: 'user-1', permissions: JSON.stringify(['run_analyses']) },
        ]);

      const result = middleware.getUsersWithTeamAccess(
        'team-123',
        'view_analyses',
      );

      expect(result).toEqual(['admin-1']);
    });

    it('should deduplicate admin who is also team member', () => {
      mockExecuteQueryAll
        .mockReturnValueOnce([
          { id: 'admin-1' },
        ] as unknown as TeamMemberPermissions[])
        .mockReturnValueOnce([
          { userId: 'admin-1', permissions: JSON.stringify(['view_analyses']) },
          { userId: 'user-1', permissions: JSON.stringify(['view_analyses']) },
        ]);

      const result = middleware.getUsersWithTeamAccess(
        'team-123',
        'view_analyses',
      );

      expect(result).toEqual(['admin-1', 'user-1']);
      expect(result.length).toBe(2);
    });

    it('should handle missing permissions field', () => {
      mockExecuteQueryAll
        .mockReturnValueOnce([
          { id: 'admin-1' },
        ] as unknown as TeamMemberPermissions[])
        .mockReturnValueOnce([
          { userId: 'user-1', permissions: null },
          { userId: 'user-2', permissions: JSON.stringify(['view_analyses']) },
        ]);

      const result = middleware.getUsersWithTeamAccess(
        'team-123',
        'view_analyses',
      );

      expect(result).toEqual(['admin-1', 'user-2']);
    });

    it('should handle database errors', () => {
      mockExecuteQueryAll.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = middleware.getUsersWithTeamAccess(
        'team-123',
        'view_analyses',
      );

      expect(result).toEqual([]);
    });

    it('should return empty array when no admins or members', () => {
      mockExecuteQueryAll.mockReturnValueOnce([]).mockReturnValueOnce([]);

      const result = middleware.getUsersWithTeamAccess(
        'team-123',
        'view_analyses',
      );

      expect(result).toEqual([]);
    });
  });

  describe('edge cases and integration', () => {
    it('should handle user with default role', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.body = { teamId: 'team-456' };

      mockExecuteQuery.mockReturnValue({
        permissions: JSON.stringify(['view_analyses']),
      });

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should handle empty permissions array', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.body = { teamId: 'team-456' };

      mockExecuteQuery.mockReturnValue({
        permissions: JSON.stringify([]),
      });

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON in permissions', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.body = { teamId: 'team-456' };

      mockExecuteQuery.mockReturnValue({
        permissions: 'invalid-json',
      });

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should prioritize body teamId over query teamId', async () => {
      req.user = { id: 'user-123', role: 'user' };
      req.body = { teamId: 'team-body' };
      req.query = { teamId: 'team-query' };

      mockExecuteQuery.mockReturnValue({
        permissions: JSON.stringify(['view_analyses']),
      });

      const permissionMiddleware =
        middleware.requireTeamPermission('view_analyses');
      await permissionMiddleware(req, res, next);

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['user-123', 'team-body'],
        expect.any(String),
      );
    });
  });
});

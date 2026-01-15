import type { Response, NextFunction, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { auth } from '../lib/auth.ts';
import { fromNodeHeaders } from 'better-auth/node';
import { executeQuery, executeQueryAll } from '../utils/authDatabase.ts';
import { createChildLogger } from '../utils/logging/logger.ts';
import { getAnalysisService } from '../utils/lazyLoader.ts';
import type {
  AuthUser,
  AuthSession,
  AuthenticatingRequest,
} from '../types/index.ts';

const moduleLogger = createChildLogger('auth-middleware');

/** Team membership from database */
type TeamMembership = {
  teamId: string;
  permissions: string | null;
};

/** Permission-only row */
type PermissionRow = {
  permissions: string | null;
};

/** User ID row */
type UserIdRow = {
  id: string;
};

// Authentication middleware using Better Auth
export const authMiddleware: RequestHandler = async (
  req: AuthenticatingRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const logger =
    req.log?.child({ middleware: 'authMiddleware' }) || moduleLogger;

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.session || !session?.user) {
      logger.warn(
        { action: 'authenticate' },
        'Authentication failed: no session or user',
      );
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Block users who need to change their password from accessing protected resources
    const user = session.user as AuthUser;
    if (user.requiresPasswordChange) {
      logger.warn(
        { action: 'authenticate', userId: user.id },
        'Access blocked: password change required',
      );
      res.status(403).json({
        error: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
      return;
    }

    // Attach user and session to request
    req.user = user;
    req.session = session.session as AuthSession;

    logger.info(
      { action: 'authenticate', userId: user.id },
      'User authenticated',
    );
    next();
  } catch (error) {
    logger.error(
      { action: 'authenticate', err: error },
      'Auth middleware error',
    );
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Admin role requirement middleware
export const requireAdmin: RequestHandler = async (
  req: AuthenticatingRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const logger = req.log?.child({ middleware: 'requireAdmin' }) || moduleLogger;

  try {
    if (!req.user) {
      logger.warn({ action: 'checkAdmin' }, 'Admin check failed: no user');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (req.user.role !== 'admin') {
      logger.warn(
        { action: 'checkAdmin', userId: req.user.id, role: req.user.role },
        'Admin access denied: insufficient role',
      );
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    logger.info(
      { action: 'checkAdmin', userId: req.user.id },
      'Admin access granted',
    );
    next();
  } catch (error) {
    logger.error(
      { action: 'checkAdmin', err: error },
      'Admin middleware error',
    );
    res.status(403).json({ error: 'Access denied' });
  }
};

// Global permission mapping based on roles
// Only admin role has global permissions, regular users get team-specific permissions
const globalRolePermissions: Record<string, string[]> = {
  admin: [
    'upload_analyses',
    'view_analyses',
    'run_analyses',
    'edit_analyses',
    'delete_analyses',
    'download_analyses',
    'manage_users',
    'manage_departments',
  ],
};

// Helper function to check if user has permission for a specific team
function hasTeamPermission(
  userId: string,
  teamId: string,
  permission: string,
  logger: Logger = moduleLogger,
): boolean {
  try {
    const membership = executeQuery<PermissionRow>(
      'SELECT permissions FROM teamMember WHERE userId = ? AND teamId = ?',
      [userId, teamId],
      'checking team permission',
    );

    if (membership?.permissions) {
      const permissions = JSON.parse(membership.permissions) as string[];
      return permissions.includes(permission);
    }
    return false;
  } catch (error) {
    logger.error(
      { action: 'hasTeamPermission', err: error, userId, teamId, permission },
      'Error checking team permission',
    );
    return false;
  }
}

// Helper function to check if user has permission in any team
function hasAnyTeamPermission(
  userId: string,
  permission: string,
  logger: Logger = moduleLogger,
): boolean {
  try {
    const memberships = executeQueryAll<PermissionRow>(
      'SELECT permissions FROM teamMember WHERE userId = ?',
      [userId],
      'checking any team permission',
    );

    for (const membership of memberships) {
      if (membership.permissions) {
        const permissions = JSON.parse(membership.permissions) as string[];
        if (permissions.includes(permission)) {
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    logger.error(
      { action: 'hasAnyTeamPermission', err: error, userId, permission },
      'Error checking any team permission',
    );
    return false;
  }
}

// Helper function to get user's team IDs with specific permission
export function getUserTeamIds(
  userId: string,
  permission: string,
  logger: Logger = moduleLogger,
): string[] {
  try {
    const memberships = executeQueryAll<TeamMembership>(
      'SELECT teamId, permissions FROM teamMember WHERE userId = ?',
      [userId],
      'getting user team IDs',
    );

    return memberships
      .filter((membership) => {
        if (!membership.permissions) return false;
        const permissions = JSON.parse(membership.permissions) as string[];
        return permissions.includes(permission);
      })
      .map((membership) => membership.teamId);
  } catch (error) {
    logger.error(
      { action: 'getUserTeamIds', err: error, userId, permission },
      'Error getting user team IDs',
    );
    return [];
  }
}

// Helper function to get all users who have access to a specific team with a given permission
export function getUsersWithTeamAccess(
  teamId: string,
  permission: string,
  logger: Logger = moduleLogger,
): string[] {
  try {
    // Get all admin users (they have global access)
    const adminUsers = executeQueryAll<UserIdRow>(
      'SELECT id FROM user WHERE role = ?',
      ['admin'],
      'getting admin users',
    );

    // Get users with specific team membership and permission
    const teamMembers = executeQueryAll<{
      userId: string;
      permissions: string | null;
    }>(
      'SELECT userId, permissions FROM teamMember WHERE teamId = ?',
      [teamId],
      'getting team members',
    );

    const authorizedUsers = new Set<string>();

    // Add all admin users
    adminUsers.forEach((user) => {
      authorizedUsers.add(user.id);
    });

    // Add team members with the required permission
    teamMembers.forEach((membership) => {
      if (membership.permissions) {
        const permissions = JSON.parse(membership.permissions) as string[];
        if (permissions.includes(permission)) {
          authorizedUsers.add(membership.userId);
        }
      }
    });

    return Array.from(authorizedUsers);
  } catch (error) {
    logger.error(
      { action: 'getUsersWithTeamAccess', err: error, teamId, permission },
      'Error getting users with team access',
    );
    return [];
  }
}

// Middleware to extract team information from analysis and add to request
export const extractAnalysisTeam: RequestHandler = async (
  req: AuthenticatingRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const logger =
    req.log?.child({ middleware: 'extractAnalysisTeam' }) || moduleLogger;

  try {
    const analysisId = req.params?.analysisId;

    if (analysisId) {
      // Get analysis service via lazy loader to avoid circular dependencies
      const analysisService = await getAnalysisService();

      try {
        const analysis = analysisService.getAnalysisById(analysisId);

        if (analysis) {
          req.analysisTeamId = analysis.teamId || 'uncategorized';
          logger.info(
            { action: 'extractTeam', analysisId, teamId: req.analysisTeamId },
            'Analysis team extracted',
          );
        }
      } catch (error) {
        logger.warn(
          { action: 'extractTeam', err: error, analysisId },
          'Error extracting analysis team',
        );
        // Continue without team info - let permission middleware handle it
      }
    }

    next();
  } catch (error) {
    logger.error(
      { action: 'extractTeam', err: error },
      'Error in extractAnalysisTeam middleware',
    );
    next(); // Continue without team info
  }
};

// Middleware for team-specific permission checks
export const requireTeamPermission = (permission: string): RequestHandler => {
  return async (
    req: AuthenticatingRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const logger =
      req.log?.child({ middleware: 'requireTeamPermission' }) || moduleLogger;

    try {
      if (!req.user) {
        logger.warn(
          { action: 'checkTeamPermission', permission },
          'No user found',
        );
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check global admin permissions first
      const globalRole = req.user.role || 'user';
      const globalPermissions = globalRolePermissions[globalRole] || [];

      if (globalPermissions.includes(permission)) {
        logger.info(
          {
            action: 'checkTeamPermission',
            userId: req.user.id,
            permission,
            role: globalRole,
          },
          'Global permission granted',
        );
        next();
        return;
      }

      // Extract team ID from various sources
      const teamId =
        (req.body as { teamId?: string })?.teamId ||
        (req.query as { teamId?: string })?.teamId ||
        req.analysisTeamId;

      if (!teamId) {
        logger.warn(
          { action: 'checkTeamPermission', userId: req.user.id, permission },
          'Team permission check failed: no teamId',
        );
        res.status(403).json({
          error: 'Team-specific permission required',
          code: 'TEAM_PERMISSION_REQUIRED',
          details: { requiredPermission: permission },
        });
        return;
      }

      // Check team-specific permission
      if (hasTeamPermission(req.user.id, teamId, permission, logger)) {
        logger.info(
          {
            action: 'checkTeamPermission',
            userId: req.user.id,
            teamId,
            permission,
          },
          'Team permission granted',
        );
        next();
        return;
      }

      logger.warn(
        {
          action: 'checkTeamPermission',
          userId: req.user.id,
          teamId,
          permission,
        },
        'Team permission denied',
      );
      res.status(403).json({
        error: 'Insufficient team permissions',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS',
        details: { teamId, requiredPermission: permission },
      });
    } catch (error) {
      logger.error(
        { action: 'checkTeamPermission', err: error, permission },
        'Team permission middleware error',
      );
      res.status(403).json({ error: 'Access denied' });
    }
  };
};

// Middleware that allows if user has permission in ANY team (for general operations)
export const requireAnyTeamPermission = (
  permission: string,
): RequestHandler => {
  return async (
    req: AuthenticatingRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const logger =
      req.log?.child({ middleware: 'requireAnyTeamPermission' }) ||
      moduleLogger;

    try {
      if (!req.user) {
        logger.warn(
          { action: 'checkAnyTeamPermission', permission },
          'No user found',
        );
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check global admin permissions first
      const globalRole = req.user.role || 'user';
      const globalPermissions = globalRolePermissions[globalRole] || [];

      if (globalPermissions.includes(permission)) {
        logger.info(
          {
            action: 'checkAnyTeamPermission',
            userId: req.user.id,
            permission,
            role: globalRole,
          },
          'Global permission granted',
        );
        next();
        return;
      }

      // Check if user has the permission in ANY of their teams
      if (hasAnyTeamPermission(req.user.id, permission, logger)) {
        logger.info(
          { action: 'checkAnyTeamPermission', userId: req.user.id, permission },
          'Team permission granted',
        );
        next();
        return;
      }

      logger.warn(
        { action: 'checkAnyTeamPermission', userId: req.user.id, permission },
        'Permission denied in all teams',
      );
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: { requiredPermission: permission, scope: 'any_team' },
      });
    } catch (error) {
      logger.error(
        { action: 'checkAnyTeamPermission', err: error, permission },
        'Any team permission middleware error',
      );
      res.status(403).json({ error: 'Access denied' });
    }
  };
};

// Middleware to require user is accessing their own resource or is an admin
export const requireSelfOrAdmin: RequestHandler = async (
  req: AuthenticatingRequest & { params: { userId?: string } },
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const logger =
    req.log?.child({ middleware: 'requireSelfOrAdmin' }) || moduleLogger;

  try {
    if (!req.user) {
      logger.warn({ action: 'checkSelfOrAdmin' }, 'No user found');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const targetUserId = req.params.userId;
    const isOwnResource = req.user.id === targetUserId;
    const isAdmin = req.user.role === 'admin';

    if (isOwnResource || isAdmin) {
      logger.info(
        {
          action: 'checkSelfOrAdmin',
          userId: req.user.id,
          targetUserId,
          isOwnResource,
          isAdmin,
        },
        'Access granted',
      );
      next();
      return;
    }

    logger.warn(
      {
        action: 'checkSelfOrAdmin',
        userId: req.user.id,
        targetUserId,
      },
      'Access denied: user can only access their own resource',
    );
    res
      .status(403)
      .json({ error: 'Access denied: you can only access your own resource' });
  } catch (error) {
    logger.error(
      { action: 'checkSelfOrAdmin', err: error },
      'requireSelfOrAdmin middleware error',
    );
    res.status(403).json({ error: 'Access denied' });
  }
};

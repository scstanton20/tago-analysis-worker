import { auth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { executeQuery, executeQueryAll } from '../utils/authDatabase.js';

// Authentication middleware using Better Auth
export const authMiddleware = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.session || !session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Attach user and session to request
    // eslint-disable-next-line require-atomic-updates
    req.user = session.user;
    // eslint-disable-next-line require-atomic-updates
    req.session = session.session;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// Admin role requirement middleware
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(403).json({ error: 'Access denied' });
  }
};

// Global permission mapping based on roles
// Only admin role has global permissions, regular users get team-specific permissions
const globalRolePermissions = {
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
function hasTeamPermission(userId, teamId, permission) {
  try {
    const membership = executeQuery(
      'SELECT permissions FROM teamMember WHERE userId = ? AND teamId = ?',
      [userId, teamId],
      'checking team permission',
    );

    if (membership && membership.permissions) {
      const permissions = JSON.parse(membership.permissions);
      return permissions.includes(permission);
    }
    return false;
  } catch (error) {
    console.error('Error checking team permission:', error);
    return false;
  }
}

// Helper function to check if user has permission in any team
function hasAnyTeamPermission(userId, permission) {
  try {
    const memberships = executeQueryAll(
      'SELECT permissions FROM teamMember WHERE userId = ?',
      [userId],
      'checking any team permission',
    );

    for (const membership of memberships) {
      if (membership.permissions) {
        const permissions = JSON.parse(membership.permissions);
        if (permissions.includes(permission)) {
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking any team permission:', error);
    return false;
  }
}

// Helper function to get user's team IDs with specific permission
export function getUserTeamIds(userId, permission) {
  try {
    const memberships = executeQueryAll(
      'SELECT teamId, permissions FROM teamMember WHERE userId = ?',
      [userId],
      'getting user team IDs',
    );

    return memberships
      .filter((membership) => {
        if (!membership.permissions) return false;
        const permissions = JSON.parse(membership.permissions);
        return permissions.includes(permission);
      })
      .map((membership) => membership.teamId);
  } catch (error) {
    console.error('Error getting user team IDs:', error);
    return [];
  }
}

// Helper function to get all users who have access to a specific team with a given permission
export function getUsersWithTeamAccess(teamId, permission) {
  try {
    // Get all admin users (they have global access)
    const adminUsers = executeQueryAll(
      'SELECT id FROM user WHERE role = ?',
      ['admin'],
      'getting admin users',
    );

    // Get users with specific team membership and permission
    const teamMembers = executeQueryAll(
      'SELECT userId, permissions FROM teamMember WHERE teamId = ?',
      [teamId],
      'getting team members',
    );

    const authorizedUsers = new Set();

    // Add all admin users
    adminUsers.forEach((user) => {
      authorizedUsers.add(user.id);
    });

    // Add team members with the required permission
    teamMembers.forEach((membership) => {
      if (membership.permissions) {
        const permissions = JSON.parse(membership.permissions);
        if (permissions.includes(permission)) {
          authorizedUsers.add(membership.userId);
        }
      }
    });

    return Array.from(authorizedUsers);
  } catch (error) {
    console.error('Error getting users with team access:', error);
    return [];
  }
}

// Middleware to extract team information from analysis and add to request
export const extractAnalysisTeam = async (req, _res, next) => {
  try {
    const fileName = req.params?.fileName;

    if (fileName) {
      // Import analysis service to get analysis metadata
      const { analysisService } = await import(
        '../services/analysisService.js'
      );

      try {
        const analyses = await analysisService.getAllAnalyses();
        const analysis = analyses[fileName];

        if (analysis) {
          // eslint-disable-next-line require-atomic-updates
          req.analysisTeamId = analysis.teamId || 'uncategorized';
        }
      } catch (error) {
        console.warn('Error extracting analysis team:', error);
        // Continue without team info - let permission middleware handle it
      }
    }

    next();
  } catch (error) {
    console.error('Error in extractAnalysisTeam middleware:', error);
    next(); // Continue without team info
  }
};

// Middleware for team-specific permission checks
export const requireTeamPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check global admin permissions first
      const globalRole = req.user.role || 'user';
      const globalPermissions = globalRolePermissions[globalRole] || [];

      if (globalPermissions.includes(permission)) {
        return next(); // Global permission granted
      }

      // Extract team ID from various sources
      const teamId =
        req.body?.teamId || req.query?.teamId || req.analysisTeamId;

      if (!teamId) {
        return res.status(403).json({
          error: `Team-specific permission required. Permission: ${permission}`,
        });
      }

      // Check team-specific permission
      if (hasTeamPermission(req.user.id, teamId, permission)) {
        return next();
      }

      return res.status(403).json({
        error: `Insufficient permissions for team ${teamId}. Required: ${permission}`,
      });
    } catch (error) {
      console.error('Team permission middleware error:', error);
      return res.status(403).json({ error: 'Access denied' });
    }
  };
};

// Middleware that allows if user has permission in ANY team (for general operations)
export const requireAnyTeamPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check global admin permissions first
      const globalRole = req.user.role || 'user';
      const globalPermissions = globalRolePermissions[globalRole] || [];

      if (globalPermissions.includes(permission)) {
        return next(); // Global permission granted
      }

      // Check if user has the permission in ANY of their teams
      if (hasAnyTeamPermission(req.user.id, permission)) {
        return next();
      }

      return res.status(403).json({
        error: `Insufficient permissions. Required: ${permission} in at least one team`,
      });
    } catch (error) {
      console.error('Any team permission middleware error:', error);
      return res.status(403).json({ error: 'Access denied' });
    }
  };
};

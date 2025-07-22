import { auth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

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

// Generic permission check middleware with team-specific validation
export const requirePermission = (permission, options = {}) => {
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
      let teamId = options.teamId;

      // If no team ID provided in options, try to get it from request
      if (!teamId) {
        // Try getting from request body, params, or query
        teamId = req.body?.teamId || req.params?.teamId || req.query?.teamId;

        // For analysis-specific operations, get team from analysis
        // Note: Team extraction is handled by extractAnalysisTeam middleware
        // which sets req.analysisTeamId
      }

      // If no team context and not admin, deny access
      if (!teamId) {
        return res.status(403).json({
          error: `Team-specific permission required. Permission: ${permission}`,
        });
      }

      // Check team-specific permissions from database
      try {
        const Database = (await import('better-sqlite3')).default;
        const path = (await import('path')).default;
        const config = (await import('../config/default.js')).default;

        const dbPath = path.join(config.storage.base, 'auth.db');
        const db = new Database(dbPath, { readonly: true });

        try {
          // Get user's permissions for the specific team
          const membership = db
            .prepare(
              `
              SELECT m.permissions
              FROM member m
              WHERE m.userId = ? AND m.teamId = ?
            `,
            )
            .get(req.user.id, teamId);

          if (membership && membership.permissions) {
            const permissions = JSON.parse(membership.permissions);
            if (permissions.includes(permission)) {
              return next(); // Team-specific permission granted
            }
          }
        } finally {
          db.close();
        }
      } catch (dbError) {
        console.error('Error checking team permissions:', dbError);
        // Continue to deny access if database check fails
      }

      return res.status(403).json({
        error: `Insufficient permissions for team ${teamId}. Required: ${permission}`,
      });
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(403).json({ error: 'Access denied' });
    }
  };
};

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

// Helper function to create team-aware permission middleware
export const requireTeamPermission = (permission) => {
  return async (req, res, next) => {
    // Extract team ID from various sources
    const teamId = req.body?.teamId || req.query?.teamId || req.analysisTeamId;

    // Use the updated requirePermission with team context
    const permissionMiddleware = requirePermission(permission, { teamId });
    return permissionMiddleware(req, res, next);
  };
};

// Permission middleware that allows if user has permission in ANY team (for general operations)
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
      try {
        const Database = (await import('better-sqlite3')).default;
        const path = (await import('path')).default;
        const config = (await import('../config/default.js')).default;

        const dbPath = path.join(config.storage.base, 'auth.db');
        const db = new Database(dbPath, { readonly: true });

        try {
          // Get user's team memberships with permissions
          const memberships = db
            .prepare(
              `
              SELECT m.permissions
              FROM member m
              WHERE m.userId = ?
            `,
            )
            .all(req.user.id);

          // Check if user has the required permission in any of their teams
          for (const membership of memberships) {
            if (membership.permissions) {
              const permissions = JSON.parse(membership.permissions);
              if (permissions.includes(permission)) {
                return next(); // Permission found in at least one team
              }
            }
          }
        } finally {
          db.close();
        }
      } catch (dbError) {
        console.error('Error checking team permissions:', dbError);
        // Continue to deny access if database check fails
      }

      return res.status(403).json({
        error: `Insufficient permissions. Required: ${permission} in at least one team`,
      });
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(403).json({ error: 'Access denied' });
    }
  };
};

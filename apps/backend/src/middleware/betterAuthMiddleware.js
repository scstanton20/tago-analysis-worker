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
  analyst: [
    'upload_analyses',
    'view_analyses',
    'run_analyses',
    'edit_analyses',
    'download_analyses',
  ],
  operator: ['view_analyses', 'run_analyses'],
  viewer: ['view_analyses'],
};

// Generic permission check middleware with department support
export const requirePermission = (permission, departmentId = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check global admin permissions first
      const globalRole = req.user.role || 'viewer';
      const globalPermissions = globalRolePermissions[globalRole] || [];

      if (globalPermissions.includes(permission)) {
        return next(); // Global permission granted
      }

      // Check team-specific permissions from database
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
                return next(); // Team permission granted
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
        error: `Insufficient permissions. Required: ${permission}${departmentId ? ` in department ${departmentId}` : ''}`,
      });
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(403).json({ error: 'Access denied' });
    }
  };
};

// Department access check middleware
export const requireDepartmentAccess = (departmentId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Global admins have access to all departments
      if (req.user.role === 'admin') {
        return next();
      }

      // Check if user is a member of the department
      // For now, we'll implement a simplified version until we set up organizations
      // TODO: Implement proper organization/department membership check
      const userOrganizations = [];

      const hasAccess = userOrganizations.some(
        (org) => org.organization.id === departmentId,
      );

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied to this department',
        });
      }

      next();
    } catch (error) {
      console.error('Department access middleware error:', error);
      return res.status(403).json({ error: 'Access denied' });
    }
  };
};

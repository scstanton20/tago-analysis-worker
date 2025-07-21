import { auth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

// Password change requirement check for better-auth hooks
export const checkPasswordChangeRequired = async (ctx) => {
  console.log(`🔍 Hook triggered for path: ${ctx.path}`);

  // Skip auth endpoints
  if (ctx.path?.includes('/auth/')) {
    console.log(`⏭️ Skipping auth endpoint: ${ctx.path}`);
    return;
  }

  // Get user from session context - check multiple possible locations
  const user = ctx.context?.user || ctx.user || ctx.context?.session?.user;

  console.log(`👤 User in hook:`, {
    hasUser: !!user,
    email: user?.email,
    requiresPasswordChange: user?.requiresPasswordChange,
    userKeys: user ? Object.keys(user) : [],
    contextKeys: ctx.context ? Object.keys(ctx.context) : [],
  });

  // Check if user requires password change before any non-auth operation
  if (user && user.requiresPasswordChange === true) {
    console.log(
      `🚨 User ${user.email} requires password change - returning 428`,
    );

    // Return a Response directly since we need custom status 428
    return new Response(
      JSON.stringify({
        error: 'Password change required',
        requiresPasswordChange: true,
        username: user.username || user.email,
      }),
      {
        status: 428,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  console.log(`✅ No password change required, continuing...`);
};

// Authentication middleware using Better Auth
export const authMiddleware = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.session || !session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Skip password change check for endpoints that handle password changes
    const passwordChangeEndpoints = [
      '/set-initial-password',
      '/clear-password-change',
    ];

    const isPasswordChangeEndpoint = passwordChangeEndpoints.some((endpoint) =>
      req.path.includes(endpoint),
    );

    if (!isPasswordChangeEndpoint) {
      // Always check database for password change requirement since better-auth doesn't provide custom fields reliably
      let requiresPasswordChange = false;
      try {
        const Database = (await import('better-sqlite3')).default;
        const path = (await import('path')).default;
        const config = (await import('../config/default.js')).default;

        const dbPath = path.join(config.storage.base, 'auth.db');
        const db = new Database(dbPath, { readonly: true });

        const userData = db
          .prepare('SELECT requiresPasswordChange FROM user WHERE id = ?')
          .get(session.user.id);
        db.close();

        requiresPasswordChange = userData?.requiresPasswordChange === 1;
      } catch (dbError) {
        console.warn(
          'Could not check database for password change requirement:',
          dbError,
        );
        requiresPasswordChange = false; // Default to false if we can't check
      }

      if (requiresPasswordChange) {
        console.log(
          `🚨 Express middleware: User ${session.user.email} requires password change - returning 428`,
        );

        return res.status(428).json({
          error: 'Password change required',
          requiresPasswordChange: true,
          username: session.user.username || session.user.email,
        });
      }
    } else {
      console.log(
        `⏭️ Allowing password change endpoint: ${req.path} for user ${session.user.email}`,
      );
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
